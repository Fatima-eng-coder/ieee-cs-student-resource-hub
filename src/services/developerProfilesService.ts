/**
 * The editable half of the credits page, backed by public.developer_profiles.
 *
 * Only portraits, designations, placeholder genders and links live here. Who is credited, and
 * for what, is authored in src/data/developers.ts — see the note there for why the split is
 * deliberate rather than a gap.
 *
 * There is no remove, on either side. The table grants no DELETE to anyone: taking a row away
 * would silently strip a credited person's photo and links, and there is no situation where that
 * is what an admin meant.
 */

import { supabase } from '@/lib/supabase';
import { PEOPLE, type PersonId } from '@/data/developers';
import type { CreditedPerson, CreditProfile, MemberGender, MemberLink } from '@/types';
import { MEMBER_LINK_TYPES } from '@/types';

/**
 * Portraits share the member-photos bucket with the hierarchy. Its policies already give content
 * managers write access across the whole bucket, and its 2 MB / JPEG-PNG-WebP rules are exactly
 * what a portrait wants. The prefix keeps the two apart: hierarchyService only ever deletes paths
 * it wrote under terms/, so nothing there can reach a file under developers/.
 */
const PHOTO_BUCKET = 'member-photos';
const PHOTO_PREFIX = 'developers';

const columns = 'slug,designation,photo_url,photo_path,gender,links';

interface ProfileRow {
  slug: string;
  designation: string | null;
  photo_url: string | null;
  photo_path: string | null;
  gender: string | null;
  links: unknown;
}

/** What the admin drawer edits. `photo` is a stored URL, a fresh `data:` URL, or '' for none. */
export interface CreditProfileInput {
  designation: string;
  photo: string;
  photoPath: string | null;
  gender: MemberGender;
  links: MemberLink[];
}

/**
 * The fields a save actually writes — only the ones the admin changed.
 *
 * Every save used to upsert the whole row from the drawer's copy, which went wrong two ways.
 * If the profiles had failed to load, the drawer was built from blanks, and saving a new photo
 * wrote an empty designation and an empty link list over the real ones. And with the page open in
 * two tabs, a save that only touched the designation put back whatever photo that tab had loaded —
 * possibly one the other tab had already replaced and deleted, leaving the card on a broken image.
 *
 * PostgREST's upsert sets only the columns it is sent (`ON CONFLICT DO UPDATE SET` names the
 * payload's columns and nothing else), so a field absent from here is a field the database keeps.
 */
export interface CreditProfileChanges {
  designation?: string;
  gender?: MemberGender;
  links?: MemberLink[];
  /** Present only when the portrait changed. A null url clears it. */
  photo?: { url: string | null; path: string | null };
}

/** What a person looks like before anybody has saved anything for them. */
export const EMPTY_PROFILE: CreditProfile = {
  designation: '',
  photoUrl: '',
  photoPath: null,
  gender: 'unknown',
  links: [],
};

const toGender = (value: string | null): MemberGender =>
  value === 'male' || value === 'female' ? value : 'unknown';

/**
 * jsonb arrives as unknown. Anything that is not a well-formed link is dropped rather than
 * rendered: developer_profiles_links_check keeps bad shapes out of the table, but a card that
 * crashed on one would take the whole credits page down with it.
 */
function toLinks(value: unknown): MemberLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { type, label, url } = entry as Record<string, unknown>;
    if (typeof url !== 'string' || !url.trim()) return [];
    if (!(MEMBER_LINK_TYPES as readonly string[]).includes(String(type))) return [];
    return [{ type: type as MemberLink['type'], label: typeof label === 'string' ? label : '', url }];
  });
}

const toProfile = (row: ProfileRow): CreditProfile => ({
  designation: row.designation ?? '',
  photoUrl: row.photo_url ?? '',
  photoPath: row.photo_path,
  gender: toGender(row.gender),
  links: toLinks(row.links),
});

/**
 * Blank links are dropped on the way in, not stored: the table's check refuses an empty url, and
 * a half-filled row in the editor is the admin's draft, not something to publish.
 */
