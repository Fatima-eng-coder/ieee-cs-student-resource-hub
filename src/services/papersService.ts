import { supabase } from '@/lib/supabase';
import { courses } from '@/data/courses';
import type { Paper } from '@/types';

const MATERIAL_BUCKET = 'course-material-files';
const allowedSessions = ['Spring', 'Fall'] as const;
const allowedMaterialTypes = ['Midterm', 'Final', 'Quiz', 'Assignment'] as const;
const minYear = 2000;
const maxYear = Math.min(new Date().getFullYear(), 2099);
type VerificationStatus = 'pending' | 'verified';

interface CourseMaterialRow {
  id: string;
  course_id: string;
  course_name: string;
  title: string;
  session: string;
  year: number;
  material_type: Paper['examType'];
  instructor: string;
  file_url: string;
  file_path: string | null;
  uploaded_by: string;
  uploaded_date: string;
  verification: 'pending' | 'verified';
  tags: string[];
  downloads: number;
}

export interface ContributePaperInput {
  courseId: string;
  courseName: string;
  title: string;
  session: string;
  year: number;
  examType: Paper['examType'];
  instructor: string;
  contributorName: string;
  tags: string[];
  file?: File | null;
}

export interface SavePaperInput extends Omit<Paper, 'id' | 'fileUrl'> {
  fileUrl?: string;
}

export interface DuplicatePaperResult {
  duplicate: Paper | null;
  exists: boolean;
}

export interface DuplicateMaterialCandidate {
  id?: string;
  courseId: string;
  session: string;
  year: number;
  examType: Paper['examType'];
}

export class DuplicateMaterialError extends Error {
  duplicate: Paper | null;

  constructor(duplicate: Paper | null) {
    super('A matching material already exists.');
    this.name = 'DuplicateMaterialError';
    this.duplicate = duplicate;
  }
}

export type MaterialChange =
  | { type: 'insert'; paper: Paper }
  | { type: 'update'; paper: Paper }
  | { type: 'delete'; id: string };

/**
 * Mirrors public.course_material_duplicate_exists so the form can warn before submitting.
 * Nothing enforces anything any more -- both sides only report -- but keep the two in step, or
 * the warning a student sees disagrees with the one the RPC would have given.
 *
 * There is no cap. Several papers for one sitting is normal -- a subject that is not
 * centralised sets one per section -- and nothing here refuses a write on account of a count.
 * A match is reported so somebody can be TOLD what already exists: a student before they
 * submit, who cannot see pending rows for themselves. They can always go ahead.
 */

const materialColumns =
  'id,course_id,course_name,title,session,year,material_type,instructor,file_url,file_path,uploaded_by,uploaded_date,verification,tags,downloads';

const toPaper = (row: CourseMaterialRow): Paper => ({
  id: row.id,
  courseId: row.course_id,
  courseName: row.course_name,
  title: row.title,
  session: normalizeSession(row.session),
  year: row.year,
  examType: normalizeMaterialType(row.material_type),
  instructor: row.instructor,
  fileUrl: row.file_url,
  uploadedBy: row.uploaded_by,
  uploadedDate: row.uploaded_date,
  verification: row.verification,
  tags: row.tags ?? [],
  downloads: row.downloads,
});

const toPayload = (paper: Partial<SavePaperInput | Paper>) => {
  const payload: Record<string, unknown> = {};
  if (paper.courseId !== undefined) payload.course_id = paper.courseId;
  if (paper.courseName !== undefined) payload.course_name = paper.courseName;
  if (paper.title !== undefined) payload.title = paper.title.trim();
  if (paper.session !== undefined) payload.session = normalizeSession(paper.session);
  if (paper.year !== undefined && isValidYear(paper.year)) {
    payload.year = paper.year;
  }
  if (paper.examType !== undefined) payload.material_type = normalizeMaterialType(paper.examType);
  if (paper.instructor !== undefined) payload.instructor = paper.instructor.trim() || 'Not specified';
  if (paper.fileUrl !== undefined) payload.file_url = paper.fileUrl || '';
  if (paper.uploadedBy !== undefined) payload.uploaded_by = paper.uploadedBy.trim() || 'Anonymous';
  if (paper.uploadedDate !== undefined) payload.uploaded_date = paper.uploadedDate;
  if (paper.verification !== undefined) payload.verification = paper.verification;
  if (paper.tags !== undefined) payload.tags = paper.tags;
  if (paper.downloads !== undefined) payload.downloads = paper.downloads;
  return payload;
};

