import { supabase } from '@/lib/supabase';

const COURSE_DOCUMENTS_BUCKET = 'course-documents';

interface CourseDocumentRow {
  cdf_path: string | null;
  lab_manual_path: string | null;
}

interface CourseResourceSubmissionRow {
  file_path: string | null;
}

interface StorageListItem {
  id: string | null;
  name: string;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: {
    size?: number;
    mimetype?: string;
  } | null;
}

export interface OrphanedCourseDocument {
  bucket: string;
  path: string;
  name: string;
  size: number | null;
  updatedAt: string | null;
}

export interface CourseDocumentCleanupScan {
  bucket: string;
  totalFiles: number;
  referencedFiles: number;
  orphanedFiles: OrphanedCourseDocument[];
}

export interface CourseDocumentCleanupResult {
  deletedPaths: string[];
  skippedReferencedPaths: string[];
}

const friendlyCleanupError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied') || lower.includes('unauthorized')) {
    return 'Storage cleanup is blocked by access rules. Please make sure only content managers can list and delete course document files.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach Supabase Storage. Please check your connection and try again.';
  }

  return 'Storage cleanup could not be completed right now. Please try again.';
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before storage cleanup', error);
}

const cleanPath = (path?: string | null) => path?.trim().replace(/^\/+/, '') || null;

async function loadReferencedCourseDocumentPaths(): Promise<Set<string>> {
  const referenced = new Set<string>();

  /*
   * Every table that stores a path in this bucket has to be listed here, because anything
   * missing from this set is classified as an orphan and offered up for permanent deletion.
   *
   * date_sheets was the one that got away. It arrived later, files under date-sheets/, and was
   * never added — so every published exam date sheet showed up on the cleanup screen as
   * unreferenced, one click away from a broken download with no way back. A table added to this
   * bucket in future has to be added here in the same change.
   */
  const [
    { data: courses, error: coursesError },
    { data: submissions, error: submissionsError },
    { data: sheets, error: sheetsError },
  ] = await Promise.all([
    supabase.from('courses').select('cdf_path,lab_manual_path'),
    supabase.from('course_resource_submissions').select('file_path'),
    supabase.from('date_sheets').select('file_path'),
  ]);

  if (coursesError) throw new Error(friendlyCleanupError(coursesError.message));
  if (submissionsError) throw new Error(friendlyCleanupError(submissionsError.message));
  // Deliberately fatal rather than skipped: carrying on with an unreadable date_sheets table
  // means presenting its files as orphans, which is the failure this read exists to prevent.
  if (sheetsError) throw new Error(friendlyCleanupError(sheetsError.message));

  ((courses ?? []) as CourseDocumentRow[]).forEach((course) => {
    const cdfPath = cleanPath(course.cdf_path);
    const labManualPath = cleanPath(course.lab_manual_path);
    if (cdfPath) referenced.add(cdfPath);
    if (labManualPath) referenced.add(labManualPath);
  });

  ((submissions ?? []) as CourseResourceSubmissionRow[]).forEach((submission) => {
    const filePath = cleanPath(submission.file_path);
    if (filePath) referenced.add(filePath);
  });

  ((sheets ?? []) as { file_path: string | null }[]).forEach((sheet) => {
    const filePath = cleanPath(sheet.file_path);
    if (filePath) referenced.add(filePath);
  });

  return referenced;
}

function isLikelyFolder(item: StorageListItem) {
  return !item.id && !item.metadata?.mimetype && typeof item.name === 'string';
}

async function listFilesRecursively(prefix = ''): Promise<OrphanedCourseDocument[]> {
  const files: OrphanedCourseDocument[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage
      .from(COURSE_DOCUMENTS_BUCKET)
      .list(prefix, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) throw new Error(friendlyCleanupError(error.message));

    const items = (data ?? []) as StorageListItem[];
    if (items.length === 0) break;

    for (const item of items) {
      if (!item.name || item.name === '.emptyFolderPlaceholder') continue;

      const path = prefix ? `${prefix}/${item.name}` : item.name;

      if (isLikelyFolder(item)) {
        files.push(...(await listFilesRecursively(path)));
      } else {
        files.push({
          bucket: COURSE_DOCUMENTS_BUCKET,
          path,
          name: item.name,
          size: typeof item.metadata?.size === 'number' ? item.metadata.size : null,
          updatedAt: item.updated_at ?? item.created_at ?? null,
        });
      }
    }

    if (items.length < limit) break;
    offset += limit;
  }

  return files;
}

export const storageCleanupService = {
  getCourseDocumentUrl(path: string): string {
    const { data } = supabase.storage.from(COURSE_DOCUMENTS_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },

  async scanCourseDocumentOrphans(): Promise<CourseDocumentCleanupScan> {
    await refreshAuthSession();

    const [files, referencedPaths] = await Promise.all([
      listFilesRecursively(),
      loadReferencedCourseDocumentPaths(),
    ]);

    const orphanedFiles = files.filter((file) => !referencedPaths.has(file.path));

    return {
      bucket: COURSE_DOCUMENTS_BUCKET,
      totalFiles: files.length,
      referencedFiles: files.length - orphanedFiles.length,
      orphanedFiles,
    };
  },

  async deleteCourseDocumentOrphans(paths: string[]): Promise<CourseDocumentCleanupResult> {
    await refreshAuthSession();

    const referencedPaths = await loadReferencedCourseDocumentPaths();
    const uniquePaths = [...new Set(paths.map(cleanPath).filter((path): path is string => Boolean(path)))];
    const pathsToDelete = uniquePaths.filter((path) => !referencedPaths.has(path));
    const skippedReferencedPaths = uniquePaths.filter((path) => referencedPaths.has(path));

    for (let index = 0; index < pathsToDelete.length; index += 100) {
      const chunk = pathsToDelete.slice(index, index + 100);
      const { error } = await supabase.storage.from(COURSE_DOCUMENTS_BUCKET).remove(chunk);
      if (error) throw new Error(friendlyCleanupError(error.message));
    }

    return {
      deletedPaths: pathsToDelete,
      skippedReferencedPaths,
    };
  },
};
