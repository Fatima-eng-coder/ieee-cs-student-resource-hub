import { supabase } from '@/lib/supabase';

const COURSE_DOCUMENTS_BUCKET = 'course-documents';

export type CourseResourceType =
  | 'cdf'
  | 'lab_manual'
  | 'useful_link'
  | 'prerequisite'
  | 'description'
  | 'teacher_assignment'
  | 'other';

export interface CourseResourceSubmissionInput {
  courseCode: string;
  courseName: string;
  resourceType: CourseResourceType;
  suggestedTitle?: string | null;
  suggestedValue?: string | null;
  notes?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  file?: File | null;
}

export interface CourseResourceSubmissionResult {
  fileUploaded: boolean;
}

export type CourseResourceSubmissionStatus = 'pending' | 'approved' | 'rejected';
type ReviewStatus = Extract<CourseResourceSubmissionStatus, 'approved' | 'rejected'>;

export interface CourseResourceSubmission {
  id: string;
  courseCode: string;
  courseName: string | null;
  resourceType: CourseResourceType;
  suggestedTitle: string | null;
  suggestedValue: string | null;
  fileUrl: string | null;
  filePath: string | null;
  notes: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  status: CourseResourceSubmissionStatus;
  submittedBy: string | null;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface CourseResourceReviewResult {
  submission?: CourseResourceSubmission;
  deletedId?: string;
  warning?: string;
}

interface CourseResourceSubmissionRow {
  id: string;
  course_code: string;
  course_name: string | null;
  resource_type: CourseResourceType;
  suggested_title: string | null;
  suggested_value: string | null;
  file_url: string | null;
  file_path: string | null;
  notes: string | null;
  requester_name?: string | null;
  requester_email?: string | null;
  name?: string | null;
  email?: string | null;
  status: CourseResourceSubmissionStatus;
  submitted_by: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

const fileResourceTypes: CourseResourceType[] = ['cdf', 'lab_manual'];

const friendlySubmissionError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Your submission could not be saved because access rules blocked it. Please refresh and try again.';
  }

  if (lower.includes('check constraint')) {
    return 'Please review the selected resource type before submitting.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  return 'Your submission could not be saved right now. Please try again.';
};

const friendlyAdminSubmissionError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'You do not have permission to review course resource submissions.';
  }

  if (lower.includes('check constraint')) {
    return 'The selected submission status is not valid.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  return 'Course resource submissions could not be loaded right now. Please try again.';
};

const toCourseResourceSubmission = (row: CourseResourceSubmissionRow): CourseResourceSubmission => ({
  id: row.id,
  courseCode: row.course_code,
  courseName: row.course_name,
  resourceType: row.resource_type,
  suggestedTitle: row.suggested_title,
  suggestedValue: row.suggested_value,
  fileUrl: row.file_url,
  filePath: row.file_path,
  notes: row.notes,
  requesterName: row.requester_name ?? row.name ?? null,
  requesterEmail: row.requester_email ?? row.email ?? null,
  status: row.status,
  submittedBy: row.submitted_by ?? null,
  createdAt: row.created_at,
  reviewedBy: row.reviewed_by ?? null,
  reviewedAt: row.reviewed_at ?? null,
});

const normalizeCode = (code: string) => code.trim().toUpperCase();

const usefulLinks = (value: unknown): { label: string; url: string }[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is { label: string; url: string } =>
      !!item &&
      typeof item === 'object' &&
      'label' in item &&
      'url' in item &&
      typeof item.label === 'string' &&
      typeof item.url === 'string'
  );
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

const isMissingRequesterColumnsError = (message: string) => {
  const lower = message.toLowerCase();
  return (
    (lower.includes('requester_name') || lower.includes('requester_email')) &&
    (lower.includes('could not find') || lower.includes('column') || lower.includes('schema cache'))
  );
};

function safeFolderName(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
}

function safeFileName(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
  return `${Date.now()}-${base || 'course-resource'}.${ext}`;
}

function assertAllowedFile(file: File): void {
  if (file.type !== 'application/pdf') {
    throw new Error('Only PDF files are allowed for course CDF and lab manual submissions.');
  }
}

