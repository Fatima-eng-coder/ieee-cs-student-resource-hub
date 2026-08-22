import { supabase } from '@/lib/supabase';
import type { User } from '@/types';

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthError extends Error {}

const toUser = (profile: ProfileRow): User => ({
  id: profile.id,
  name: profile.name,
  email: profile.email,
  avatar: '',
  createdAt: profile.created_at,
});

async function getProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,email,created_at')
    .eq('id', userId)
    .single();

  if (error) return null;
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

const profileFallback = (userId: string, name: string | undefined, email: string): User => ({
  id: userId,
  name: name?.trim() || email.split('@')[0],
  email,
  avatar: '',
  createdAt: new Date().toISOString(),
});

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

  async signup({ name, email, password }: SignupInput): Promise<User> {
    const normalized = email.trim().toLowerCase();
    if (!name.trim()) throw new AuthError('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new AuthError('Enter a valid email address.');
    if (password.length < 8) throw new AuthError('Password must be at least 8 characters long.');
    if (!/[0-9]/.test(password)) throw new AuthError('Password must include at least one number.');
    if (!/[^A-Za-z0-9]/.test(password)) throw new AuthError('Password must include at least one special character.');

    const { data, error } = await supabase.auth.signUp({
      email: normalized,
      password,
      options: {
        data: { name: name.trim() },
      },
    });

    if (error || !data.user) {
      throw new AuthError(error?.message ?? 'Could not create account.');
    }

    if (!data.session) {
      throw new AuthError('Account created. Please confirm your email, then log in.');
    }

    const profile = await getProfile(data.user.id);
    return profile ?? profileFallback(data.user.id, name, normalized);
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
