import { useEffect, useState } from 'react';
import { coursesService } from '@/services/coursesService';
import type { Course } from '@/types';

export function useCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      setCourses(await coursesService.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses();
  }, []);

  return { courses, loading, error, reload: loadCourses, setCourses };
}
