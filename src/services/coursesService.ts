import { supabase } from '@/lib/supabase';
import { facultyService } from '@/services/facultyService';
import type { Course } from '@/types';

const COURSE_DOCUMENTS_BUCKET = 'course-documents';

interface CourseRow {
  id: string;
  course_code: string;
  course_name: string;
  department: string | null;
  credit_hours: number | null;
  theory_hours?: number | null;
  theory_credit_hours?: number | null;
  lab_hours?: number | null;
  description: string | null;
  cdf_url: string | null;
  cdf_path: string | null;
  lab_manual_url: string | null;
  lab_manual_path: string | null;
  outcomes: unknown;
  tips: unknown;
  useful_links: unknown;
}

interface CoursePrerequisiteRow {
  course_code: string;
  prerequisite_code: string;
}

const baseCourseColumns = [
  'id',
  'course_code',
  'course_name',
  'department',
  'credit_hours',
  'description',
  'cdf_url',
  'cdf_path',
  'lab_manual_url',
  'lab_manual_path',
  'outcomes',
  'tips',
  'useful_links',
].join(',');
const courseColumns = `${baseCourseColumns},theory_hours,lab_hours`;
const legacyCourseColumns = `${baseCourseColumns},theory_credit_hours,lab_hours`;

const textArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

const usefulLinks = (value: unknown): Course['usefulLinks'] => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Course['usefulLinks'][number] =>
      !!item &&
      typeof item === 'object' &&
      'label' in item &&
      'url' in item &&
      typeof item.label === 'string' &&
      typeof item.url === 'string'
  );
};

const normalizeCode = (code: string) => code.trim().toUpperCase();

const isMissingTableError = (error: { code?: string; message?: string }) =>
  error.code === '42P01' ||
  error.code === 'PGRST205' ||
  error.message?.toLowerCase().includes('does not exist');

const isMissingCreditSplitColumn = (error: { code?: string; message?: string }) => {
  const message = error.message?.toLowerCase() ?? '';
  return (
    error.code === 'PGRST204' ||
    ((message.includes('lab_hours') || message.includes('theory_hours') || message.includes('theory_credit_hours')) &&
      (message.includes('does not exist') || message.includes('could not find')))
  );
};

const toCourse = (row: CourseRow, prerequisites: string[] = [], teacherIds: string[] = []): Course => {
  const labHours = row.lab_hours ?? 0;
  const theoryHours = row.theory_hours ?? row.theory_credit_hours ?? Math.max((row.credit_hours ?? 0) - labHours, 0);
  const creditHours = theoryHours + labHours;

  return {
    id: row.id,
    code: row.course_code,
    name: row.course_name,
    department: row.department ?? 'Computer Science',
    creditHours,
    theoryHours,
    labHours,
    description: row.description ?? '',
    cdfUrl: row.cdf_url ?? '',
    cdfPath: row.cdf_path,
    labManualUrl: row.lab_manual_url ?? '',
    labManualPath: row.lab_manual_path,
    outcomes: textArray(row.outcomes),
    tips: textArray(row.tips),
    usefulLinks: usefulLinks(row.useful_links),
    teacherIds,
    prerequisites,
  };
};

const toPayload = (course: Course) => ({
  course_code: normalizeCode(course.code),
  course_name: course.name.trim(),
  department: course.department.trim() || 'Computer Science',
  credit_hours: Number(course.creditHours),
  theory_hours: Number(course.theoryHours ?? Math.max(course.creditHours - (course.labHours ?? 0), 0)),
  lab_hours: Number(course.labHours ?? 0),
  description: course.description.trim(),
  cdf_url: course.cdfUrl?.trim() || null,
  cdf_path: course.cdfPath ?? null,
  lab_manual_url: course.labManualUrl?.trim() || null,
  lab_manual_path: course.labManualPath ?? null,
  outcomes: course.outcomes,
  tips: course.tips,
  useful_links: course.usefulLinks,
});

