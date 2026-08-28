import { supabase } from '@/lib/supabase';
import { SOCIETY_ROLES, type Profile, type ProfileRole } from '@/types';

interface ProfileRow {
  id: string;
  name: string | null;
  email: string | null;
  role: ProfileRole;
  created_at: string;
}

const profileColumns = 'id,name,email,role,created_at';

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  name: row.name ?? 'Unnamed user',
  email: row.email ?? 'No email available',
  role: row.role,
  createdAt: row.created_at,
});

const sanitizeSearch = (query: string) => query.trim().replace(/[,%()]/g, ' ');

export const profilesService = {
  async listCoreTeam(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select(profileColumns)
      .in('role', [...SOCIETY_ROLES])
      .order('role', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    return ((data ?? []) as ProfileRow[]).map(toProfile);
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

    if (error) throw new Error(error.message);
    return ((data ?? []) as ProfileRow[]).map(toProfile);
  },

  async updateRole(profileId: string, role: ProfileRole): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', profileId)
      .select(profileColumns)
      .single();

    if (error) throw new Error(error.message);
    return toProfile(data as ProfileRow);
  },

  subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;

    const channel = supabase
      .channel(`profiles-sync-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, callback)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
