import { supabase } from '@/lib/supabase';
import { courses as seedCourses } from '@/data/courses';
import { teachers as seedTeachers } from '@/data/teachers';
import type { Teacher } from '@/types';

interface FacultyRow {
  id: string;
  name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  office: string | null;
  photo_url: string | null;
}

interface CourseTeacherRow {
  course_code: string;
  teacher_id: string;
}

const facultyColumns = 'id,name,designation,department,email,office,photo_url';

const normalizeCode = (code: string) => code.trim().toUpperCase();

const isMissingTableError = (error: { code?: string; message?: string }) =>
  error.code === '42P01' ||
  error.code === 'PGRST205' ||
  error.message?.toLowerCase().includes('does not exist');

const fallbackPhoto = (name: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=fff1e7&fontFamily=Arial`;

const toTeacher = (row: FacultyRow): Teacher => ({
  id: row.id,
  name: row.name,
  designation: row.designation ?? 'Faculty Member',
  department: row.department ?? 'Computer Science',
  email: row.email ?? '',
  office: row.office ?? '',
  courses: [],
  photo: row.photo_url ?? fallbackPhoto(row.name),
});

const seedCourseCodeById = new Map(seedCourses.map((course) => [course.id, normalizeCode(course.code)]));

function fallbackAssignmentMap(): Map<string, string[]> {
  return seedTeachers.reduce((map, teacher) => {
    teacher.courses.forEach((courseIdOrCode) => {
      const courseCode = seedCourseCodeById.get(courseIdOrCode) ?? normalizeCode(courseIdOrCode);
      const existing = map.get(courseCode) ?? [];
      map.set(courseCode, [...existing, teacher.id]);
    });
    return map;
  }, new Map<string, string[]>());
}

export const facultyService = {
  async list(): Promise<Teacher[]> {
    const { data, error } = await supabase
      .from('faculty')
      .select(facultyColumns)
      .order('name', { ascending: true });

    if (error) {
      if (!isMissingTableError(error)) console.warn('Could not load faculty', error);
      return seedTeachers;
    }

    return (data ?? []).map((row) => toTeacher(row as unknown as FacultyRow));
  },

  async loadCourseTeacherMap(): Promise<Map<string, string[]>> {
    const { data, error } = await supabase
      .from('course_teachers')
      .select('course_code,teacher_id')
      .order('course_code', { ascending: true });

    if (error) {
      if (!isMissingTableError(error)) console.warn('Could not load course teacher assignments', error);
      return fallbackAssignmentMap();
    }

    return ((data ?? []) as CourseTeacherRow[]).reduce((map, row) => {
      const courseCode = normalizeCode(row.course_code);
      if (!courseCode || !row.teacher_id) return map;

      const existing = map.get(courseCode) ?? [];
      map.set(courseCode, [...existing, row.teacher_id]);
      return map;
    }, new Map<string, string[]>());
  },

  async syncCourseTeachers(courseCode: string, teacherIds: string[], previousCourseCode?: string): Promise<void> {
    const normalizedCourseCode = normalizeCode(courseCode);
    const courseCodesToClear = [...new Set([previousCourseCode, normalizedCourseCode].filter((code): code is string => !!code))];

    if (courseCodesToClear.length > 0) {
      const { error } = await supabase
        .from('course_teachers')
        .delete()
        .in('course_code', courseCodesToClear);

      if (error) {
        if (isMissingTableError(error)) return;
        throw new Error(error.message);
      }
    }

    const rows = [...new Set(teacherIds)].map((teacherId) => ({
      course_code: normalizedCourseCode,
      teacher_id: teacherId,
    }));

    if (rows.length === 0) return;

    const { error } = await supabase.from('course_teachers').insert(rows);
    if (error) {
      if (isMissingTableError(error)) return;
      throw new Error(error.message);
    }
  },
};
