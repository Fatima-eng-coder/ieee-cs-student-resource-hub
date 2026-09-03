import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarPlus, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import MemberLinksEditor from '@/components/admin/MemberLinksEditor';
import { memberLinks } from '@/lib/memberLinks';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import Avatar from '@/components/ui/Avatar';
import AvatarCropper from '@/components/ui/AvatarCropper';
import { PLACEHOLDER_PHOTO } from '@/data/hierarchy';
import { adminAuthService } from '@/services/adminAuthService';
import {
  hierarchyService,
  indexRoles,
  sortMembers,
  titleForRole,
  type HierarchyMemberInput,
  type HierarchyMemberRecord,
  type HierarchyTermRecord,
} from '@/services/hierarchyService';
import type { HierarchyRole } from '@/types';

/** A member being edited. `id` is empty until it has been saved for the first time. */
interface MemberDraft extends HierarchyMemberInput {
  id: string;
  photoPath: string | null;
}

/** "FA26" → "Fall 2026". Falls back to the raw code for anything unrecognised. */
function labelForTerm(term: string): string {
  const match = /^(FA|SP|SU)(\d{2})$/i.exec(term.trim());
  if (!match) return term.trim();
  const season = { fa: 'Fall', sp: 'Spring', su: 'Summer' }[match[1].toLowerCase()] ?? match[1];
  return `${season} 20${match[2]}`;
}

/**
 * The term that follows this one, used to prefill the "start a new term" field.
 *
 * Accepts every season labelForTerm knows, summer included — a council that runs a summer
 * session would otherwise open the drawer with an empty code and no suggestion at all. Both
 * spring and summer hand over to autumn of the same year; only autumn rolls the year.
 */
function nextTermCode(term: string): string {
  const match = /^(FA|SP|SU)(\d{2})$/i.exec(term.trim());
  if (!match) return '';
  const [, season, year] = match;
  return season.toUpperCase() === 'FA' ? `SP${String((Number(year) + 1) % 100).padStart(2, '0')}` : `FA${year}`;
}

/**
 * The two seasons the society actually elects a council for.
 *
 * SU is not offered even though labelForTerm and nextTermCode still understand it: no summer
 * council has ever existed, and a dropdown that can produce one invites a term nobody will
 * fill. A SU term already in the database keeps working everywhere — it labels itself, it gets
 * a tab, its roster is editable — it simply cannot be created from here.
 */
const SEASONS = [
  { code: 'FA', name: 'Fall' },
  { code: 'SP', name: 'Spring' },
] as const;

type Season = (typeof SEASONS)[number]['code'];

/** "FA" + 2026 → "FA26". The two digits are the years 2000-2099, as labelForTerm reads them. */
const termCodeFor = (season: Season, year: number) => `${season}${String(year % 100).padStart(2, '0')}`;

/**
 * A term code as a number, so two of them can be compared. Spring precedes Fall in a year.
 *
 * Null for anything the dropdowns cannot express — a hand-entered SU term, or a code from
 * before this form existed. Callers treat null as "outside the ordering" rather than as zero,
 * which would sort such a term before every real one.
 */
function termOrdinal(term: string): number | null {
  const match = /^(FA|SP)(\d{2})$/i.exec(term.trim());
  if (!match) return null;
  return (2000 + Number(match[2])) * 2 + (match[1].toUpperCase() === 'FA' ? 1 : 0);
}

/**
 * The term that is running right now, read from the system clock. This is the ceiling: a
 * council cannot be entered for a semester that has not started.
 *
 * WHERE THE BOUNDARY IS DRAWN, AND WHY. CUI's Fall semester begins in September and runs into
 * January; Spring begins in February and runs to the end of the summer session in August. So
 * the year is cut at 1 September and 1 February, and January counts back to the Fall that
 * began the previous September rather than forward to a Spring that has not started. The
 * summer session sits inside Spring on purpose: it is a teaching block, not a term with a
 * council of its own, and the Spring council is still serving through it.
 *
 * The dates move by a week or two every year and this reads the clock rather than the
 * academic calendar, so around the turn of a semester it can be one term out. That is why it
 * is only a ceiling on what can be created and never a claim about which term is current —
 * which term is serving is a flag on a row, set by a person.
 */
function currentTermCode(now: Date = new Date()): string {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 9) return termCodeFor('FA', year);
  if (month === 1) return termCodeFor('FA', year - 1);
  return termCodeFor('SP', year);
}

