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

  const updateRole = useCallback(async (profileId: string, role: ProfileRole) => {
    setError(null);
    const updated = await profilesService.updateRole(profileId, role);
    setCoreTeam((items) => {
      const withoutUpdated = items.filter((item) => item.id !== updated.id);
      if (updated.role === 'student') return withoutUpdated;
      return [...withoutUpdated, updated].sort((a, b) => a.name.localeCompare(b.name));
    });
    setStudentResults((items) => {
      if (updated.role !== 'student') return items.filter((item) => item.id !== updated.id);
      return items.map((item) => (item.id === updated.id ? updated : item));
    });
    return updated;
  }, []);

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
