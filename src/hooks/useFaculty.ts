import { useEffect, useState } from 'react';
import { facultyService } from '@/services/facultyService';
import type { Teacher } from '@/types';

export function useFaculty() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFaculty = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      setTeachers(await facultyService.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load faculty.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    const refreshQuietly = () => void loadFaculty(false);
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshQuietly();
    };
    const unsubscribe = facultyService.subscribe(refreshQuietly);

    void loadFaculty();
    window.addEventListener('focus', refreshQuietly);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', refreshQuietly);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return { teachers, loading, error, reload: loadFaculty, setTeachers };
}
