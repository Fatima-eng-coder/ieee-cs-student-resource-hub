import { supabase } from '@/lib/supabase';
import type { HierarchyMember, HierarchyRole } from '@/types';

const MEMBER_PHOTOS_BUCKET = 'member-photos';

const roleColumns = 'slug,title,tier,rank,allows_multiple';
const termColumns = 'id,term,label,is_current,created_at';
const memberColumns = 'id,term_id,role_slug,name,seat,photo_url,photo_path,email,linkedin';

/** Where a member whose role is not in the catalogue sorts: last, but still on the page. */
export const UNFILED_TIER = 99;

/**
 * A row of public.hierarchy_terms.
 *
 * `HierarchyTerm` in @/types carries its roster inline, which the table does not — members
 * are a separate table keyed by this id — so this is its own shape rather than an extension.
 */
export interface HierarchyTermRecord {
  id: string;
  term: string;
  label: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface HierarchyMemberRecord extends HierarchyMember {
  termId: string;
  /**
   * The storage object behind `photo`, or null when the photo is not ours to delete — the
   * shipped placeholder, or a URL typed in by hand.
   */
  photoPath: string | null;
}

export interface HierarchyMemberInput {
  termId: string;
  roleSlug: string;
  name: string;
  /** Null for a role only one person holds; the database keys its uniqueness on COALESCE(seat, 0). */
  seat: number | null;
  photo: string;
  photoPath: string | null;
  email: string | null;
  linkedin: string | null;
}

/** Everything a page needs to draw the serving council, resolved together. */
export interface HierarchyCouncil {
  roles: HierarchyRole[];
  term: HierarchyTermRecord | null;
  members: HierarchyMemberRecord[];
}

interface HierarchyRoleRow {
  slug: string;
  title: string;
  tier: number;
  rank: number;
  allows_multiple: boolean;
}

interface HierarchyTermRow {
  id: string;
  term: string;
  label: string;
  is_current: boolean;
  created_at: string;
}

interface HierarchyMemberRow {
  id: string;
  term_id: string;
  role_slug: string;
  name: string;
  seat: number | null;
  photo_url: string | null;
  photo_path: string | null;
  email: string | null;
  linkedin: string | null;
}

const toRole = (row: HierarchyRoleRow): HierarchyRole => ({
  slug: row.slug,
  title: row.title,
  tier: row.tier,
  rank: row.rank,
  multiple: row.allows_multiple,
});

const toTerm = (row: HierarchyTermRow): HierarchyTermRecord => ({
  id: row.id,
  term: row.term,
  label: row.label,
  isCurrent: row.is_current,
  createdAt: row.created_at,
});

/**
 * `photo` is left empty rather than filled with the placeholder: which image stands in for a
 * missing portrait is a presentation decision, and every surface already makes it.
 */
const toMember = (row: HierarchyMemberRow): HierarchyMemberRecord => ({
  id: row.id,
  termId: row.term_id,
  roleSlug: row.role_slug,
  name: row.name,
  seat: row.seat ?? undefined,
  photo: row.photo_url ?? '',
  photoPath: row.photo_path,
  email: row.email ?? undefined,
  linkedin: row.linkedin ?? undefined,
});

/** Empty strings become NULL, so "cleared" and "never set" are one fact in the database. */
const blankToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const toMemberPayload = (input: HierarchyMemberInput) => ({
  term_id: input.termId,
  role_slug: input.roleSlug,
  name: input.name.trim(),
  seat: input.seat ?? null,
  photo_url: blankToNull(input.photo),
  photo_path: blankToNull(input.photoPath),
  email: blankToNull(input.email),
  linkedin: blankToNull(input.linkedin),
});

/**
 * Turns a PostgREST failure into something an admin can act on.
 *
 * 23505 is the one worth naming precisely: the unique index is
 * (term_id, role_slug, COALESCE(seat, 0)), so it fires when a seat number is reused *and*
 * when a second person is given a role only one person holds. Both read as an occupied seat,
 * which is what actually happened; the constraint name explains nothing to the person typing.
 */
/**
 * Reads are the paths a signed-out visitor hits, so their failures are the ones that end up on
 * the public hierarchy page. PostgREST's own wording — "permission denied for table
 * hierarchy_members" — reads to a visitor as a broken site rather than as something the team
 * needs to hear about, so it is not what the page shows.
 */
function readError(error: { code?: string | null; message: string }): Error {
  const lower = error.message.toLowerCase();

  if (error.code === '42501' || lower.includes('permission denied') || lower.includes('row-level security')) {
    return new Error('This council is not readable right now.');
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return new Error('We could not reach the server. Please check your connection and try again.');
  }
  return new Error('The council could not be loaded right now. Please try again in a moment.');
}

function memberError(error: { code?: string | null; message: string }, action: string): Error {
  if (error.code === '42501') return new Error(`Only content managers can ${action}.`);
  // A row-level-security refusal on UPDATE is not an error: Postgres filters the row out of
  // the statement, so PostgREST returns no rows and `.single()` fails with PGRST116 instead of
  // 42501. Reported raw — "JSON object requested, multiple (or no) rows returned" — it reads
  // as a bug in the page rather than as a save that did not happen, which is how an edit that
  // silently changed nothing gets mistaken for one that worked.
  if (error.code === 'PGRST116') {
    return new Error(
      `Nothing was saved. Only content managers can ${action}, and this member may also have been removed by someone else. Reload to see what is stored.`
    );
  }
  if (error.code === '23505') {
    return new Error('That seat is already filled. Give this person a different seat, or edit the one already there.');
  }
  if (error.code === '23503') {
    return new Error('That role is no longer in the role catalogue. Reload the page and choose again.');
  }
  if (error.code === '23514') return new Error('Please enter a name, and a seat number of 1 or more.');
  return new Error(error.message);
}

/**
 * Both term RPCs raise the same two SQLSTATEs deliberately, so they map the same way.
 *
 * 42501 is the function's own permission check rather than a policy: both are SECURITY
 * DEFINER, so a refusal arrives as a raised exception with a message, not as the silent
 * zero-row filtering a plain table write would produce.
 *
 * `PGRST202` is worth naming: it is PostgREST reporting that the function does not exist,
 * which is what a project restored without 20260902001000_hierarchy_tiers_and_archive_terms
 * looks like. Left generic it reads as a broken button rather than as a missing migration.
 */
function termError(error: { code?: string | null; message: string }, action: string): Error {
  if (error.code === '42501') return new Error(`Only content managers can ${action}.`);
  if (error.code === '22023') return new Error('A term code and a label are both required.');
  if (error.code === 'PGRST202') {
    return new Error('This project is missing the database function that does that. Its migrations need applying.');
  }
  return new Error(error.message || 'That term could not be saved. Please try again.');
}

/**
 * Storage failures arrive as prose, not as SQLSTATEs, so they are matched on text.
 *
 * "Bucket not found" earns its own branch because a project restored without
 * 20260901001200_member_photos_bucket.sql fails here and nowhere else: the roster still
 * loads, still saves, and only the photo refuses. Left as the generic message, that reads as
 * a broken upload button rather than as a bucket nobody has created yet.
 */
function photoError(message: string): Error {
  const lower = message.toLowerCase();

  if (lower.includes('bucket not found')) {
    return new Error(
      'Member photo storage has not been created yet, so the photo could not be saved. Everything else about this member can still be edited.'
    );
  }
  if (lower.includes('row-level security') || lower.includes('unauthorized') || lower.includes('permission')) {
    return new Error('Only content managers can upload member photos.');
  }
  if (lower.includes('maximum allowed size') || lower.includes('too large') || lower.includes('payload')) {
    return new Error('That photo is too large. Please choose a smaller image.');
  }
  if (lower.includes('mime') || lower.includes('content type')) {
    return new Error('That file type cannot be used as a photo. Please choose a JPG, PNG, or WebP image.');
  }
  return new Error('That photo could not be uploaded right now. Please try again.');
}

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

/** AvatarCropper hands back a data URL; storage wants bytes. */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Deletes a photo only once nothing points at it any more.
 *
 * Carrying a roster forward copies photo_path as well as photo_url, so one file can back a
 * person in several terms at once. Deleting this term's row must not blank out their portrait
 * in the archive. Best effort throughout: the row is already gone by the time this runs, and
 * a leftover file is a smaller problem than an error message about a delete that succeeded.
 */
async function discardOrphanedPhoto(path: string | null): Promise<void> {
  if (!path) return;

  const { data, error } = await supabase.from('hierarchy_members').select('id').eq('photo_path', path).limit(1);
  if (error) {
    console.warn('Could not check whether a member photo is still in use', error);
    return;
  }
  if ((data ?? []).length > 0) return;

  const { error: removeError } = await supabase.storage.from(MEMBER_PHOTOS_BUCKET).remove([path]);
  if (removeError) console.warn('Could not remove an unused member photo', removeError);
}

/** Slug → role. Built from the table the site reads, never from the static catalogue. */
export function indexRoles(roles: HierarchyRole[]): Map<string, HierarchyRole> {
  return new Map(roles.map((role) => [role.slug, role]));
}

/** Falls back to the raw slug, so a role missing from the catalogue still names itself. */
export function titleForRole(index: Map<string, HierarchyRole>, slug: string): string {
  return index.get(slug)?.title ?? slug;
}

/**
 * Publication order: tier, then rank within the tier, then seat, then name. Identical in the
 * admin editor and on the public pages, so what an admin arranges is what a visitor sees.
 */
export function sortMembers(
  members: HierarchyMemberRecord[],
  index: Map<string, HierarchyRole>
): HierarchyMemberRecord[] {
  return [...members].sort((a, b) => {
    const roleA = index.get(a.roleSlug);
    const roleB = index.get(b.roleSlug);
    return (
      (roleA?.tier ?? UNFILED_TIER) - (roleB?.tier ?? UNFILED_TIER) ||
      (roleA?.rank ?? 0) - (roleB?.rank ?? 0) ||
      (a.seat ?? 0) - (b.seat ?? 0) ||
      a.name.localeCompare(b.name)
    );
  });
}

/*
 * There is deliberately no subscribeHierarchyChanged here. Realtime delivers postgres_changes
 * only for tables in the supabase_realtime publication, and neither hierarchy_terms nor
 * hierarchy_members is in it — the publication carries announcements, course_materials, events
 * and nav_links and nothing else. A channel on these tables subscribes cleanly and then never
 * fires, which reads as a live-sync feature that silently is not one. Restoring it means adding
 * both tables to the publication in a migration first.
 */

export const hierarchyService = {
  /**
   * The role catalogue, ordered the way the chart is drawn.
   *
   * src/data/hierarchy.ts ships the same nine roles, and the two are free to disagree: adding
   * a role, renaming one, or re-ranking the tree changes public.hierarchy_roles and nothing
   * else. The table therefore wins outright — no page merges the two lists, and the static
   * one survives only as the seed the migration was written from and as the home of
   * PLACEHOLDER_PHOTO. A slug that appears on a member but not in this list is not dropped;
   * it renders under its own slug at the bottom of the chart, so a role someone created
   * directly in the database is visible rather than invisible.
   */
  async listRoles(): Promise<HierarchyRole[]> {
    const { data, error } = await supabase
      .from('hierarchy_roles')
      .select(roleColumns)
      .order('tier', { ascending: true })
      .order('rank', { ascending: true });

    if (error) throw readError(error);
    return (data ?? []).map((row) => toRole(row as HierarchyRoleRow));
  },

  /** Current term first, then newest to oldest — the order the archive selector reads in. */
  async listTerms(): Promise<HierarchyTermRecord[]> {
    const { data, error } = await supabase
      .from('hierarchy_terms')
      .select(termColumns)
      .order('is_current', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw readError(error);
    return (data ?? []).map((row) => toTerm(row as HierarchyTermRow));
  },

  async listMembers(termId: string): Promise<HierarchyMemberRecord[]> {
    const { data, error } = await supabase
      .from('hierarchy_members')
      .select(memberColumns)
      .eq('term_id', termId)
      .order('role_slug', { ascending: true })
      .order('seat', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true });

    if (error) throw readError(error);
    return (data ?? []).map((row) => toMember(row as HierarchyMemberRow));
  },

  /**
   * Roles, the serving term and its roster — what every public surface needs, in one pass.
   *
   * The serving term is found by its flag and never by position. A term promoted back out of
   * the archive keeps its original created_at, so "newest" and "current" are not the same row.
   */
  async loadCurrentCouncil(): Promise<HierarchyCouncil> {
    const [roles, terms] = await Promise.all([this.listRoles(), this.listTerms()]);
    const term = terms.find((candidate) => candidate.isCurrent) ?? null;
    const members = term ? await this.listMembers(term.id) : [];
    return { roles, term, members };
  },

  async createMember(input: HierarchyMemberInput): Promise<HierarchyMemberRecord> {
    if (!input.name.trim()) throw new Error('Please enter a name for this member.');

    await refreshAuthSession();
    const { data, error } = await supabase
      .from('hierarchy_members')
      .insert(toMemberPayload(input))
      .select(memberColumns)
      .single();

    if (error) throw memberError(error, 'add someone to the council');
    return toMember(data as HierarchyMemberRow);
  },

  async updateMember(id: string, input: HierarchyMemberInput): Promise<HierarchyMemberRecord> {
    if (!input.name.trim()) throw new Error('Please enter a name for this member.');

    await refreshAuthSession();
    const { data, error } = await supabase
      .from('hierarchy_members')
      .update(toMemberPayload(input))
      .eq('id', id)
      .select(memberColumns)
      .single();

    if (error) throw memberError(error, 'edit the council');
    return toMember(data as HierarchyMemberRow);
  },

  /**
   * Removes the row first, then the portrait behind it — and only if the row really went.
   *
   * A refused DELETE is not an error here either: the policy filters the row out and PostgREST
   * answers 204 with nothing to complain about, so the caller would drop the card from the
   * page and sweep the photograph out of the bucket for a member who is still published. The
   * count is the only evidence, and only an explicit zero counts — a null count means the
   * server did not send the header, which is not the same as "no rows matched".
   *
   * Reachable without anyone doing anything strange: canManageContent() reads a profile cached
   * at login, so an admin demoted mid-session still passes the client-side gate.
   */
  async removeMember(member: HierarchyMemberRecord): Promise<void> {
    await refreshAuthSession();
    const { error, count } = await supabase
      .from('hierarchy_members')
      .delete({ count: 'exact' })
      .eq('id', member.id);

    if (error) throw memberError(error, 'remove someone from the council');
    if (count === 0) {
      throw new Error(
        'Nothing was removed. Only content managers can remove someone from the council, and this member may already be gone. Reload to see what is stored.'
      );
    }

    await discardOrphanedPhoto(member.photoPath);
  },

  /**
   * Promotes a term to current and archives the outgoing one.
   *
   * The whole promotion is public.start_hierarchy_term: a partial unique index permits only
   * one current term, so demoting and promoting have to happen inside one statement or the
   * second half is rejected. Doing it here in two writes would also mean a browser closed
   * between them leaves the site with no serving council.
   *
   * A code that already exists is promoted back out of the archive rather than rejected —
   * that is the function's ON CONFLICT branch, and it is the only way to correct a term
   * started by mistake.
   */
  async startTerm(term: string, label: string): Promise<HierarchyTermRecord> {
    const code = term.trim();
    const name = label.trim();
    if (!code || !name) throw new Error('A term code and a label are both required.');

    await refreshAuthSession();
    const { data, error } = await supabase.rpc('start_hierarchy_term', { new_term: code, new_label: name });

    if (error) throw termError(error, 'start a new term');
    return toTerm(data as HierarchyTermRow);
  },

  /**
   * Files a term without giving it the site.
   *
   * The counterpart to startTerm, and the only way to enter a council that has already
   * finished. start_hierarchy_term promotes whatever it creates, so using it for a 2024
   * archive would hand the homepage, the About page and the Hierarchy page to a term from two
   * years ago; add_hierarchy_term never touches is_current on any row.
   *
   * Adding a code that already exists corrects its public name and leaves everything else
   * alone — including which term is serving, so this can never be the thing that archives the
   * current council by accident.
   */
  async addTerm(term: string, label: string): Promise<HierarchyTermRecord> {
    const code = term.trim();
    const name = label.trim();
    if (!code || !name) throw new Error('A term code and a label are both required.');

    await refreshAuthSession();
    const { data, error } = await supabase.rpc('add_hierarchy_term', { new_term: code, new_label: name });

    if (error) throw termError(error, 'add a term to the archive');
    return toTerm(data as HierarchyTermRow);
  },

  /**
   * Copies one term's roster onto another as a starting point.
   *
   * Never called as part of starting a term: an admin filling fifteen seats by hand every
   * semester is the thing this exists to avoid, but a council that quietly re-elects itself
   * because nobody noticed a copy had happened is the worse failure. The caller asks.
   *
   * photo_path is copied alongside photo_url, so both terms reference the same file and
   * neither can delete it out from under the other — see discardOrphanedPhoto.
   */
  async copyRoster(fromTermId: string, toTermId: string): Promise<HierarchyMemberRecord[]> {
    if (fromTermId === toTermId) return [];

    const source = await this.listMembers(fromTermId);
    if (source.length === 0) return [];

    await refreshAuthSession();
    const { data, error } = await supabase
      .from('hierarchy_members')
      .insert(
        source.map((member) => ({
          term_id: toTermId,
          role_slug: member.roleSlug,
          name: member.name,
          seat: member.seat ?? null,
          photo_url: blankToNull(member.photo),
          photo_path: member.photoPath,
          email: blankToNull(member.email),
          linkedin: blankToNull(member.linkedin),
        }))
      )
      .select(memberColumns);

    if (error) throw memberError(error, 'carry a roster forward');
    return ((data ?? []) as HierarchyMemberRow[]).map(toMember);
  },

  /**
   * Stores a cropped portrait and returns both halves of the reference.
   *
   * The url is what the page renders and the path is what a later delete needs; a row that
   * records only the url owns a file it can never clean up.
   */
  async uploadPhoto(dataUrl: string, termId: string): Promise<{ url: string; path: string }> {
    if (!dataUrl.startsWith('data:image/')) throw new Error('Please choose an image before saving the photo.');

    await refreshAuthSession();
    const blob = await dataUrlToBlob(dataUrl);
    const path = `terms/${termId}/${crypto.randomUUID()}.jpg`;

    const { error } = await supabase.storage
      .from(MEMBER_PHOTOS_BUCKET)
      .upload(path, blob, { cacheControl: '3600', contentType: 'image/jpeg', upsert: false });

    if (error) throw photoError(error.message);

    const { data } = supabase.storage.from(MEMBER_PHOTOS_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  /**
   * Best effort: a replaced portrait that lingers is not worth failing an otherwise good save.
   *
   * It refreshes the session itself rather than relying on the caller's, because a storage
   * delete on an expired token fails into the console.warn below it — the file is never
   * removed and nobody is told. Callers that already refreshed pay one redundant refresh.
   */
  async discardPhoto(path: string | null): Promise<void> {
    if (!path) return;
    await refreshAuthSession();
    await discardOrphanedPhoto(path);
  },
};
