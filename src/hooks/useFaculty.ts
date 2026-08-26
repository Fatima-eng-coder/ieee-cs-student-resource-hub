import { useEffect, useState } from 'react';
import { facultyService } from '@/services/facultyService';
import type { Teacher } from '@/types';

export function useFaculty() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFaculty = async () => {
    setLoading(true);
    setError(null);
    try {
      setTeachers(await facultyService.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load faculty.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFaculty();
  }, []);

  return { teachers, loading, error, reload: loadFaculty, setTeachers };
}