function friendlyStorageError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied') || lower.includes('unauthorized')) {
    return 'The file could not be uploaded because storage access rules blocked it. Please ask the site team to enable uploads for course resource suggestion files.';
  }

  if (lower.includes('mime') || lower.includes('type')) {
    return 'Only PDF files can be uploaded for course resource suggestions.';
  }

  if (lower.includes('exceeded') || lower.includes('too large') || lower.includes('maximum')) {
    return 'This file is too large for the course documents bucket. Please compress the PDF and try again.';
  }

  return 'The file could not be uploaded right now. Please try again.';
}

async function uploadFile(
  file: File,
  courseCode: string,
  resourceType: CourseResourceType
): Promise<{ url: string; path: string }> {
  assertAllowedFile(file);
  await refreshAuthSession();

  const courseFolder = safeFolderName(courseCode);
  const path = `suggestions/${resourceType}/${courseFolder || 'COURSE'}/${safeFileName(file)}`;
  const { error } = await supabase.storage
    .from(COURSE_DOCUMENTS_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) {
    throw new Error(friendlyStorageError(error.message));
  }

  const { data } = supabase.storage.from(COURSE_DOCUMENTS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

async function removeUploadedFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(COURSE_DOCUMENTS_BUCKET).remove([path]);
  if (error) throw new Error(friendlyStorageError(error.message));
}

async function cleanupUploadedFile(path?: string | null): Promise<void> {
  if (!path) return;

  try {
    await removeUploadedFile(path);
  } catch (err) {
    console.warn('Could not clean up uploaded course resource file after a failed submission', err);
  }
}

async function updateSubmissionStatus(id: string, status: ReviewStatus): Promise<CourseResourceSubmission> {
  await refreshAuthSession();
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('course_resource_submissions')
    .update({
      status,
      reviewed_by: userData.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(friendlyAdminSubmissionError(error.message));
  return toCourseResourceSubmission(data as CourseResourceSubmissionRow);
}

async function loadCourseForSubmission(submission: CourseResourceSubmission): Promise<{
  id: string;
  useful_links: unknown;
} | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('id,course_code,useful_links')
    .eq('course_code', normalizeCode(submission.courseCode))
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(friendlyAdminSubmissionError(error.message));
  return data as { id: string; useful_links: unknown } | null;
}

async function updateCourseFromSubmission(submission: CourseResourceSubmission): Promise<void> {
  const course = await loadCourseForSubmission(submission);
  if (!course) {
    throw new Error('The selected course could not be found. Please check the course before approving this submission.');
  }

  let payload: Record<string, unknown> | null = null;

  if (submission.resourceType === 'cdf') {
    if (!submission.fileUrl || !submission.filePath) {
      throw new Error('This CDF submission does not include an uploaded file to approve.');
    }
    payload = {
      cdf_url: submission.fileUrl,
      cdf_path: submission.filePath,
    };
  } else if (submission.resourceType === 'lab_manual') {
    if (!submission.fileUrl || !submission.filePath) {
      throw new Error('This lab manual submission does not include an uploaded file to approve.');
    }
    payload = {
      lab_manual_url: submission.fileUrl,
      lab_manual_path: submission.filePath,
    };
  } else if (submission.resourceType === 'useful_link') {
    const label = submission.suggestedTitle?.trim();
    const url = submission.suggestedValue?.trim();

    if (!label || !url) {
      throw new Error('This useful link submission needs both a title and a URL before it can be approved.');
    }

    const currentLinks = usefulLinks(course.useful_links);
    const alreadyExists = currentLinks.some(
      (link) => link.url.trim().toLowerCase() === url.toLowerCase()
    );

    payload = {
      useful_links: alreadyExists ? currentLinks : [...currentLinks, { label, url }],
    };
  } else if (submission.resourceType === 'description') {
    const description = submission.suggestedValue?.trim();
    if (!description) {
      throw new Error('This description submission does not include details to approve.');
    }
    payload = { description };
  }

  if (!payload) return;

  const { error } = await supabase
    .from('courses')
    .update(payload)
    .eq('id', course.id);

  if (error) throw new Error(friendlyAdminSubmissionError(error.message));
}

async function removeUploadedSuggestionFile(submission: CourseResourceSubmission): Promise<void> {
  if (!submission.filePath) return undefined;

  await removeUploadedFile(submission.filePath);
}

export const courseResourceSubmissionsService = {
  async create(input: CourseResourceSubmissionInput): Promise<CourseResourceSubmissionResult> {
    const { data: userData } = await supabase.auth.getUser();
    const shouldUploadFile = Boolean(input.file && fileResourceTypes.includes(input.resourceType));
    const upload = shouldUploadFile && input.file
      ? await uploadFile(input.file, input.courseCode, input.resourceType)
      : null;
    const notes = input.notes?.trim() || null;

    const basePayload = {
      course_code: input.courseCode,
      course_name: input.courseName || null,
      resource_type: input.resourceType,
      suggested_title: input.suggestedTitle?.trim() || null,
      suggested_value: input.suggestedValue?.trim() || null,
      file_url: upload?.url ?? null,
      file_path: upload?.path ?? null,
      notes,
      status: 'pending',
      submitted_by: userData.user?.id ?? null,
    };

    const { error } = await supabase.from('course_resource_submissions').insert({
      ...basePayload,
      requester_name: input.requesterName?.trim() || null,
      requester_email: input.requesterEmail?.trim() || null,
    });

    if (error && isMissingRequesterColumnsError(error.message)) {
      const { error: fallbackError } = await supabase.from('course_resource_submissions').insert({
        ...basePayload,
        name: input.requesterName?.trim() || null,
        email: input.requesterEmail?.trim() || null,
      });

      if (fallbackError) {
        await cleanupUploadedFile(upload?.path);
        throw new Error(friendlySubmissionError(fallbackError.message));
      }
      return { fileUploaded: Boolean(upload) };
    }

    if (error) {
      await cleanupUploadedFile(upload?.path);
      throw new Error(friendlySubmissionError(error.message));
    }
    return { fileUploaded: Boolean(upload) };
  },

  async listForAdmin(): Promise<CourseResourceSubmission[]> {
    const { data, error } = await supabase
      .from('course_resource_submissions')
      .select('*')
      .in('status', ['pending', 'approved', 'rejected'])
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyAdminSubmissionError(error.message));
    return ((data ?? []) as CourseResourceSubmissionRow[]).map(toCourseResourceSubmission);
  },

  async approve(submission: CourseResourceSubmission): Promise<CourseResourceReviewResult> {
    await refreshAuthSession();
    await updateCourseFromSubmission(submission);
    const updated = await updateSubmissionStatus(submission.id, 'approved');
    return { submission: updated };
  },

  async updateStatus(id: string, status: ReviewStatus): Promise<CourseResourceSubmission> {
    return updateSubmissionStatus(id, status);
  },

  async reject(submission: CourseResourceSubmission): Promise<CourseResourceReviewResult> {
    await refreshAuthSession();
    await removeUploadedSuggestionFile(submission);
    const updated = await updateSubmissionStatus(submission.id, 'rejected');
    return { submission: updated };
  },

  async deleteReviewed(id: string): Promise<void> {
    await refreshAuthSession();
    const { error } = await supabase
      .from('course_resource_submissions')
      .delete()
      .eq('id', id)
      .neq('status', 'pending');

    if (error) throw new Error(friendlyAdminSubmissionError(error.message));
  },

  async deleteReviewedMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await refreshAuthSession();
    const { error } = await supabase
      .from('course_resource_submissions')
      .delete()
      .in('id', ids)
      .neq('status', 'pending');

    if (error) throw new Error(friendlyAdminSubmissionError(error.message));
  },

  subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;

    let timeout: number | null = null;
    const scheduleCallback = () => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(callback, 150);
    };

    const channel = supabase
      .channel(`course-resource-submissions-sync-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'course_resource_submissions' }, scheduleCallback)
      .subscribe();

    return () => {
      if (timeout) window.clearTimeout(timeout);
      void supabase.removeChannel(channel);
    };
  },
};
