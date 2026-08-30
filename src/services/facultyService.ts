import { supabase } from '@/lib/supabase';
import type { Teacher } from '@/types';

interface FacultyRow {
  id: string;
  name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  office: string | null;
  photo_url?: string | null;
}

interface CourseTeacherRow {
  course_code: string;
  teacher_id?: string | null;
  faculty_id?: string | null;
}

const baseFacultyColumns = 'id,name,designation,department,email,office';
const facultyColumns = `${baseFacultyColumns},photo_url`;

const normalizeCode = (code: string) => code.trim().toUpperCase();
const facultyAssignmentTableMessage =
  'Course faculty assignments need the course_teachers table in Supabase before selected faculty can be saved.';

const isMissingTableError = (error: { code?: string; message?: string }) =>
  error.code === '42P01' ||
  error.code === 'PGRST205' ||
  error.message?.toLowerCase().includes('does not exist');

const isMissingPhotoColumnError = (error: { code?: string; message?: string }) => {
  const message = error.message?.toLowerCase() ?? '';
  return error.code === 'PGRST204' || (message.includes('photo_url') && message.includes('could not find'));
};

const isMissingTeacherColumnError = (error: { code?: string; message?: string }) => {
  const message = error.message?.toLowerCase() ?? '';
  return error.code === 'PGRST204' && message.includes('teacher_id') && message.includes('could not find');
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

async function loadFacultyRows() {
  const result = await supabase
      .from('faculty')
      .select(facultyColumns)
      .eq('verification', 'verified')
      .order('name', { ascending: true });

  if (!result.error || !isMissingPhotoColumnError(result.error)) return result;

  return supabase
    .from('faculty')
    .select(baseFacultyColumns)
    .order('name', { ascending: true });
}

async function searchFacultyRows(query: string) {
  const pattern = `%${query.trim().replace(/[%_]/g, '\\$&')}%`;
  const filters = `name.ilike.${pattern},email.ilike.${pattern},department.ilike.${pattern}`;

  const result = await supabase
    .from('faculty')
    .select(facultyColumns)
    .eq('verification','verified')
    .or(filters)
    .order('name', { ascending: true })
    .limit(8);

  if (!result.error || !isMissingPhotoColumnError(result.error)) return result;

  return supabase
    .from('faculty')
    .select(baseFacultyColumns)
    .or(filters)
    .order('name', { ascending: true })
    .limit(8);
}

async function loadCourseTeacherRows() {
  const result = await supabase
    .from('course_teachers')
    .select('course_code,teacher_id')
    .order('course_code', { ascending: true });

  if (!result.error || !isMissingTeacherColumnError(result.error)) return result;

  return supabase
    .from('course_teachers')
    .select('course_code,faculty_id')
    .order('course_code', { ascending: true });
}

async function insertCourseTeacherRows(courseCode: string, teacherIds: string[]) {
  const rows = [...new Set(teacherIds)].map((teacherId) => ({
    course_code: courseCode,
    teacher_id: teacherId,
  }));

  if (rows.length === 0) return null;

  const result = await supabase.from('course_teachers').insert(rows);
  if (!result.error || !isMissingTeacherColumnError(result.error)) return result.error;

  const facultyRows = rows.map((row) => ({
    course_code: row.course_code,
    faculty_id: row.teacher_id,
  }));

  const fallbackResult = await supabase.from('course_teachers').insert(facultyRows);
  return fallbackResult.error;
}

const getFacultyId = (row: CourseTeacherRow) => row.teacher_id ?? row.faculty_id ?? '';

const toTeacher = (row: FacultyRow, courses: string[] = []): Teacher => ({
  id: row.id,
  name: row.name,
  designation: row.designation ?? 'Faculty Member',
  department: row.department ?? 'Computer Science',
  email: row.email ?? '',
  office: row.office ?? '',
  courses,
  photo: row.photo_url ?? '',
});

async function loadTeacherCourseMap(): Promise<Map<string, string[]>> {
  const { data, error } = await loadCourseTeacherRows();

  if (error) {
    if (!isMissingTableError(error)) console.warn('Could not load faculty course assignments', error);
    return new Map();
  }

  return ((data ?? []) as CourseTeacherRow[]).reduce((map, row) => {
    const courseCode = normalizeCode(row.course_code);
    const facultyId = getFacultyId(row);
    if (!courseCode || !facultyId) return map;

    const existing = map.get(facultyId) ?? [];
    map.set(facultyId, [...existing, courseCode]);
    return map;
  }, new Map<string, string[]>());
}

export const facultyService = {
  async list(): Promise<Teacher[]> {
    const [{ data, error }, teacherCourseMap] = await Promise.all([
      loadFacultyRows(),
      loadTeacherCourseMap(),
    ]);

    if (error) {
      if (!isMissingTableError(error)) throw new Error(error.message);
      return [];
    }

    return (data ?? []).map((row) => {
      const teacherRow = row as unknown as FacultyRow;
      return toTeacher(teacherRow, teacherCourseMap.get(teacherRow.id) ?? []);
    });
  },

  async search(query: string): Promise<Teacher[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const { data, error } = await searchFacultyRows(normalizedQuery);

    if (error) {
      if (!isMissingTableError(error)) throw new Error(error.message);
      return [];
    }

    return (data ?? []).map((row) => toTeacher(row as unknown as FacultyRow));
  },

  async loadCourseTeacherMap(): Promise<Map<string, string[]>> {
    const { data, error } = await loadCourseTeacherRows();

    if (error) {
      if (!isMissingTableError(error)) console.warn('Could not load course teacher assignments', error);
      return new Map();
    }

    return ((data ?? []) as CourseTeacherRow[]).reduce((map, row) => {
      const courseCode = normalizeCode(row.course_code);
      const facultyId = getFacultyId(row);
      if (!courseCode || !facultyId) return map;

      const existing = map.get(courseCode) ?? [];
      map.set(courseCode, [...existing, facultyId]);
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
        if (isMissingTableError(error)) {
          if (teacherIds.length > 0) throw new Error(facultyAssignmentTableMessage);
          return;
        }
        throw new Error(error.message);
      }
    }

    const error = await insertCourseTeacherRows(normalizedCourseCode, teacherIds);
    if (error) {
      if (isMissingTableError(error)) throw new Error(facultyAssignmentTableMessage);
      throw new Error(error.message);
    }
  },

  async addCourseTeacher(courseCode: string, teacherId: string): Promise<void> {
    const normalizedCourseCode = normalizeCode(courseCode);
    const normalizedTeacherId = teacherId.trim();
    if (!normalizedCourseCode || !normalizedTeacherId) return;

    await refreshAuthSession();

    const currentMap = await this.loadCourseTeacherMap();
    const currentTeacherIds = currentMap.get(normalizedCourseCode) ?? [];
    if (currentTeacherIds.includes(normalizedTeacherId)) return;

    const error = await insertCourseTeacherRows(normalizedCourseCode, [normalizedTeacherId]);
    if (error) {
      if (isMissingTableError(error)) throw new Error(facultyAssignmentTableMessage);
      throw new Error(error.message);
    }
  },

  subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;

    let timeout: number | null = null;
    const scheduleCallback = () => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(callback, 150);
    };

    const facultyChannel = supabase
      .channel(`public-faculty-sync-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'faculty' }, scheduleCallback)
      .subscribe();

    const courseTeachersChannel = supabase
      .channel(`public-course-teachers-sync-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'course_teachers' }, scheduleCallback)
      .subscribe();

    return () => {
      if (timeout) window.clearTimeout(timeout);
      void supabase.removeChannel(facultyChannel);
      void supabase.removeChannel(courseTeachersChannel);
    };
  },
};
