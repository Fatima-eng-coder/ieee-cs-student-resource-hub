import { useCallback, useEffect, useState } from 'react';
import { profilesService } from '@/services/profilesService';
import type { Profile, ProfileRole } from '@/types';

export function useProfiles() {
  const [coreTeam, setCoreTeam] = useState<Profile[]>([]);
  const [studentResults, setStudentResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCoreTeam = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      setCoreTeam(await profilesService.listCoreTeam());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team access.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const searchStudents = useCallback(async (query: string) => {
    const term = query.trim();
    setError(null);
    if (term.length < 2) {
      setStudentResults([]);
      return;
    }

    setSearching(true);
    try {
      setStudentResults(await profilesService.searchStudents(term));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search student profiles.');
    } finally {
      setSearching(false);
    }
  }, []);

  /**
   * A handover changes two rows, not one — the caller's included — so the local lists are
   * reloaded from the database rather than patched from the result. Patching would leave the
   * outgoing chairperson sitting in the team list they have just left.
   */
  const updateRole = useCallback(
    async (profileId: string, role: ProfileRole) => {
      setError(null);
      const assignment = await profilesService.assignRole(profileId, role);
      await loadCoreTeam(false);
      setStudentResults((items) => items.filter((item) => item.id !== assignment.userId));
      return assignment;
    },
    [loadCoreTeam]
  );

  useEffect(() => {
    void loadCoreTeam(true);
    const unsubscribe = profilesService.subscribe(() => void loadCoreTeam(false));
    return unsubscribe;
  }, [loadCoreTeam]);

  return {
    coreTeam,
    studentResults,
    loading,
    searching,
    error,
    setError,
    loadCoreTeam,
    searchStudents,
    updateRole,
  };
}
