import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarPlus, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminImageField } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import Avatar from '@/components/ui/Avatar';
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

  const [newTerm, setNewTerm] = useState<string | null>(null);
  /** Null while the label is still following the term code; a string once the admin edits it. */
  const [newTermLabel, setNewTermLabel] = useState<string | null>(null);
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
    setMembersLoading(true);
    hierarchyService
      .listMembers(selectedTermId)
      .then((rows) => {
        if (!ignore) setMembers(rows);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load this term’s roster.');
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
    });
    setIsNew(true);
    setError(null);
  };

  const openEdit = (member: HierarchyMemberRecord) => {
    setDraft({
      id: member.id,
      termId: member.termId,
      roleSlug: member.roleSlug,
      name: member.name,
      seat: member.seat ?? null,
      photo: member.photo,
      photoPath: member.photoPath,
      email: member.email ?? null,
      linkedin: member.linkedin ?? null,
    });
    setIsNew(false);
    setError(null);
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
      // before the row can point at it. An unchanged photo is already a URL and is left alone.
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

      setMembers((rows) =>
        rows.some((row) => row.id === savedMember.id)
          ? rows.map((row) => (row.id === savedMember.id ? savedMember : row))
          : [...rows, savedMember]
      );
      // Only once the row no longer points at it, so a failed save never destroys the photo
      // the roster is still showing.
      if (replacedPath) await hierarchyService.discardPhoto(replacedPath);
      setDraft(null);
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

  /**
   * Promotes the term, then copies the outgoing roster if that was asked for.
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
      const promoted = await hierarchyService.startTerm(code, label);

      // `existingTerm` hides the copy option but does not clear the choice, and copying onto a
      // roster that already exists is exactly the duplicate the unique index rejects.
      if (carryRoster && !existingTerm && outgoing && outgoing.id !== promoted.id) {
        try {
          await hierarchyService.copyRoster(outgoing.id, promoted.id);
        } catch (copyError) {
          setNotice(
            `${promoted.term} is now the current term, but its roster could not be copied from ${outgoing.term}: ${
              copyError instanceof Error ? copyError.message : 'unknown error'
            }`
          );
        }
      }

      setNewTerm(null);
      setNewTermLabel(null);
      setCarryRoster(false);
      setSelectedTermId(promoted.id);
      await loadTerms();
      // loadTerms keeps a still-valid selection, so the promoted term stays selected and its
      // roster is fetched by the members effect.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the new term.');
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
              onClick={() => {
                setNewTerm(nextTermCode(currentTerm?.term ?? ''));
                setNewTermLabel(null);
                setCarryRoster(false);
                setError(null);
              }}
              disabled={!canManage}
              className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-50"
            >
              <CalendarPlus className="h-4 w-4" /> New Term
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
            <EmptyState
              title="No council has been published yet"
              description="Start a term to create the first roster."
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
        onClose={() => setDraft(null)}
        footer={
          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
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
            <AdminField label="Photo" hint="Position the crop before saving. Leave empty to use the society logo.">
              <AdminImageField
                shape="circle"
                value={draft.photo}
                onChange={(photo) => setDraft({ ...draft, photo })}
              />
            </AdminField>
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
            <AdminField label="Email" hint="Optional. Shown to nobody yet; kept for future contact cards.">
              <AdminInput
                type="email"
                value={draft.email ?? ''}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </AdminField>
            <AdminField label="LinkedIn" hint="Optional profile URL.">
              <AdminInput
                value={draft.linkedin ?? ''}
                onChange={(e) => setDraft({ ...draft, linkedin: e.target.value })}
              />
            </AdminField>
          </div>
        )}
      </AdminEditDrawer>

      {/* ---- Start a new term --------------------------------------- */}
      <AdminEditDrawer
        open={newTerm !== null}
        title="Start a new term"
        subtitle="Read what this changes before confirming"
        onClose={() => {
          setNewTerm(null);
          setNewTermLabel(null);
          setCarryRoster(false);
        }}
        footer={
          <button
            onClick={startNewTerm}
            disabled={saving || !trimmedNewTerm || !newTermLabelValue.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {trimmedNewTerm && currentTerm && currentTerm.id !== existingTerm?.id
              ? `Start ${trimmedNewTerm} and archive ${currentTerm.term}`
              : trimmedNewTerm
                ? `Make ${trimmedNewTerm} the current term`
                : 'Start this term'}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}
          <AdminField label="Term code" required hint="Two letters and two digits, e.g. SP27.">
            <AdminInput
              value={newTerm ?? ''}
              onChange={(e) => {
                // The public name follows the code only until the admin writes their own, and
                // it used to freeze the moment they touched that field — so correcting a typo
                // in the code afterwards left the old term's name attached to the new one. A
                // label that still matches what the previous code generated was never really
                // theirs, so it goes back to following.
                const previousAuto = autoLabelFor(trimmedNewTerm);
                setNewTermLabel((current) =>
                  current === null || current.trim() === '' || current === previousAuto ? null : current
                );
                setNewTerm(e.target.value.toUpperCase());
              }}
              placeholder="SP27"
            />
          </AdminField>

          <AdminField
            label="Public name"
            required
            hint="Written out for visitors. Follows the term code until you change it."
          >
            <AdminInput
              value={newTermLabelValue}
              onChange={(e) => setNewTermLabel(e.target.value)}
              placeholder="Spring 2027"
            />
          </AdminField>

          {trimmedNewTerm && (
            <div className="rounded-xl bg-white p-4 text-sm leading-relaxed text-slate-600 ring-1 ring-black/5">
              <p className="font-semibold text-slate-900">What happens when you confirm</p>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4">
                <li>
                  {existingTerm ? (
                    <>
                      <span className="font-semibold text-slate-800">{newTermLabelValue}</span> already exists and
                      will be brought back as the current term, keeping the roster it already has.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-slate-800">{newTermLabelValue}</span> is created and
                      becomes the term shown on the homepage, the About page and the Hierarchy page.
                    </>
                  )}
                </li>
                {currentTerm && currentTerm.id !== existingTerm?.id && (
                  <li>
                    <span className="font-semibold text-slate-800">{currentTerm.label}</span> stops being current and
                    moves into the archive. Nothing about it is deleted — it stays readable, term by term.
                  </li>
                )}
                <li>Nobody’s portal access changes. Roles for logging in are reassigned on the Users page.</li>
              </ul>
            </div>
          )}

          {trimmedNewTerm && !existingTerm && currentTerm && (
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