function normalizeSession(value: string): string {
  const match = allowedSessions.find((session) => session.toLowerCase() === value.trim().toLowerCase());
  return match ?? 'Fall';
}

function normalizeMaterialType(value: string): Paper['examType'] {
  const match = allowedMaterialTypes.find((type) => type.toLowerCase() === value.trim().toLowerCase());
  return match ?? 'Final';
}

function isSameDuplicateGroup(paper: Paper, candidate: DuplicateMaterialCandidate): boolean {
  return (
    paper.id !== candidate.id &&
    paper.courseId === candidate.courseId &&
    normalizeMaterialType(paper.examType) === normalizeMaterialType(candidate.examType) &&
    normalizeSession(paper.session) === normalizeSession(candidate.session) &&
    paper.year === candidate.year
  );
}

export function findDuplicateInPapers(papers: Paper[], candidate: DuplicateMaterialCandidate): DuplicatePaperResult {
  const existing = papers.filter(
    (paper) => paper.verification !== 'unverified' && isSameDuplicateGroup(paper, candidate)
  );

  const duplicate = existing[0] ?? null;
  return { duplicate, exists: Boolean(duplicate) };
}

function isValidYear(value: number): boolean {
  return Number.isInteger(value) && value >= minYear && value <= maxYear;
}

function assertValidSessionYear(session: string, year: number): void {
  if (!allowedSessions.includes(session as (typeof allowedSessions)[number])) {
    throw new Error('Please choose either Spring or Fall for the session.');
  }

  if (!isValidYear(year)) {
    throw new Error(`Please enter a valid year from ${minYear} to ${maxYear}.`);
  }
}

export function subscribeMaterialsChanged(callback: (change?: MaterialChange) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let timeout: number | null = null;
  const realtimeChannel = supabase.channel(`course-materials-sync-${crypto.randomUUID()}`);
  const scheduleCallback = (change?: MaterialChange) => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => callback(change), 150);
  };

  realtimeChannel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'course_materials' }, (payload) => {
      if (payload.eventType === 'INSERT') {
        scheduleCallback({ type: 'insert', paper: toPaper(payload.new as CourseMaterialRow) });
        return;
      }

      if (payload.eventType === 'UPDATE') {
        scheduleCallback({ type: 'update', paper: toPaper(payload.new as CourseMaterialRow) });
        return;
      }

      if (payload.eventType === 'DELETE') {
        const oldRow = payload.old as Partial<CourseMaterialRow>;
        if (oldRow.id) scheduleCallback({ type: 'delete', id: oldRow.id });
        else scheduleCallback();
      }
    })
    .subscribe();

  return () => {
    if (timeout) window.clearTimeout(timeout);
    void supabase.removeChannel(realtimeChannel);
  };
}

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

function assertAllowedFile(file: File): void {
  const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('Only PDF, PNG, JPG, and WebP files are allowed.');
  }
}

