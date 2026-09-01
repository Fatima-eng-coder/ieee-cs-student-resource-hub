import { supabase } from '@/lib/supabase';
import { SOCIETY_ROLES, type Profile, type ProfileRole } from '@/types';

interface ProfileRow {
  id: string;
  name: string | null;
  email: string | null;
  role: ProfileRole;
  created_at: string;
}

interface DirectoryProfileRow extends ProfileRow {
  secondary_email: string | null;
  whatsapp: string | null;
  class_name: string | null;
  section: string | null;
  degree: string | null;
}

/** A profile with the contact details the admin roster and its CSV export need. */
export interface DirectoryProfile extends Profile {
  secondaryEmail: string;
  whatsapp: string;
  className: string;
  section: string;
  degree: string;
}

const profileColumns = 'id,name,email,role,created_at';
const directoryColumns = `${profileColumns},secondary_email,whatsapp,class_name,section,degree`;

/** PostgREST answers with at most 1000 rows, so a bigger roster must be walked. */
const PAGE_SIZE = 1000;

/** Backstop against a range window that never advances; 50k profiles is far
 * beyond a single society's roster. */
const MAX_PAGES = 50;

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  name: row.name ?? 'Unnamed user',
  email: row.email ?? 'No email available',
  role: row.role,
  createdAt: row.created_at,
});

/**
 * Missing contact details stay empty here rather than reusing the sentinel
 * prose above: these values are exported verbatim, and a spreadsheet column of
 * "No email available" reads as data the admin has to clean out by hand.
 */
const toDirectoryProfile = (row: DirectoryProfileRow): DirectoryProfile => ({
  id: row.id,
  name: row.name ?? 'Unnamed user',
  email: row.email ?? '',
  role: row.role,
  createdAt: row.created_at,
  secondaryEmail: row.secondary_email ?? '',
  whatsapp: row.whatsapp ?? '',
  className: row.class_name ?? '',
  section: row.section ?? '',
  degree: row.degree ?? '',
});

const sanitizeSearch = (query: string) => query.trim().replace(/[,%()]/g, ' ');

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

/** Raised when the database refuses the read, so the page can offer a
 * permissions explanation instead of an empty roster. */
export class ProfilesAccessError extends Error {}

/**
 * Only content managers hold the grant on profiles. Everyone else is answered
 * with 42501, whose raw text ("permission denied for table profiles") reads as
 * a broken page rather than as a boundary the admin can act on.
 */
function toProfilesError(error: { code?: string; message?: string }): Error {
  const message = error.message ?? 'Could not read profiles.';
  if (error.code === '42501' || /permission denied|row-level security|not authoriz/i.test(message)) {
    return new ProfilesAccessError(
      'You do not have access to student profiles. Only the webmaster, chairperson, vice chairperson and general secretary can read them.',
    );
  }
  return new Error(message);
}

/** What public.delete_student_account() hands back. */
interface DeletedAccountRow {
  deleted_id?: string;
  name?: string;
  email?: string;
  contributions_kept?: number;
}

export interface DeletedAccountSummary {
  id: string;
  name: string;
  email: string;
  /** Rows a future re-link can restore to them: uploads, requests, suggestions, responses. */
  contributionsKept: number;
}

/**
 * The function raises its own refusals with meaningful text, so those are passed through
 * rather than flattened. Only the two codes that arrive as database noise are rewritten.
 */
function toDeleteError(error: { code?: string; message?: string }): Error {
  const message = error.message ?? 'That account could not be deleted.';

  if (error.code === 'P0002') return new Error('That account no longer exists. Refresh the list.');
  if (error.code === '42501') return new Error(message);
  if (error.code === '23503') {
    return new Error(
      'Something still references that account, so it was not deleted. Nothing was changed — please report this.',
    );
  }
  return new Error(message);
}

async function fetchDirectory(role?: ProfileRole): Promise<DirectoryProfile[]> {
  const profiles: DirectoryProfile[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    let query = supabase
      .from('profiles')
      .select(directoryColumns)
      .order('created_at', { ascending: false })
      // Each page is its own query, so rows sharing a created_at could come
      // back in a different order per page — repeating one profile and dropping
      // another. The id breaks every tie into a total order.
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (role) query = query.eq('role', role);

    const { data, error } = await query;
    if (error) throw toProfilesError(error);

    const batch = (data ?? []) as DirectoryProfileRow[];
    profiles.push(...batch.map(toDirectoryProfile));
    if (batch.length < PAGE_SIZE) break;
  }

  return profiles;
}

export const profilesService = {
  async listCoreTeam(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select(profileColumns)
      .in('role', [...SOCIETY_ROLES])
      .order('role', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw toProfilesError(error);
    return ((data ?? []) as ProfileRow[]).map(toProfile);
  },

  /** Every student profile, newest first. */
  async listStudents(): Promise<DirectoryProfile[]> {
    return fetchDirectory('student');
  },

  /** The whole roster, students and society roles alike, newest first. */
  async listAll(): Promise<DirectoryProfile[]> {
    return fetchDirectory();
  },

  async searchStudents(query: string): Promise<Profile[]> {
    const term = sanitizeSearch(query);
    if (term.length < 2) return [];

    const { data, error } = await supabase
      .from('profiles')
      .select(profileColumns)
      .eq('role', 'student')
      .or(`name.ilike.%${term}%,email.ilike.%${term}%`)
      .order('name', { ascending: true })
      .limit(10);

    if (error) throw toProfilesError(error);
    return ((data ?? []) as ProfileRow[]).map(toProfile);
  },

  async updateRole(profileId: string, role: ProfileRole): Promise<Profile> {
    await refreshAuthSession();
    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', profileId)
      .select(profileColumns)
      .single();

    if (error) throw toProfilesError(error);
    return toProfile(data as ProfileRow);
  },

  /**
   * Deletes a login and keeps everything it contributed.
   *
   * This is what stands in for a password reset. The student signs up again on the same
   * university address and relink_student_activity() — which authService.signup already
   * calls — adopts their history back. The row-keeping is done inside the database function,
   * because fifteen columns across eleven tables point at auth.users and getting one of them
   * wrong from the client would either abort the delete or lose a contribution.
   *
   * Returns how many contributions were kept, which is the number worth putting in front of
   * the admin afterwards.
   */
  async deleteStudentAccount(profileId: string): Promise<DeletedAccountSummary> {
    await refreshAuthSession();

    const { data, error } = await supabase.rpc('delete_student_account', { p_user_id: profileId });

    if (error) throw toDeleteError(error);

    const row = (data ?? {}) as DeletedAccountRow;
    return {
      id: row.deleted_id ?? profileId,
      name: row.name ?? 'That account',
      email: row.email ?? '',
      contributionsKept: row.contributions_kept ?? 0,
    };
  },

  subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;

    let timeout: number | null = null;
    const scheduleCallback = () => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(callback, 150);
    };

    const channel = supabase
      .channel(`profiles-sync-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleCallback)
      .subscribe();

    return () => {
      if (timeout) window.clearTimeout(timeout);
      void supabase.removeChannel(channel);
    };
  },
};
