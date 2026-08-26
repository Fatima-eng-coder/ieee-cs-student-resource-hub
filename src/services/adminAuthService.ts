import { supabase } from '@/lib/supabase';
import { CONTENT_MANAGER_ROLES, SOCIETY_ROLES, type Profile, type ProfileRole } from '@/types';

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: ProfileRole;
  created_at: string;
}

let currentAdmin: Profile | null = null;

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  createdAt: row.created_at,
});

const isSocietyRole = (role: ProfileRole) => (SOCIETY_ROLES as readonly ProfileRole[]).includes(role);
const isContentManagerRole = (role: ProfileRole) => (CONTENT_MANAGER_ROLES as readonly ProfileRole[]).includes(role);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,email,role,created_at')
    .eq('id', userId)
    .single();

  if (error) throw new AdminAuthError(error.message);
  return data ? toProfile(data as ProfileRow) : null;
}

export class AdminAuthError extends Error {}

export const adminAuthService = {
  getCurrentAdmin(): Profile | null {
    return currentAdmin;
  },

  canAccessPortal(profile: Profile | null): boolean {
    return !!profile && isSocietyRole(profile.role);
  },

  canManageContent(profile: Profile | null = currentAdmin): boolean {
    return !!profile && isContentManagerRole(profile.role);
  },

  async loadCurrentAdmin(): Promise<Profile | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      currentAdmin = null;
      return null;
    }

    const profile = await fetchProfile(data.user.id);
    if (!profile || !this.canAccessPortal(profile)) {
      await this.logoutAdmin();
      throw new AdminAuthError('Only IEEE CS society members can access the team portal.');
    }

    currentAdmin = profile;
    return profile;
  },

  async loginAdmin(email: string, password: string): Promise<Profile> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.user) {
      throw new AdminAuthError(error?.message ?? 'Invalid team credentials.');
    }

    const profile = await fetchProfile(data.user.id);
    if (!profile || !this.canAccessPortal(profile)) {
      await this.logoutAdmin();
      throw new AdminAuthError('Only IEEE CS society members can access the team portal.');
    }

    currentAdmin = profile;
    return profile;
  },

  async logoutAdmin(): Promise<void> {
    currentAdmin = null;
    await supabase.auth.signOut();
  },
};