const toLegacyCreditPayload = (payload: Record<string, unknown>) => {
  const fallbackPayload = { ...payload };
  fallbackPayload.theory_credit_hours = fallbackPayload.theory_hours;
  delete fallbackPayload.theory_hours;
  return fallbackPayload;
};

const toBasePayload = (payload: Record<string, unknown>) => {
  const fallbackPayload = { ...payload };
  delete fallbackPayload.lab_hours;
  delete fallbackPayload.theory_hours;
  delete fallbackPayload.theory_credit_hours;
  return fallbackPayload;
};

const normalizePrerequisites = (codes: string[] = []) =>
  [...new Set(codes.map(normalizeCode).filter(Boolean))].sort((a, b) => a.localeCompare(b));

function assertCourseDocumentFile(file: File): void {
  if (file.type !== 'application/pdf') {
    throw new Error('Only PDF files are allowed for course documents.');
  }
}

function safeFileName(file: File): string {
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
  return `${Date.now()}-${base || 'course-document'}.pdf`;
}

function safeFolderName(value: string): string {
  return normalizeCode(value)
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function loadPrerequisiteMap(): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from('course_prerequisites')
    .select('course_code,prerequisite_code')
    .order('prerequisite_code', { ascending: true });

  if (error) {
    if (!isMissingTableError(error)) console.warn('Could not load course prerequisites', error);
    return new Map();
  }

  return ((data ?? []) as CoursePrerequisiteRow[]).reduce((map, row) => {
    const courseCode = normalizeCode(row.course_code);
    const prerequisiteCode = normalizeCode(row.prerequisite_code);
    if (!courseCode || !prerequisiteCode) return map;

    const existing = map.get(courseCode) ?? [];
    map.set(courseCode, [...existing, prerequisiteCode]);
    return map;
  }, new Map<string, string[]>());
}

async function syncPrerequisites(courseCode: string, prerequisites: string[] = [], previousCourseCode?: string): Promise<void> {
  const normalizedCourseCode = normalizeCode(courseCode);
  const courseCodesToClear = [...new Set([previousCourseCode, normalizedCourseCode].filter((code): code is string => !!code))];

  if (courseCodesToClear.length > 0) {
    const { error } = await supabase
      .from('course_prerequisites')
      .delete()
      .in('course_code', courseCodesToClear);

    if (error) {
      if (isMissingTableError(error)) return;
      throw new Error(error.message);
    }
  }

  const rows = normalizePrerequisites(prerequisites).map((prerequisiteCode) => ({
    course_code: normalizedCourseCode,
    prerequisite_code: prerequisiteCode,
  }));

  if (rows.length === 0) return;

  const { error } = await supabase.from('course_prerequisites').insert(rows);
  if (error) {
    if (isMissingTableError(error)) return;
    throw new Error(error.message);
  }
}

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

async function loadCourseRows() {
  const result = await supabase
    .from('courses')
    .select(courseColumns)
    .order('course_code', { ascending: true });

  if (!result.error || !isMissingCreditSplitColumn(result.error)) return result;

  const legacyResult = await supabase
    .from('courses')
    .select(legacyCourseColumns)
    .order('course_code', { ascending: true });

  if (!legacyResult.error || !isMissingCreditSplitColumn(legacyResult.error)) return legacyResult;

  return supabase
    .from('courses')
    .select(baseCourseColumns)
    .order('course_code', { ascending: true });
}

async function insertCourse(payload: Record<string, unknown>) {
  const result = await supabase
    .from('courses')
    .insert(payload)
    .select(courseColumns)
    .single();

  if (!result.error || !isMissingCreditSplitColumn(result.error)) return result;

  const legacyPayload = toLegacyCreditPayload(payload);
  const legacyResult = await supabase
    .from('courses')
    .insert(legacyPayload)
    .select(legacyCourseColumns)
    .single();

  if (!legacyResult.error || !isMissingCreditSplitColumn(legacyResult.error)) return legacyResult;

  const fallbackPayload = toBasePayload(payload);
  return supabase
    .from('courses')
    .insert(fallbackPayload)
    .select(baseCourseColumns)
    .single();
}