const cleanLinks = (links: MemberLink[]): MemberLink[] =>
  links
    .map((link) => ({ type: link.type, label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => link.url);

function friendlyError(message: string, code?: string): Error {
  const lower = message.toLowerCase();

  if (code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
    return new Error('Only content managers can edit the credits page.');
  }
  if (lower.includes('developer_profiles_links_check')) {
    return new Error('A link is not valid. Each one needs an address, and a profile can hold at most 8.');
  }
  if (lower.includes('developer_profiles_designation_check')) {
    return new Error('That designation is too long. Please keep it under 120 characters.');
  }
  if (lower.includes('developer_profiles_slug_check') || lower.includes('slug')) {
    return new Error('This person’s id in the site’s roster is not valid, so their profile cannot be saved.');
  }
  if (lower.includes('does not exist') || lower.includes('schema cache')) {
    return new Error('The credits table is not ready yet. The developer_profiles migration may not have been applied.');
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return new Error('We could not reach the server. Please check your connection and try again.');
  }
  return new Error('That profile could not be saved right now. Please try again.');
}

/**
 * For reads. The write mapper's last resort is "That profile could not be saved", which is what a
 * failed page load used to show — telling an admin a save had failed before they had saved
 * anything.
 */
function readError(message: string): Error {
  const lower = message.toLowerCase();
  if (lower.includes('does not exist') || lower.includes('schema cache')) {
    return new Error('The credits table is not ready yet. The developer_profiles migration may not have been applied.');
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return new Error('We could not reach the server, so the stored profiles could not be read.');
  }
  return new Error('The stored profiles could not be read right now.');
}

function photoError(message: string): Error {
  const lower = message.toLowerCase();
  if (lower.includes('row-level security') || lower.includes('unauthorized') || lower.includes('permission')) {
    return new Error('Only content managers can upload a portrait.');
  }
  if (lower.includes('maximum allowed size') || lower.includes('too large') || lower.includes('payload')) {
    return new Error('That photo is too large. Please choose a smaller image.');
  }
  if (lower.includes('mime') || lower.includes('content type')) {
    return new Error('That file type is not accepted. Please use a JPG, PNG or WebP image.');
  }
  return new Error('The photo could not be uploaded. Please try again.');
}

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

/** Links compared the way the database will store them, so stray whitespace is not a change. */
const sameLinks = (a: MemberLink[], b: MemberLink[]) =>
  JSON.stringify(cleanLinks(a)) === JSON.stringify(cleanLinks(b));

/**
 * What an edit changed, relative to the profile it was opened from. Photo changes are reported
 * separately by the caller, because turning a fresh crop into a stored url is an upload, not a
 * comparison.
 */
export function diffProfile(before: CreditProfile, after: CreditProfileInput): Omit<CreditProfileChanges, 'photo'> {
  const changes: Omit<CreditProfileChanges, 'photo'> = {};
  if (after.designation.trim() !== before.designation.trim()) changes.designation = after.designation;
  if (after.gender !== before.gender) changes.gender = after.gender;
  if (!sameLinks(after.links, before.links)) changes.links = after.links;
  return changes;
}

export const developerProfilesService = {
  /**
   * Every profile row, keyed by slug.
   *
   * A person with no row is simply absent from the map, and callers merge with EMPTY_PROFILE —
   * the roster decides who is on the page, and a missing row must never take somebody off it.
   */
  async listProfiles(): Promise<Map<string, CreditProfile>> {
    const { data, error } = await supabase.from('developer_profiles').select(columns);
    if (error) throw readError(error.message);

    return new Map(((data ?? []) as ProfileRow[]).map((row) => [row.slug, toProfile(row)]));
  },

  /** A roster entry with its profile merged in. */
  resolve(id: PersonId, profiles: Map<string, CreditProfile>): CreditedPerson {
    return { ...PEOPLE[id], ...(profiles.get(id) ?? EMPTY_PROFILE) };
  },

  /**
   * The portrait path the row holds right now, read fresh.
   *
   * Used to decide which file a replacement makes redundant. Taken from the database rather than
   * from the page, because the page may be minutes old: if another tab replaced the portrait in
   * the meantime, the page's idea of the "old" file has already been deleted, and the file that
   * genuinely needs removing is the one that tab uploaded.
   */
  async currentPhotoPath(id: PersonId): Promise<string | null> {
    const { data, error } = await supabase
      .from('developer_profiles')
      .select('photo_path')
      .eq('slug', id)
      .maybeSingle();
    if (error) throw readError(error.message);
    return (data as { photo_path: string | null } | null)?.photo_path ?? null;
  },

  /**
   * Writes the changed fields for one person, creating their row if it does not exist yet, and
   * returns what the database now holds.
   *
   * An upsert because a person added to the roster in code has no row until somebody first saves
   * them. The slug is the conflict key and is never itself a changed value, so the slug-freeze
   * trigger cannot fire here.
   *
   * Read back with maybeSingle and null-checked. A refusal here normally arrives as a 42501 error,
   * but an UPDATE that row-level security filters rather than refuses comes back as no row and no
   * error, and without the check that would look exactly like a save.
   */
  async save(id: PersonId, changes: CreditProfileChanges): Promise<CreditProfile> {
    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();

    const payload: Record<string, unknown> = { slug: id, updated_by: userData.user?.id ?? null };
    if (changes.designation !== undefined) payload.designation = changes.designation.trim();
    if (changes.gender !== undefined) payload.gender = changes.gender;
    if (changes.links !== undefined) payload.links = cleanLinks(changes.links);
    if (changes.photo !== undefined) {
      payload.photo_url = changes.photo.url || null;
      // developer_profiles_photo_check: a path is only meaningful beside a url.
      payload.photo_path = changes.photo.url ? changes.photo.path : null;
    }

    const { data, error } = await supabase
      .from('developer_profiles')
      .upsert(payload, { onConflict: 'slug' })
      .select(columns)
      .maybeSingle();

    if (error) throw friendlyError(error.message, error.code);
    if (!data) throw new Error('That profile was not saved. Your account may no longer be allowed to edit the credits page.');
    return toProfile(data as ProfileRow);
  },

  /**
   * Stores a cropped portrait and returns both halves of the reference.
   *
   * The url is what renders; the path is what a later replacement needs in order to remove this
   * file. A row that kept only the url would own a file nothing could ever clean up.
   */
  async uploadPhoto(dataUrl: string, id: PersonId): Promise<{ url: string; path: string }> {
    if (!dataUrl.startsWith('data:image/')) throw new Error('Please choose an image before saving the photo.');

    await refreshAuthSession();
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${PHOTO_PREFIX}/${id}/${crypto.randomUUID()}.jpg`;

    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { cacheControl: '3600', contentType: 'image/jpeg', upsert: false });

    if (error) throw photoError(error.message);

    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  /**
   * Best effort, and only ever inside developers/. A replaced portrait that lingers is not worth
   * failing a save that otherwise worked, and the prefix check means a bad path can never reach
   * a hierarchy portrait living in the same bucket.
   */
  async discardPhoto(path: string | null): Promise<void> {
    if (!path || !path.startsWith(`${PHOTO_PREFIX}/`)) return;

    await refreshAuthSession();
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (error) console.warn('Could not remove a replaced developer portrait', error);
  },
};