function safeFileName(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${Date.now()}-${base || 'course-material'}.${ext}`;
}

function safeFolderName(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
}

function courseFolderName(courseId: string): string {
  const course = courses.find((item) => item.id === courseId);
  return safeFolderName(course?.code ?? courseId) || 'COURSE';
}

async function uploadMaterialFile(
  file: File,
  courseId: string,
  materialType: Paper['examType']
): Promise<{ url: string; path: string }> {
  assertAllowedFile(file);
  await refreshAuthSession();

  const { data: userData } = await supabase.auth.getUser();
  const owner = userData.user?.id ?? 'admin';
  const path = `${courseFolderName(courseId)}/${materialType.toLowerCase()}/${owner}/${safeFileName(file)}`;

  const { error } = await supabase.storage
    .from(MATERIAL_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(MATERIAL_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

async function removeFile(path?: string | null): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(MATERIAL_BUCKET).remove([path]);
  if (error) console.error('Failed to remove course material file', error);
}

async function getFilePath(id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('course_materials')
    .select('file_path')
    .eq('id', id)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return ((data as { file_path: string | null } | null)?.file_path) ?? null;
}

async function getPendingSubmissionCount(): Promise<number | null> {
  const { data, error } = await supabase.rpc('my_pending_course_material_count');
  if (error) {
    console.warn('Could not check pending course material count', error);
    return null;
  }
  return typeof data === 'number' ? data : Number(data);
}

export const papersService = {
  async list(): Promise<Paper[]> {
    const { data, error } = await supabase
      .from('course_materials')
      .select(materialColumns)
      .order('uploaded_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => toPaper(row as CourseMaterialRow));
  },

  async get(id: string): Promise<Paper | null> {
    const { data, error } = await supabase
      .from('course_materials')
      .select(materialColumns)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toPaper(data as CourseMaterialRow) : null;
  },

  async create(input: SavePaperInput, file?: File | null): Promise<Paper> {
    assertValidSessionYear(input.session, input.year);
    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();
    const upload = file ? await uploadMaterialFile(file, input.courseId, input.examType) : null;

    const { data, error } = await supabase
      .from('course_materials')
      .insert({
        ...toPayload(input),
        file_url: upload?.url ?? input.fileUrl ?? '',
        file_path: upload?.path ?? null,
        created_by: userData.user?.id ?? null,
      })
      .select(materialColumns);

    if (error) {
      await removeFile(upload?.path);
      throw new Error(error.message);
    }

    const createdRow = (data as CourseMaterialRow[] | null)?.[0];
    if (!createdRow) {
      await removeFile(upload?.path);
      throw new Error('Material was saved, but the saved row could not be loaded. Please refresh and check the table.');
    }

    const created = toPaper(createdRow);
    return created;
  },

  async update(id: string, patch: Partial<SavePaperInput>, file?: File | null): Promise<Paper> {
    if (patch.session !== undefined && patch.year !== undefined) {
      assertValidSessionYear(patch.session, patch.year);
    } else if (patch.year !== undefined && !isValidYear(patch.year)) {
      throw new Error(`Please enter a valid year from ${minYear} to ${maxYear}.`);
    } else if (patch.session !== undefined && !allowedSessions.includes(patch.session as (typeof allowedSessions)[number])) {
      throw new Error('Please choose either Spring or Fall for the session.');
    }

    await refreshAuthSession();
    const previousPath = file ? await getFilePath(id) : null;
    const upload = file ? await uploadMaterialFile(file, patch.courseId ?? 'course', patch.examType ?? 'Final') : null;

    const { data, error } = await supabase
      .from('course_materials')
      .update({
        ...toPayload(patch),
        ...(upload ? { file_url: upload.url, file_path: upload.path } : {}),
      })
      .eq('id', id)
      .select(materialColumns);

    if (error) {
      await removeFile(upload?.path);
      throw new Error(error.message);
    }

    const updatedRow = (data as CourseMaterialRow[] | null)?.[0];
    if (!updatedRow) {
      await removeFile(upload?.path);
      throw new Error('No material was updated. Please refresh and try again.');
    }

    if (upload) await removeFile(previousPath);
    const updated = toPaper(updatedRow);
    return updated;
  },

  async remove(id: string): Promise<void> {
    await refreshAuthSession();
    const path = await getFilePath(id);
    const { error } = await supabase.from('course_materials').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await removeFile(path);
  },

  async contribute(input: ContributePaperInput): Promise<Paper> {
    assertValidSessionYear(input.session, input.year);
    await refreshAuthSession();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Please log in before contributing course material.');
    }

    const pendingCount = await getPendingSubmissionCount();
    if (pendingCount !== null && pendingCount >= 5) {
      throw new Error('You already have 5 materials waiting for review. Please wait until the team reviews one before submitting another.');
    }

    const upload = input.file ? await uploadMaterialFile(input.file, input.courseId, input.examType) : null;

    const { data, error } = await supabase
      .from('course_materials')
      .insert({
        course_id: input.courseId,
        course_name: input.courseName,
        title: input.title.trim(),
        session: normalizeSession(input.session),
        year: input.year,
        material_type: normalizeMaterialType(input.examType),
        instructor: input.instructor.trim() || 'Not specified',
        file_url: upload?.url ?? '',
        file_path: upload?.path ?? null,
        uploaded_by: input.contributorName.trim() || 'Anonymous',
        uploaded_date: new Date().toISOString().slice(0, 10),
        verification: 'pending',
        tags: input.tags,
        downloads: 0,
        created_by: userData.user.id,
      })
      .select(materialColumns);

    if (error) {
      await removeFile(upload?.path);
      if (error.message.toLowerCase().includes('row-level security')) {
        throw new Error('You already have 5 materials waiting for review, or this submission is not allowed. Please wait for review before submitting more.');
      }
      throw new Error(error.message);
    }

    const createdRow = (data as CourseMaterialRow[] | null)?.[0];
    if (!createdRow) {
      await removeFile(upload?.path);
      throw new Error('Your material was submitted, but the saved row could not be loaded. Please refresh and check your submission.');
    }

    const created = toPaper(createdRow);
    return created;
  },

  async findDuplicate(
    candidate: DuplicateMaterialCandidate,
    options: { includeHiddenRows?: boolean; verificationStatuses?: VerificationStatus[] } = {}
  ): Promise<DuplicatePaperResult> {
    const materialType = normalizeMaterialType(candidate.examType);
    const session = normalizeSession(candidate.session);
      const verificationStatuses = options.verificationStatuses ?? ['pending', 'verified'];

    let hiddenDuplicateExists = false;
    if (options.includeHiddenRows && verificationStatuses.includes('pending')) {
      const { data, error } = await supabase.rpc('course_material_duplicate_exists', {
        p_course_id: candidate.courseId,
        p_session: session,
        p_year: candidate.year,
        p_material_type: materialType,
        p_exclude_id: candidate.id ?? null,
      });

      if (!error) {
        hiddenDuplicateExists = Boolean(data);
      } else {
        console.warn('Could not run hidden duplicate check; falling back to visible rows only.', error);
      }
    }

    let query = supabase
      .from('course_materials')
      .select(materialColumns)
      .eq('course_id', candidate.courseId)
      .eq('year', candidate.year)
      .in('verification', verificationStatuses)
      .limit(50);

    if (candidate.id) {
      query = query.neq('id', candidate.id);
    }

    const { data, error } = await query;

    if (error) {
      if (hiddenDuplicateExists) return { duplicate: null, exists: true };
      throw new Error(error.message);
    }
    const existing = ((data ?? []) as CourseMaterialRow[])
      .map(toPaper)
      .filter((paper) => isSameDuplicateGroup(paper, { ...candidate, session, examType: materialType }));
    const duplicate = existing[0] ?? null;
    return { duplicate, exists: Boolean(duplicate) || hiddenDuplicateExists };
  },

  /**
   * Approves a material. Deliberately does not check for duplicates.
   *
   * It used to refuse, which made approving the second copy of a sitting impossible from the
   * one screen where somebody had actually looked at both. That guard predates the duplicates
   * panel on the admin page: an admin pressing Approve now does so with every copy of that
   * sitting listed in front of them, so refusing the click second-guesses a decision that was
   * made with better information than this function has.
   *
   * The warning that matters is the one before submission, where the person has not seen the
   * existing paper. That is still there, and now fires on the first match rather than the
   * fourth.
   */
  async verify(id: string): Promise<Paper> {
    const paper = await this.get(id);
    if (!paper) throw new Error('Material not found.');

    return this.update(id, { verification: 'verified' });
  },
};
