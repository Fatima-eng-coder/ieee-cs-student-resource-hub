import { supabase } from '@/lib/supabase';
import {
  cleanText,
  describeEmailRule,
  isPakistaniMobile,
  normalisePakistaniMobile,
  normaliseUniversityEmail,
  parseUniversityEmail,
  passwordIssues,
} from '@/utils/validation';
import type { User } from '@/types';

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface SignupInput {
  name: string;
  /** University address. The only accepted domain — see utils/validation.ts. */
  email: string;
  /** Personal address, used if they ever lose access to the university one. */
  secondaryEmail?: string;
  whatsapp?: string;
  className?: string;
  section?: string;
  degree?: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthError extends Error {}

/** Supabase's own wording leaks implementation detail; say the useful part instead. */
/**
 * Only for the auth.signUp step. A duplicate here really does mean the address is taken.
 */
function friendlySignupError(message?: string): string {
  const raw = (message ?? '').toLowerCase();
  if (raw.includes('already registered') || raw.includes('already exists') || raw.includes('duplicate key')) {
    return 'An account already exists for that university email. Try logging in instead.';
  }
  if (raw.includes('rate limit') || raw.includes('too many')) {
    return 'Too many attempts just now. Wait a minute and try again.';
  }
  if (raw.includes('weak') || raw.includes('password')) {
    return 'That password was rejected. Pick a longer one.';
  }
  return message || 'Could not create the account.';
}

/**
 * Saving the profile details is a different step with different failure modes, and it must
 * never say "that email is already registered". A duplicate key at this point means something
 * has gone wrong with the row the database itself just created — not that the address is
 * taken. Reporting it as "already registered" is exactly the bug this separation fixes: a
 * signup that had in fact succeeded told the student their account already existed.
 */
function friendlyProfileError(message?: string): string {
  const raw = (message ?? '').toLowerCase();

  if (raw.includes('row-level security') || raw.includes('permission denied')) {
    return 'Your account was created but its details could not be saved. Please log in and complete your profile.';
  }
  if (raw.includes('profiles_email_lower_key')) {
    return 'Another account is already using that university email. Please contact the team.';
  }
  if (raw.includes('network') || raw.includes('fetch')) {
    return 'Your account was created but we lost the connection before saving your details. Please log in and try again.';
  }
  return 'Your account was created but its details could not be saved. Please log in and complete your profile.';
}

const toUser = (profile: ProfileRow): User => ({
  id: profile.id,
  name: profile.name,
  email: profile.email,
  avatar: '',
  createdAt: profile.created_at,
});

/**
 * PGRST116 is PostgREST's "no rows matched" for `.single()`. Every other error — a missing
 * GRANT (42501), an RLS denial, a network failure — is a real fault and must surface.
 *
 * This used to swallow all of them into `null`, which made a genuinely missing profile
 * indistinguishable from a permission problem. The caller then fell back to a fabricated
 * user object, so the UI looked signed in while nothing had actually been read. That is how
 * a table-level permission gap stayed invisible.
 */
async function getProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,email,created_at')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new AuthError(`Could not read your profile (${error.code ?? 'unknown'}): ${error.message}`);
  }
  return data ? toUser(data as ProfileRow) : null;
}

async function ensureStudentProfile(userId: string, name: string, email: string): Promise<User> {
  const existing = await getProfile(userId);
  if (existing) return existing;

  const profile = {
    id: userId,
    name: name.trim() || email.split('@')[0],
    email: email.trim().toLowerCase(),
    role: 'student',
  };

  const { data, error } = await supabase
    .from('profiles')
    .insert(profile)
    .select('id,name,email,created_at')
    .single();

  if (error) throw new AuthError(error.message);
  return toUser(data as ProfileRow);
}