async function updateCourse(id: string, payload: Record<string, unknown>) {
  const result = await supabase
    .from('courses')
    .update(payload)
    .eq('id', id)
    .select(courseColumns)
    .single();

  if (!result.error || !isMissingCreditSplitColumn(result.error)) return result;

  const legacyPayload = toLegacyCreditPayload(payload);
  const legacyResult = await supabase
    .from('courses')
    .update(legacyPayload)
    .eq('id', id)
    .select(legacyCourseColumns)
    .single();

  if (!legacyResult.error || !isMissingCreditSplitColumn(legacyResult.error)) return legacyResult;

  const fallbackPayload = toBasePayload(payload);
  return supabase
    .from('courses')
    .update(fallbackPayload)
    .eq('id', id)
    .select(baseCourseColumns)
    .single();
}

export const coursesService = {
  async list(): Promise<Course[]> {
    const [{ data, error }, prerequisiteMap, teacherMap] = await Promise.all([
      loadCourseRows(),
      loadPrerequisiteMap(),
      facultyService.loadCourseTeacherMap(),
    ]);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const courseRow = row as unknown as CourseRow;
      const courseCode = normalizeCode(courseRow.course_code);
      return toCourse(courseRow, prerequisiteMap.get(courseCode) ?? [], teacherMap.get(courseCode) ?? []);
    });
  },

  async create(input: Course): Promise<Course> {
    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await insertCourse({
      ...toPayload(input),
      created_by: userData.user?.id ?? null,
    });

    if (error) throw new Error(error.message);

    const created = toCourse(data as unknown as CourseRow, normalizePrerequisites(input.prerequisites), input.teacherIds ?? []);
    await syncPrerequisites(created.code, created.prerequisites);
    await facultyService.syncCourseTeachers(created.code, created.teacherIds);
    return created;
  },

  async update(id: string, input: Course): Promise<Course> {
    await refreshAuthSession();
    const { data: previous, error: previousError } = await supabase
      .from('courses')
      .select('course_code')
      .eq('id', id)
      .limit(1)
      .maybeSingle();

    if (previousError) throw new Error(previousError.message);

    const { data, error } = await updateCourse(id, toPayload(input));

    if (error) throw new Error(error.message);

    const updated = toCourse(data as unknown as CourseRow, normalizePrerequisites(input.prerequisites), input.teacherIds ?? []);
    const previousCourseCode = (previous as { course_code: string } | null)?.course_code;
    await syncPrerequisites(updated.code, updated.prerequisites, previousCourseCode);

    /*
     * `syncCourseTeachers` deletes before it inserts, so passing an empty list erases every
     * assignment for this course. Treat "no teacherIds supplied" as "leave them alone"
     * rather than "remove them all" — otherwise any caller that builds a partial Course
     * silently destroys data. An explicit empty array still clears, which is what the admin
     * unticking every teacher means.
     */
    if (input.teacherIds !== undefined) {
      await facultyService.syncCourseTeachers(updated.code, input.teacherIds, previousCourseCode);
    } else if (previousCourseCode && previousCourseCode !== updated.code) {
      await facultyService.renameCourseTeachers(previousCourseCode, updated.code);
    }
    return updated;
  },

  async remove(id: string): Promise<void> {
    await refreshAuthSession();
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async uploadCourseDocument(
    file: File,
    courseCode: string,
    folder: 'cdf' | 'lab-manuals'
  ): Promise<{ url: string; path: string }> {
    assertCourseDocumentFile(file);
    await refreshAuthSession();

    const safeCourseCode = safeFolderName(courseCode);
    if (!safeCourseCode) throw new Error('Please enter a course code before uploading a file.');

    const path = `${folder}/${safeCourseCode}/${safeFileName(file)}`;
    const { error } = await supabase.storage
      .from(COURSE_DOCUMENTS_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from(COURSE_DOCUMENTS_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  async removeCourseDocument(path?: string | null): Promise<void> {
    if (!path) return;
    const { error } = await supabase.storage.from(COURSE_DOCUMENTS_BUCKET).remove([path]);
    if (error) console.error('Failed to remove course document', error);
  },
};
