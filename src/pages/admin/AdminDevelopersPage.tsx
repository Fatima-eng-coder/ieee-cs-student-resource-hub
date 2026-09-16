import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Lock, Pencil, RotateCw } from 'lucide-react';

import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect } from '@/components/admin/AdminField';
import MemberLinksEditor from '@/components/admin/MemberLinksEditor';
import AvatarCropper from '@/components/ui/AvatarCropper';
import { MemberAvatar } from '@/components/hierarchy/MemberAvatar';
import { adminAuthService } from '@/services/adminAuthService';
import {
  developerProfilesService,
  diffProfile,
  type CreditProfileChanges,
  type CreditProfileInput,
} from '@/services/developerProfilesService';
import { CREDITED_IDS, DEVELOPERS, sectionsFor, type PersonId } from '@/data/developers';
import type { CreditedPerson, CreditProfile, MemberGender } from '@/types';

/**
 * The editable half of the credits page.
 *
 * What changes here: a person's portrait, designation, placeholder and links. What does not: who
 * is credited, their name, and the work they are credited with. Those are authored in
 * src/data/developers.ts, and they are shown here read-only with that said out loud — an admin
 * who wants to correct somebody's name should learn where it lives, not be handed an input that
 * silently does nothing.
 *
 * There is no add and no remove. The roster in code decides who appears; a profile row for a
 * person is created the first time they are saved here.
 */

const GENDER_OPTIONS: { value: MemberGender; label: string }[] = [
  { value: 'unknown', label: 'Not recorded — neutral figure' },
  { value: 'male', label: 'Male placeholder' },
  { value: 'female', label: 'Female placeholder' },
];

const sectionBadge: Record<string, string> = {
  Founder: 'bg-ieee-orange text-white',
  Developer: 'bg-ieee-orange/10 text-ieee-orange-dark',
  Brainstormer: 'bg-slate-100 text-slate-600',
};

interface Draft extends CreditProfileInput {
  id: PersonId;
}

const toDraft = (person: CreditedPerson): Draft => ({
  id: person.id as PersonId,
  designation: person.designation,
  photo: person.photoUrl,
  photoPath: person.photoPath,
  gender: person.gender,
  // A copy, so editing a link in the drawer cannot reach back into the card behind it.
  links: person.links.map((link) => ({ ...link })),
});