/**
 * The lowest seat number nobody in this role holds yet. Seats are 1-based per the CHECK.
 *
 * A member with no seat is counted as seat 0, which is where the unique index files them
 * (COALESCE(seat, 0)) — reading them as seat 1 instead would hide a genuinely free first seat.
 */
function nextFreeSeat(members: HierarchyMemberRecord[], roleSlug: string, ignoreId?: string): number {
  const taken = new Set(
    members.filter((m) => m.roleSlug === roleSlug && m.id !== ignoreId).map((m) => m.seat ?? 0)
  );
  let seat = 1;
  while (taken.has(seat)) seat += 1;
  return seat;
}

export default function AdminHierarchyPage() {
  const [roles, setRoles] = useState<HierarchyRole[]>([]);
  const [terms, setTerms] = useState<HierarchyTermRecord[]>([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [members, setMembers] = useState<HierarchyMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<MemberDraft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleting, setDeleting] = useState<HierarchyMemberRecord | null>(null);
  /**
   * True while the cropper is open on the member being edited.
   *
   * The cropper keeps the picked file in its own state and only hands it up when its "Save
   * photo" button is pressed, so while this is true the drawer is holding work the draft has
   * not been told about. Saving the member here is what silently discarded every photo the
   * council ever uploaded, so the drawer's Save is closed off until the crop is applied or
   * abandoned — see the footer.
   */
  const [photoEditing, setPhotoEditing] = useState(false);

  const [newTerm, setNewTerm] = useState<string | null>(null);
  /** Null while the label is still following the term code; a string once the admin edits it. */
  const [newTermLabel, setNewTermLabel] = useState<string | null>(null);
  /**
   * Null while the promote-or-archive choice still follows the term picked; a boolean once the
   * admin overrides it. Same idiom as newTermLabel, and for the same reason: the sensible
   * answer changes as they change the dropdowns, right up until they say otherwise.
   */
  const [promoteChoice, setPromoteChoice] = useState<boolean | null>(null);
  const [carryRoster, setCarryRoster] = useState(false);

  const canManage = adminAuthService.canManageContent();
  const roleIndex = useMemo(() => indexRoles(roles), [roles]);
  const currentTerm = terms.find((term) => term.isCurrent) ?? null;
  const selected = terms.find((term) => term.id === selectedTermId) ?? currentTerm;
  const orderedMembers = useMemo(() => sortMembers(members, roleIndex), [members, roleIndex]);

  const loadTerms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextRoles, nextTerms] = await Promise.all([
        hierarchyService.listRoles(),
        hierarchyService.listTerms(),
      ]);
      setRoles(nextRoles);
      setTerms(nextTerms);
      setSelectedTermId((current) => {
        if (current && nextTerms.some((term) => term.id === current)) return current;
        return (nextTerms.find((term) => term.isCurrent) ?? nextTerms[0])?.id ?? '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the hierarchy.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTerms();
  }, [loadTerms]);

  useEffect(() => {
    if (!selectedTermId) {
      setMembers([]);
      return;
    }

    let ignore = false;
    /*
     * Cleared before the read, not after it.
     *
     * Leaving the previous term's rows up while another term's roster loads is worse than
     * showing nothing: the grid renders one council under a different term's heading, and
     * openEdit copies each card's own termId — so clicking Edit on a stale card opens a drawer
     * captioned "Spring 2024" whose save writes to the serving council. An admin correcting an
     * archive would silently rewrite FA26. Empty is honest; someone else's data is not.
     */
    setMembers([]);
    setError(null);
    setMembersLoading(true);
    hierarchyService
      .listMembers(selectedTermId)
      .then((rows) => {
        if (!ignore) setMembers(rows);
      })
      .catch((err) => {
        if (ignore) return;
        setMembers([]);
        setError(err instanceof Error ? err.message : 'Failed to load this term’s roster.');
      })
      .finally(() => {
        if (!ignore) setMembersLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [selectedTermId]);

  const openNew = () => {
    if (!selected) return;
    const firstFreeRole = roles.find((role) => role.multiple || !members.some((m) => m.roleSlug === role.slug));
    const roleSlug = firstFreeRole?.slug ?? roles[0]?.slug ?? '';
    setDraft({
      id: '',
      termId: selected.id,
      roleSlug,
      name: '',
      seat: roleIndex.get(roleSlug)?.multiple ? nextFreeSeat(members, roleSlug) : null,
      photo: '',
      photoPath: null,
      email: null,
      linkedin: null,
      links: [],
    });
    setIsNew(true);
    // Not straight into the cropper. A new member opens showing the society logo, so using it
    // is a choice the admin can simply leave alone rather than something they fall into.
    setPhotoEditing(false);
    setError(null);
  };

  const openEdit = (member: HierarchyMemberRecord) => {
    setDraft({
      id: member.id,
      termId: member.termId,
      roleSlug: member.roleSlug,
      name: member.name,
      seat: member.seat ?? null,
      // A row still carrying the literal '/brand-logo.png' is a seeded row from before the
      // logo was a choice, and it means exactly what an empty photo means. Read as empty, the
      // drawer describes it honestly and saving the member normalises the row on the way out,
      // so the database stops holding a path into the front-end's public folder.
      photo: member.photo === PLACEHOLDER_PHOTO ? '' : member.photo,
      photoPath: member.photoPath,
      email: member.email ?? null,
      linkedin: member.linkedin ?? null,
      links: memberLinks(member),
    });
    setIsNew(false);
    setPhotoEditing(false);
    setError(null);
  };

  /** One place to close the member drawer, so the cropper can never be left open behind it. */
  const closeDraft = () => {
    setDraft(null);
    setPhotoEditing(false);
  };

  /**
   * Switching role rewrites the seat, because seat means nothing for a role only one person
   * holds and the unique index treats a null seat as seat 0 — leaving a stale number behind
   * is how you get a duplicate that nobody can see in the form.
   */
  const changeRole = (roleSlug: string) => {
    if (!draft) return;
    const role = roleIndex.get(roleSlug);
    setDraft({
      ...draft,
      roleSlug,
      seat: role?.multiple ? nextFreeSeat(members, roleSlug, draft.id || undefined) : null,
    });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError('Please enter a name for this member.');
      return;
    }
    // The field is marked required, so it has to actually be required. A blank seat on a
    // shared role is accepted by the CHECK and filed under COALESCE(seat, 0), which puts the
    // person in a seat 0 that no form shows and no seat number can reach.
    const role = roleIndex.get(draft.roleSlug);
    if (role?.multiple && !(Number.isInteger(draft.seat) && (draft.seat ?? 0) >= 1)) {
      setError(`${role.title} is a shared role, so this person needs a seat number of 1 or more.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // A freshly cropped photo arrives as a data URL and has to become a stored object
      // before the row can point at it. An unchanged photo is already a URL and is left alone,
      // and an empty one is the admin choosing the society logo — the row stores nothing and
      // every surface falls back to it.
      let photo = draft.photo;
      let photoPath = draft.photoPath;
      let replacedPath: string | null = null;
      let uploadedPath: string | null = null;

      if (photo.startsWith('data:')) {
        const uploaded = await hierarchyService.uploadPhoto(photo, draft.termId);
        replacedPath = draft.photoPath;
        uploadedPath = uploaded.path;
        photo = uploaded.url;
        photoPath = uploaded.path;
      } else if (!photo) {
        replacedPath = draft.photoPath;
        photoPath = null;
      }

      const input: HierarchyMemberInput = {
        termId: draft.termId,
        roleSlug: draft.roleSlug,
        name: draft.name,
        seat: draft.seat,
        photo,
        photoPath,
        email: draft.email,
        linkedin: draft.linkedin,
        links: draft.links,
      };

      let savedMember: HierarchyMemberRecord;
      try {
        savedMember = isNew
          ? await hierarchyService.createMember(input)
          : await hierarchyService.updateMember(draft.id, input);
      } catch (writeError) {
        // The file is already in the bucket but no row will ever name it, so nothing else can
        // find it again. Clean it up here or it is orphaned for good — once per rejected save.
        if (uploadedPath) await hierarchyService.discardPhoto(uploadedPath);
        throw writeError;
      }

      // savedMember is the row PostgREST returned from its own RETURNING clause, not the form
      // that was submitted, so the card below re-renders from what the database now holds. A
      // photo that did not persist shows as the society logo the moment the drawer closes
      // rather than looking saved until the next reload.
      setMembers((rows) =>
        rows.some((row) => row.id === savedMember.id)
          ? rows.map((row) => (row.id === savedMember.id ? savedMember : row))
          : [...rows, savedMember]
      );
      // Only once the row no longer points at it, so a failed save never destroys the photo
      // the roster is still showing.
      if (replacedPath) await hierarchyService.discardPhoto(replacedPath);
      closeDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this member.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await hierarchyService.removeMember(deleting);
      setMembers((rows) => rows.filter((row) => row.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove this member.');
      // The confirm dialog has no room for an error and its backdrop covers the banner on the
      // page, so it closes first and the reason is read there — as on the Events page.
      setDeleting(null);
    } finally {
      setSaving(false);
    }
  };

  const trimmedNewTerm = (newTerm ?? '').trim().toUpperCase();
  const existingTerm = terms.find((term) => term.term.toUpperCase() === trimmedNewTerm) ?? null;

  /**
   * The public name of the term being started.
   *
   * Null means "nobody has typed one", so it keeps following the code — which is what an
   * admin wants for FA/SP/SU and useless for anything else, where labelForTerm can only echo
   * the code back and the site would show "WINTER27" as its own human label. Re-promoting an
   * existing term starts from the label it already carries, because start_hierarchy_term
   * overwrites the label on conflict and would otherwise quietly rename it.
   */
  const autoLabelFor = (code: string) => {
    const match = terms.find((term) => term.term.toUpperCase() === code);
    return match?.label ?? labelForTerm(code);
  };

  const newTermLabelValue = newTermLabel ?? autoLabelFor(trimmedNewTerm);

  /* ---- Which terms the dropdowns may offer -------------------------- */

  const ceilingTerm = currentTermCode();
  const ceilingOrdinal = termOrdinal(ceilingTerm) ?? 0;
  const ceilingYear = 2000 + Number(ceilingTerm.slice(2));

  /**
   * How far back the year list reaches: ten years, extended if the archive already goes
   * further. Anchoring on what is stored means a term entered before this form existed can
   * always be selected again, so its label stays correctable.
   */
  const earliestYear = Math.min(
    ceilingYear - 10,
    ...terms.map((term) => 2000 + Number(term.term.slice(2))).filter((year) => Number.isFinite(year))
  );

  const selectedSeason = (SEASONS.find((s) => trimmedNewTerm.startsWith(s.code))?.code ?? 'FA') as Season;
  const selectedYear = /^[A-Z]{2}\d{2}$/.test(trimmedNewTerm) ? 2000 + Number(trimmedNewTerm.slice(2)) : ceilingYear;

  const yearOptions: number[] = [];
  for (let year = ceilingYear; year >= earliestYear; year -= 1) yearOptions.push(year);
  // A year held in state but not in the list would leave the select showing one thing while
  // the drawer acts on another. It cannot happen from the controls, only from data.
  if (!yearOptions.includes(selectedYear)) yearOptions.push(selectedYear);
  yearOptions.sort((a, b) => b - a);

  /** A season is unreachable in the ceiling year until that semester has actually begun. */
  const seasonAllowed = (season: Season, year: number) =>
    (termOrdinal(termCodeFor(season, year)) ?? 0) <= ceilingOrdinal;

  /**
   * The term picked is in the past when it sorts before the council currently serving, which
   * is what decides whether the default action is to promote it or to file it.
   *
   * A term the ordering cannot place — a hand-entered SU code — is not treated as past. The
   * safe default there is the one that changes nothing about which council is published.
   */
  const chosenOrdinal = termOrdinal(trimmedNewTerm);
  const servingOrdinal = currentTerm ? termOrdinal(currentTerm.term) : null;
  const chosenIsPast =
    chosenOrdinal !== null && servingOrdinal !== null && chosenOrdinal < servingOrdinal;
  /**
   * The term picked is the one already serving — which is what the drawer opens on whenever
   * the running semester's council is already published, since there is then no next term
   * within the ceiling. There is no promote-or-archive question to ask about it: both writes
   * land on the same row and neither changes which council the site shows, so the choice is
   * hidden and the drawer offers what is actually left, a correction to its public name.
   */
  const chosenIsServing = !!existingTerm?.isCurrent;
  // With no council serving at all there is nothing to archive behind, so the first term has
  // to become the current one or the site has nothing to show.
  const promote = chosenIsServing || (promoteChoice ?? (!chosenIsPast || !currentTerm));
  const showPromoteChoice = !!trimmedNewTerm && !!currentTerm && !chosenIsServing;

  /** Moves the dropdowns and lets the label and the promote choice resume following them. */
  const pickTerm = (season: Season, year: number) => {
    const previousAuto = autoLabelFor(trimmedNewTerm);
    setNewTermLabel((current) =>
      current === null || current.trim() === '' || current === previousAuto ? null : current
    );
    // The promote/archive override belongs to the term it was made about. Left standing, an
    // admin who chose "the council taking over" for FA24 and then corrected the year to 2023
    // carried that choice across — and start_hierarchy_term demotes the serving council, so
    // the stickiest state on this page was attached to the highest-stakes write on it.
    setPromoteChoice(null);
    setNewTerm(termCodeFor(season, year));
  };

  const openTermDrawer = () => {
    // The term after the one serving, which is what this button has always meant, held to the
    // ceiling so a council cannot be entered for a semester that has not started. When those
    // are the same term — the usual case, since the serving council is normally the running
    // one — the drawer opens on it and says so, which is the honest answer: there is no next
    // term to start yet, and what is left to do here is fill in the archive.
    const next = nextTermCode(currentTerm?.term ?? '');
    const nextOrdinal = termOrdinal(next);
    setNewTerm(nextOrdinal !== null && nextOrdinal <= ceilingOrdinal ? next : ceilingTerm);
    setNewTermLabel(null);
    setPromoteChoice(null);
    setCarryRoster(false);
    setError(null);
  };

  const closeTermDrawer = () => {
    setNewTerm(null);
    setNewTermLabel(null);
    setPromoteChoice(null);
    setCarryRoster(false);
  };

  /**
   * Creates the term the drawer describes, then copies the outgoing roster if that was asked for.
   *
   * Two different writes, and which one runs is the whole point of the choice above:
   * start_hierarchy_term promotes what it creates and demotes the incumbent, so it is only
   * ever right for the term taking over; add_hierarchy_term never touches is_current, which is
   * the only safe way to enter a council that has already finished.
   *
   * The source id is read before the promotion because the promotion is what stops it being
   * current. The copy is a second write on purpose: it is optional, and a term that exists
   * with an empty roster is recoverable, whereas a promotion rolled back because a copy
   * failed would leave the site with no serving council.
   */
  const startNewTerm = async () => {
    const code = trimmedNewTerm;
    const label = newTermLabelValue;
    const outgoing = currentTerm;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = promote
        ? await hierarchyService.startTerm(code, label)
        : await hierarchyService.addTerm(code, label);

      // `existingTerm` hides the copy option but does not clear the choice, and copying onto a
      // roster that already exists is exactly the duplicate the unique index rejects. It is
      // offered for a promotion only: carrying the serving council into a past term would
      // publish a roster of people who were not on it.
      if (promote && carryRoster && !existingTerm && outgoing && outgoing.id !== saved.id) {
        try {
          await hierarchyService.copyRoster(outgoing.id, saved.id);
        } catch (copyError) {
          setNotice(
            `${saved.term} is now the current term, but its roster could not be copied from ${outgoing.term}: ${
              copyError instanceof Error ? copyError.message : 'unknown error'
            }`
          );
        }
      }

      closeTermDrawer();
      setSelectedTermId(saved.id);
      await loadTerms();
      // loadTerms keeps a still-valid selection, so the new term stays selected and its roster
      // is fetched by the members effect — an archive term therefore opens empty and ready.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the term.');
    } finally {
      setSaving(false);
    }
  };

  const draftRole = draft ? roleIndex.get(draft.roleSlug) : undefined;

  return (
    <div>
      <AdminTopbar
        title="Hierarchy Management"
        subtitle="The council shown on the About and Hierarchy pages"
        action={
          <div className="flex gap-2">
            <button
              onClick={openTermDrawer}
              disabled={!canManage}
              className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-50"
            >
              <CalendarPlus className="h-4 w-4" /> Add Term
            </button>
            <button
              onClick={openNew}
              disabled={!selected || !canManage}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add Member
            </button>
          </div>
        }
      />

      <div className="p-4 sm:p-6">
        {!canManage && (
          <p className="mb-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            You can read the council here. Editing it is limited to content managers.
          </p>
        )}
        {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
        {notice && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{notice}</p>}

        <div className="flex flex-wrap gap-2">
          {terms.map((term) => (
            <button
              key={term.id}
              onClick={() => setSelectedTermId(term.id)}
              aria-pressed={selectedTermId === term.id}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                selectedTermId === term.id
                  ? 'bg-ieee-orange text-white shadow-sm'
                  : 'border border-black/10 bg-white text-slate-600 hover:border-ieee-orange/40'
              }`}
            >
              {term.term}
              {term.isCurrent && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase ${
                    selectedTermId === term.id ? 'bg-white/25' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  current
                </span>
              )}
            </button>
          ))}
        </div>

        {loading || membersLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-black/10 bg-white/60 p-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the council…
          </div>
        ) : !selected ? (
          <div className="mt-8">
            {/* A failed read leaves `terms` empty too, and telling an admin the society has no
                council when the truth is that we could not ask is the same lie in a friendlier
                voice. The banner above says what went wrong; this must not contradict it. */}
            <EmptyState
              title={error ? 'The council could not be loaded' : 'No council has been published yet'}
              description={
                error
                  ? 'Nothing below is a statement about what is stored — the read did not succeed.'
                  : 'Start a term to create the first roster.'
              }
            />
          </div>
        ) : orderedMembers.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-black/10 bg-white/60 p-10 text-center">
            <p className="text-sm font-semibold text-slate-700">{selected.label} has no members yet.</p>
            <p className="mt-1 text-sm text-slate-500">Add the council one seat at a time.</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {orderedMembers.map((member, i) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.03 }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-black/5 bg-white p-4 text-center shadow-sm transition hover:shadow-md"
              >
                <Avatar name={member.name} src={member.photo || PLACEHOLDER_PHOTO} size="lg" />
                <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                <p className="font-mono text-[11px] tracking-wide text-ieee-orange uppercase">
                  {titleForRole(roleIndex, member.roleSlug)}
                  {member.seat ? ` · seat ${member.seat}` : ''}
                </p>
                <div className="mt-1 flex gap-3 text-xs">
                  <button
                    onClick={() => openEdit(member)}
                    disabled={!canManage}
                    className="flex items-center gap-1 font-semibold text-slate-500 hover:text-ieee-orange disabled:opacity-40"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => setDeleting(member)}
                    disabled={!canManage}
                    className="flex items-center gap-1 font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Member editor ------------------------------------------ */}
      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'Add Member' : 'Edit Member'}
        subtitle={selected?.label}
        onClose={closeDraft}
        footer={
          <div className="flex flex-col gap-2">
            {/* Two buttons called some form of "save" used to sit in this drawer at once, and
                the outer one silently threw away what the inner one was holding. It is closed
                while a crop is open, so the photo can only be applied or abandoned — never
                lost by pressing the more obvious of the two. */}
            {photoEditing && (
              <p className="text-xs font-medium text-amber-700">
                Finish with the photo first — press “Save photo” to attach it to this member, or
                “Cancel” to keep the one they have.
              </p>
            )}
            <button
              onClick={save}
              disabled={saving || photoEditing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            {/* The banner on the page behind this is under the drawer's backdrop, so a failed
                save would otherwise stop the spinner and say nothing at all. */}
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}
            {/* Deliberately not wrapped in AdminField. AdminField renders a <label>, which
                makes the cropper's hidden file input the field's labelled control, so a click
                on any plain part of it — the hint, the drag stage, the size previews — reopens
                the file picker. Verified in the browser: label.control was the file input and
                a click on the hint text forwarded to it. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Photo</span>

              {photoEditing ? (
                <AvatarCropper
                  value={draft.photo || undefined}
                  size={200}
                  onChange={(dataUrl) => {
                    setDraft({ ...draft, photo: dataUrl });
                    setPhotoEditing(false);
                  }}
                  // Always given, unlike before: without it a member who has no photo yet had
                  // no way out of the cropper at all.
                  onCancel={() => setPhotoEditing(false)}
                />
              ) : (
                <div className="flex items-center gap-4">
                  <img
                    src={draft.photo || PLACEHOLDER_PHOTO}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-full border border-black/10 bg-white object-cover"
                  />
                  <div className="flex flex-col items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPhotoEditing(true)}
                      className="text-sm font-semibold text-slate-600 transition hover:text-ieee-orange"
                    >
                      {draft.photo ? 'Replace or reposition' : 'Upload a photo'}
                    </button>
                    {/* The logo as a choice rather than as what you get by accident: for
                        someone whose photograph nobody has, and for someone who would rather
                        their face were not published. Nothing is stored for it — the row's
                        photo is emptied and every surface falls back to the logo — so the
                        database never holds a path into the front-end's public folder. */}
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, photo: '' })}
                      disabled={!draft.photo}
                      className="text-left text-xs font-medium text-slate-500 transition hover:text-ieee-orange disabled:text-slate-300 disabled:hover:text-slate-300"
                    >
                      Use the society logo instead
                    </button>
                    <span className="text-xs text-slate-400">
                      {draft.photo ? 'A photo is attached.' : 'Showing the society logo.'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <AdminField label="Name" required>
              <AdminInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </AdminField>
            <AdminField label="Role" required>
              <select
                value={draft.roleSlug}
                onChange={(e) => changeRole(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-ieee-orange/50 focus:ring-2 focus:ring-ieee-orange/20"
              >
                {roles.map((role) => {
                  // A role only one person holds is unselectable once it is filled: the
                  // database would refuse the duplicate anyway, and refusing it here says why.
                  const takenBySomeoneElse =
                    !role.multiple && members.some((m) => m.roleSlug === role.slug && m.id !== draft.id);
                  return (
                    <option key={role.slug} value={role.slug} disabled={takenBySomeoneElse}>
                      {role.title}
                      {takenBySomeoneElse ? ' — already filled' : ''}
                    </option>
                  );
                })}
              </select>
            </AdminField>
            {draftRole?.multiple && (
              <AdminField
                label="Seat"
                required
                hint={`${draftRole.title} can be held by several people. Seat numbers order them and must not repeat.`}
              >
                <AdminInput
                  type="number"
                  min={1}
                  value={draft.seat ?? ''}
                  onChange={(e) => setDraft({ ...draft, seat: e.target.value ? Number(e.target.value) : null })}
                />
              </AdminField>
            )}
            <MemberLinksEditor links={draft.links} onChange={(links) => setDraft({ ...draft, links })} />
          </div>
        )}
      </AdminEditDrawer>

      {/* ---- Add a term --------------------------------------------- */}
      <AdminEditDrawer
        open={newTerm !== null}
        title="Add a term"
        subtitle="Read what this changes before confirming"
        onClose={closeTermDrawer}
        footer={
          <button
            onClick={startNewTerm}
            disabled={saving || !trimmedNewTerm || !newTermLabelValue.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {chosenIsServing
              ? `Update the name of ${trimmedNewTerm}`
              : !promote
                ? `Add ${trimmedNewTerm} to the archive`
                : currentTerm
                  ? `Start ${trimmedNewTerm} and archive ${currentTerm.term}`
                  : `Make ${trimmedNewTerm} the current term`}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          {/* Two dropdowns rather than a code to mistype. They still write the same FA26/SP27
              codes the rest of the app reads — the code is the storage format, not something
              anybody should have to spell. */}
          <div className="grid grid-cols-2 gap-3">
            <AdminField label="Season" required>
              <select
                value={selectedSeason}
                onChange={(e) => pickTerm(e.target.value as Season, selectedYear)}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-ieee-orange/50 focus:ring-2 focus:ring-ieee-orange/20"
              >
                {SEASONS.map((season) => (
                  <option key={season.code} value={season.code} disabled={!seasonAllowed(season.code, selectedYear)}>
                    {season.name}
                    {!seasonAllowed(season.code, selectedYear) ? ' — not started yet' : ''}
                  </option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Year" required>
              <select
                value={selectedYear}
                onChange={(e) => {
                  const year = Number(e.target.value);
                  // Changing the year can put the season out of reach — Fall of this year is
                  // not selectable while Spring is still running — so the season falls back to
                  // the latest one that year allows rather than leaving an impossible pair.
                  const season = seasonAllowed(selectedSeason, year)
                    ? selectedSeason
                    : ((SEASONS.find((s) => seasonAllowed(s.code, year))?.code ?? 'SP') as Season);
                  pickTerm(season, year);
                }}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-ieee-orange/50 focus:ring-2 focus:ring-ieee-orange/20"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </AdminField>
          </div>
          <p className="-mt-2 text-xs text-slate-400">
            Saved as <span className="font-mono font-semibold text-slate-500">{trimmedNewTerm}</span>. Terms up to{' '}
            {labelForTerm(ceilingTerm)} can be entered — the semester running now is the furthest ahead a council can
            be recorded for.
          </p>

          <AdminField
            label="Public name"
            required
            hint="Written out for visitors. Follows the season and year until you change it."
          >
            <AdminInput
              value={newTermLabelValue}
              onChange={(e) => setNewTermLabel(e.target.value)}
              placeholder="Spring 2027"
            />
          </AdminField>

          {/* The choice this drawer exists to make explicit. start_hierarchy_term promotes
              whatever it is given, so before there was a second path here the only way to
              record a past council was to hand it the live site. */}
          {showPromoteChoice && currentTerm && (
            <fieldset className="flex flex-col gap-2 rounded-xl bg-white p-4 ring-1 ring-black/5">
              <legend className="px-1 text-sm font-semibold text-slate-900">What this term is</legend>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
                <input
                  type="radio"
                  name="term-promote"
                  checked={promote}
                  onChange={() => setPromoteChoice(true)}
                  className="mt-1 accent-ieee-orange"
                />
                <span>
                  <span className="font-semibold text-slate-800">The council taking over.</span> {trimmedNewTerm}{' '}
                  becomes the term the site publishes, and {currentTerm.term} moves into the archive.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
                <input
                  type="radio"
                  name="term-promote"
                  checked={!promote}
                  onChange={() => setPromoteChoice(false)}
                  className="mt-1 accent-ieee-orange"
                />
                <span>
                  <span className="font-semibold text-slate-800">A past council, for the archive.</span>{' '}
                  {trimmedNewTerm} is filed alongside the others and {currentTerm.term} keeps serving. Nothing a
                  visitor sees changes until you add its members.
                </span>
              </label>
            </fieldset>
          )}

          {trimmedNewTerm && (
            <div className="rounded-xl bg-white p-4 text-sm leading-relaxed text-slate-600 ring-1 ring-black/5">
              <p className="font-semibold text-slate-900">What happens when you confirm</p>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4">
                <li>
                  {chosenIsServing ? (
                    <>
                      <span className="font-semibold text-slate-800">{trimmedNewTerm}</span> is already the current
                      term, so only its public name changes — to{' '}
                      <span className="font-semibold text-slate-800">{newTermLabelValue}</span>. To record a council
                      that has already finished, pick its season and year above.
                    </>
                  ) : existingTerm && promote ? (
                    <>
                      <span className="font-semibold text-slate-800">{newTermLabelValue}</span> already exists and
                      will be brought back as the current term, keeping the roster it already has.
                    </>
                  ) : existingTerm ? (
                    <>
                      <span className="font-semibold text-slate-800">{newTermLabelValue}</span> already exists. Only
                      its public name is updated; its roster and its place in the archive are untouched.
                    </>
                  ) : promote ? (
                    <>
                      <span className="font-semibold text-slate-800">{newTermLabelValue}</span> is created and
                      becomes the term shown on the homepage, the About page and the Hierarchy page.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-slate-800">{newTermLabelValue}</span> is created in the
                      archive, empty, and opens here so you can add the people who served on it.
                    </>
                  )}
                </li>
                {promote && currentTerm && currentTerm.id !== existingTerm?.id && (
                  <li>
                    <span className="font-semibold text-slate-800">{currentTerm.label}</span> stops being current and
                    moves into the archive. Nothing about it is deleted — it stays readable, term by term.
                  </li>
                )}
                {!promote && currentTerm && (
                  <li>
                    <span className="font-semibold text-slate-800">{currentTerm.label}</span> carries on as the
                    current term. The site keeps publishing it.
                  </li>
                )}
                <li>Nobody’s portal access changes. Roles for logging in are reassigned on the Users page.</li>
              </ul>
            </div>
          )}

          {trimmedNewTerm && promote && !existingTerm && currentTerm && (
            <fieldset className="flex flex-col gap-2 rounded-xl bg-white p-4 ring-1 ring-black/5">
              <legend className="px-1 text-sm font-semibold text-slate-900">Starting roster</legend>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
                <input
                  type="radio"
                  name="carry-roster"
                  checked={!carryRoster}
                  onChange={() => setCarryRoster(false)}
                  className="mt-1 accent-ieee-orange"
                />
                <span>
                  <span className="font-semibold text-slate-800">Start empty.</span> Add each person to{' '}
                  {trimmedNewTerm} yourself.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
                <input
                  type="radio"
                  name="carry-roster"
                  checked={carryRoster}
                  onChange={() => setCarryRoster(true)}
                  className="mt-1 accent-ieee-orange"
                />
                <span>
                  <span className="font-semibold text-slate-800">
                    Copy {currentTerm.term}’s roster forward as a draft.
                  </span>{' '}
                  Everyone serving now is added to {trimmedNewTerm} with the same role and photo, ready to be edited
                  or removed. {currentTerm.term} keeps its own copy.
                </span>
              </label>
            </fieldset>
          )}
        </div>
      </AdminEditDrawer>

      <ConfirmModal
        open={!!deleting}
        title={`Remove ${deleting?.name}?`}
        description={`They will be removed from the ${selected?.label ?? 'selected'} council. Other terms are not affected.`}
        danger
        confirmLabel="Remove"
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </div>
  );
}