export const authService = {
  /** Supabase restores sessions async, so AuthProvider refreshes this after mount. */
  getCurrentUser(): User | null {
    return null;
  },

  async loadCurrentUser(): Promise<User | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return getProfile(data.user.id);
  },

  async signup(input: SignupInput): Promise<User> {
    const name = cleanText(input.name, 80);
    const email = normaliseUniversityEmail(input.email);

    if (!name) throw new AuthError('Please enter your full name.');
    if (!email) throw new AuthError(describeEmailRule());

    const issues = passwordIssues(input.password, { email, name });
    if (issues.length > 0) throw new AuthError(issues[0]);

    // Optional, but if given they must be usable — a WhatsApp number nobody can dial is
    // worse than none, because the team will try it.
    let whatsapp: string | null = null;
    if (input.whatsapp?.trim()) {
      if (!isPakistaniMobile(input.whatsapp)) {
        throw new AuthError('That does not look like a Pakistani mobile number.');
      }
      whatsapp = normalisePakistaniMobile(input.whatsapp);
    }

    // Required, because this is the address the team actually writes to: the university
    // mailbox is the identity, not the inbox anyone reads.
    const secondaryEmail = input.secondaryEmail?.trim().toLowerCase() || '';
    if (!secondaryEmail) {
      throw new AuthError('Please add a personal email address — that is where we will contact you.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(secondaryEmail)) {
      throw new AuthError('That personal email address does not look valid.');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: { data: { name } },
    });

    if (error || !data.user) {
      throw new AuthError(friendlySignupError(error?.message));
    }

    if (!data.session) {
      throw new AuthError('Account created. Please confirm your email, then log in.');
    }

    // The programme code is already in the address, so do not make them retype it.
    const parsed = parseUniversityEmail(email);

    const details = {
      name,
      secondary_email: secondaryEmail,
      whatsapp,
      class_name: cleanText(input.className ?? '', 40) || null,
      section: cleanText(input.section ?? '', 8) || null,
      degree: cleanText(input.degree ?? '', 40) || parsed?.programme?.toUpperCase() || null,
    };

    /*
     * The profile row already exists by the time signUp resolves. The database builds it from
     * an AFTER INSERT trigger on auth.users:
     *
     *   on_auth_user_created_create_profile -> public.handle_new_user_profile()
     *
     * which writes id, name, email and role, and nothing else. Inserting it again from here
     * raised 23505 on profiles_pkey, and the old error mapper read "duplicate key" as "that
     * university email is already registered" — so a signup that had genuinely just succeeded
     * told the student their account already existed, while the six columns this form exists
     * to collect were silently dropped. That is the bug.
     *
     * email and role are deliberately not sent. The trigger already took the address from
     * auth.users, which is the copy relink_student_activity() matches on, and
     * profiles_guard_identity_columns rejects a change to either.
     */
    const { data: updated, error: profileError } = await supabase
      .from('profiles')
      .update(details)
      .eq('id', data.user.id)
      .select('id');

    if (profileError) throw new AuthError(friendlyProfileError(profileError.message));

    // If that trigger is ever dropped, the update matches nothing and every detail would be
    // lost without a word. The insert stays as the fallback rather than as the assumption.
    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, email, role: 'student', ...details });

      if (insertError) throw new AuthError(friendlyProfileError(insertError.message));
    }

    // If this address contributed before under a deleted account, reclaim that history.
    // A failure here costs the user nothing they can see, so it must not block signing up.
    const { error: relinkError } = await supabase.rpc('relink_student_activity');
    if (relinkError) console.error('Could not re-link previous activity', relinkError);

    const profile = await getProfile(data.user.id);
    if (!profile) throw new AuthError('Your account was created but the profile could not be read.');
    return profile;
  },

  async login({ email, password }: LoginInput): Promise<User> {
    const normalized = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    });

    if (error || !data.user) {
      throw new AuthError('Incorrect email or password.');
    }

    const profile = await getProfile(data.user.id);
    if (profile) return profile;

    return ensureStudentProfile(
      data.user.id,
      data.user.user_metadata.name ?? normalized.split('@')[0],
      normalized
    );
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  },
};