export default function AdminDevelopersPage() {
  const canManage = adminAuthService.canManageContent();

  /**
   * Three states, not two. 'failed' is kept apart from 'ready' on purpose: after a failed read
   * every card falls back to blanks for display, and a drawer opened on top of those blanks would
   * be an editor seeded with values the database does not hold. Editing is only offered once the
   * stored profiles have actually been read.
   */
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [profiles, setProfiles] = useState<Map<string, CreditProfile>>(() => new Map());
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [photoEditing, setPhotoEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');

  useEffect(() => {
    let ignore = false;
    setLoadState('loading');
    setLoadError('');
    developerProfilesService
      .listProfiles()
      .then((loaded) => {
        if (ignore) return;
        setProfiles(loaded);
        setLoadState('ready');
      })
      .catch((cause) => {
        if (ignore) return;
        setLoadError(cause instanceof Error ? cause.message : 'The stored profiles could not be read.');
        setLoadState('failed');
      });
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const ready = loadState === 'ready';

  // The roster is known even when the read failed, so everyone is still listed — who is credited
  // never depends on the database. What their profiles hold is only shown once it has been read.
  const people = useMemo(
    () => CREDITED_IDS.map((id) => developerProfilesService.resolve(id, profiles)),
    [profiles]
  );

  const editing = draft ? people.find((person) => person.id === draft.id) ?? null : null;
  const editingWork = draft ? DEVELOPERS.find((credit) => credit.id === draft.id)?.work ?? [] : [];

  const openEditor = (person: CreditedPerson) => {
    // Never on top of a read that failed: the draft would be built from display fallbacks, not
    // from the row. The button is not rendered in that state either; this is the second lock.
    if (!ready) return;
    setDraft(toDraft(person));
    setPhotoEditing(false);
    setError('');
  };

  const closeEditor = () => {
    if (saving) return;
    setDraft(null);
    setPhotoEditing(false);
  };

  const save = async () => {
    if (!draft || !editing || !ready) return;
    setSaving(true);
    setError('');

    // Only what changed is sent. See CreditProfileChanges for the two ways a whole-row save went
    // wrong; the short version is that a field this drawer did not touch is a field the database
    // keeps, whatever this page happened to load.
    const changes: CreditProfileChanges = diffProfile(editing, draft);
    const photoChanged = draft.photo !== editing.photoUrl;

    let uploadedPath: string | null = null;
    let replacedPath: string | null = null;

    try {
      if (photoChanged) {
        // Which file this replaces is read from the row now, not taken from the page. If another
        // tab replaced the portrait since this one loaded, the page's "old" file is already gone,
        // and the one that really needs removing is the file that tab uploaded.
        replacedPath = await developerProfilesService.currentPhotoPath(draft.id);

        if (draft.photo.startsWith('data:')) {
          const uploaded = await developerProfilesService.uploadPhoto(draft.photo, draft.id);
          uploadedPath = uploaded.path;
          changes.photo = { url: uploaded.url, path: uploaded.path };
        } else {
          // Cleared. A non-empty, non-data value cannot reach here: the drawer only ever sets the
          // photo to a fresh crop or to ''.
          changes.photo = { url: null, path: null };
        }
      }

      if (Object.keys(changes).length === 0) {
        setDraft(null);
        setPhotoEditing(false);
        return;
      }

      let saved: CreditProfile;
      try {
        saved = await developerProfilesService.save(draft.id, changes);
      } catch (writeError) {
        // The new file is in the bucket but no row will ever name it. Clean it up now, or it is
        // orphaned for good — once per refused save.
        if (uploadedPath) await developerProfilesService.discardPhoto(uploadedPath);
        throw writeError;
      }

      // Re-rendered from what the database returned, not from the form, so a field that did not
      // persist shows as not saved the moment the drawer closes.
      setProfiles((current) => new Map(current).set(draft.id, saved));

      // Only once the row no longer points at it, so a failed save never deletes the portrait the
      // page is still showing.
      if (replacedPath && replacedPath !== saved.photoPath) {
        await developerProfilesService.discardPhoto(replacedPath);
      }

      setSavedId(draft.id);
      window.setTimeout(() => setSavedId(''), 2200);
      setDraft(null);
      setPhotoEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That profile could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <AdminTopbar title="Developers" subtitle="Portraits, designations and links on the credits page" />

      <div className="p-4 sm:p-6">
        <div className="mb-5 flex max-w-3xl gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600 ring-1 ring-black/5">
          <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p>
            Who is credited, their names and the work they are credited with are part of the site
            itself, in <span className="font-mono text-xs text-slate-700">src/data/developers.ts</span>
            , so a contributor cannot be removed or misattributed from here by accident. Everything
            else — portrait, designation and links — can be kept current below.
          </p>
        </div>

        {!canManage && (
          <p className="mb-5 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your role can view the credits but not change them. Content managers can edit profiles.
          </p>
        )}

        {loadState === 'failed' && (
          <div
            role="alert"
            className="mb-5 flex max-w-3xl flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"
          >
            <p className="min-w-0 flex-1 text-sm font-medium text-rose-700">
              {loadError} Editing is paused until they load, so nothing here can overwrite a profile
              this page could not see.
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              <RotateCw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        )}

        {loadState === 'loading' ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-ieee-orange" /> Loading profiles…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {people.map((person, index) => {
              const sections = sectionsFor(person.id as PersonId);
              return (
                <motion.div
                  key={person.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.03 }}
                  className="flex gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm"
                >
                  <MemberAvatar
                    src={person.photoUrl}
                    alt=""
                    gender={person.gender}
                    size="h-14 w-14"
                    className="border border-black/10"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{person.name}</p>
                    <p className={`truncate text-xs ${ready && person.designation ? 'text-slate-500' : 'italic text-slate-400'}`}>
                      {!ready ? 'Profile not loaded' : person.designation || 'No designation'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {sections.map((section) => (
                        <span
                          key={section}
                          className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide ${sectionBadge[section]}`}
                        >
                          {section}
                        </span>
                      ))}
                    </div>
                    {ready && (
                      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wide text-slate-400">
                        {person.links.length === 0
                          ? 'No links'
                          : `${person.links.length} ${person.links.length === 1 ? 'link' : 'links'}`}
                        {person.photoUrl ? ' · photo set' : ' · placeholder'}
                      </p>
                    )}
                    {canManage && ready && (
                      <button
                        type="button"
                        onClick={() => openEditor(person)}
                        className="mt-2 flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-ieee-orange"
                      >
                        <Pencil className="h-3 w-3" /> Edit profile
                      </button>
                    )}
                  </div>
                  {savedId === person.id && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={editing?.name ?? ''}
        subtitle={editing ? sectionsFor(editing.id as PersonId).join(' · ') : undefined}
        onClose={closeEditor}
        footer={
          <div className="flex flex-col gap-2">
          {/* Right above the button that caused it. At the foot of the scrolling body this was
              several hundred pixels below the fold for anyone with a long work list, so a refused
              save looked like the button had simply done nothing. */}
          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || photoEditing}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-ieee-orange-dark disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {photoEditing ? 'Finish the photo first' : saving ? 'Saving…' : 'Save profile'}
          </button>
          </div>
        }
      >
        {draft && editing && (
          <div className="flex flex-col gap-5">
            {/* Deliberately not wrapped in AdminField: that renders a <label>, which would make the
                cropper's hidden file input the labelled control, so a click anywhere on the
                cropper -- the hint, the drag stage -- would reopen the file picker. The hierarchy
                editor found this the hard way. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Portrait</span>

              {photoEditing ? (
                <AvatarCropper
                  value={draft.photo || undefined}
                  size={200}
                  onChange={(dataUrl) => {
                    setDraft({ ...draft, photo: dataUrl });
                    setPhotoEditing(false);
                  }}
                  onCancel={() => setPhotoEditing(false)}
                />
              ) : (
                <div className="flex items-center gap-4">
                  <MemberAvatar
                    src={draft.photo}
                    alt=""
                    gender={draft.gender}
                    size="h-20 w-20"
                    className="border border-black/10 bg-white"
                  />
                  <div className="flex flex-col items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPhotoEditing(true)}
                      className="text-sm font-semibold text-slate-600 transition hover:text-ieee-orange"
                    >
                      {/* "Replace", not "reposition": the cropper only ever works on a newly
                          chosen file, so it has no way to move the portrait already saved. */}
                      {draft.photo ? 'Replace photo' : 'Upload a photo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, photo: '' })}
                      disabled={!draft.photo}
                      className="text-xs font-medium text-slate-400 transition hover:text-rose-600 disabled:opacity-40 disabled:hover:text-slate-400"
                    >
                      Remove photo
                    </button>
                    <span className="text-[11px] text-slate-400">JPG, PNG or WebP, cropped to a circle.</span>
                  </div>
                </div>
              )}
            </div>

            <AdminField
              label="Designation"
              hint="Shown under the name, e.g. “Operations Manager IEEE CS CUI”. Leave empty to show none."
            >
              <AdminInput
                value={draft.designation}
                maxLength={120}
                onChange={(event) => setDraft({ ...draft, designation: event.target.value })}
              />
            </AdminField>

            <AdminField
              label="Placeholder portrait"
              hint="Only used while there is no photo. Nothing about this is shown as text."
            >
              <AdminSelect
                value={draft.gender}
                onChange={(event) => setDraft({ ...draft, gender: event.target.value as MemberGender })}
              >
                {GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>

            <MemberLinksEditor links={draft.links} onChange={(links) => setDraft({ ...draft, links })} />

            {/* The locked half, shown so an admin can see what the page says about this person
                and knows where to go to change it. */}
            <div className="rounded-2xl border border-dashed border-black/10 bg-slate-50/60 p-4">
              <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                <Lock aria-hidden="true" className="h-3 w-3" /> Set in the site’s code
              </p>
              <p className="text-sm font-semibold text-slate-800">{editing.name}</p>
              {editingWork.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {editingWork.map((item) => (
                    <li key={item.title} className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">{item.title}</span>
                      {item.detail ? ` — ${item.detail}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">No work items — this person is credited by section only.</p>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                To change the name or the work listed, edit{' '}
                <span className="font-mono text-slate-500">src/data/developers.ts</span>.
              </p>
            </div>

          </div>
        )}
      </AdminEditDrawer>
    </div>
  );
}
