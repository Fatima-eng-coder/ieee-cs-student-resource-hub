/**
 * Exam date sheets, moved off the localStorage collection they used to live in.
 *
 * The sheet itself is a file in the course-documents bucket under a `date-sheets/` prefix — the
 * same bucket the course material uses, because it is the same kind of object published to the
 * same audience under the same content-manager write policies. No new bucket, since creating one
 * is a dashboard action no migration in this repo can perform.
 */

import { supabase } from '@/lib/supabase';
import type { DateSheet } from '@/types';

const DATE_SHEETS_BUCKET = 'course-documents';
const DATE_SHEETS_PREFIX = 'date-sheets';

const dateSheetColumns =
  'id,title,program,semester,term,year,file_url,file_path,is_published,created_at,updated_at';

/**
 * `program` widens the shared DateSheet's Program union to a plain string. The column is free
 * text with no CHECK behind it, so a sheet filed under a program this build has never heard of —
 * a new degree added by whoever is entering them — is a row that exists. Narrowing it on read
 * would mean silently relabelling that sheet as Computer Science, which is a worse answer for a
 * student looking for their exam schedule than an unfamiliar heading. The admin form still
 * offers the five known programs, so nothing entered through this app can drift.
 */
export interface AdminDateSheet extends Omit<DateSheet, 'program'> {
  program: string;
  filePath: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DateSheetSaveInput {
  title: string;
  program: string;
  semester: number;
  term: string;
  year: number;
  fileUrl: string;
  filePath: string | null;
  isPublished: boolean;
}

interface DateSheetRow {
  id: string;
  title: string;
  program: string;
  semester: number;
  term: string;
  year: number;
  file_url: string | null;
  file_path: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

const toDateSheet = (row: DateSheetRow): AdminDateSheet => ({
  id: row.id,
  title: row.title,
  program: row.program,
  semester: row.semester,
  term: row.term,
  year: row.year,
  fileUrl: row.file_url ?? '',
  filePath: row.file_path,
  isPublished: row.is_published,
  // The table has no uploaded_date of its own; when the row was created is the same fact.
  uploadedDate: row.created_at.slice(0, 10),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPayload = (input: DateSheetSaveInput) => ({
  title: input.title.trim(),
  program: input.program.trim(),
  semester: Math.trunc(input.semester),
  term: input.term.trim(),
  year: Math.trunc(input.year),
  file_url: input.fileUrl.trim() || null,
  file_path: input.filePath ?? null,
  is_published: Boolean(input.isPublished),
});

/** Everything the database would refuse, named in the admin's own words first. */
function assertDateSheetInput(input: DateSheetSaveInput): void {
  if (!input.title.trim()) throw new Error('Please enter the date sheet title.');
  if (!input.program.trim()) throw new Error('Please choose the program this date sheet is for.');
  if (!input.term.trim()) throw new Error('Please enter the term, for example "Fall".');

  const semester = Number(input.semester);
  if (!Number.isFinite(semester) || !Number.isInteger(semester) || semester < 1 || semester > 12) {
    throw new Error('Semester must be a whole number between 1 and 12.');
  }

  const year = Number(input.year);
  if (!Number.isFinite(year) || !Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Year must be a four-digit year between 2000 and 2100.');
  }

  // date_sheets_published_needs_file_check. Publishing a sheet with no sheet attached is the one
  // state that is never useful — students would find the entry, click it and get nothing — and
  // the database refuses it outright. Said here so the admin is told which field is missing
  // rather than handed a constraint name after losing the drawer.
  if (input.isPublished && !input.fileUrl.trim()) {
    throw new Error('Please upload the date sheet file before publishing it, or save it as a draft for now.');
  }
}

const friendlyReadError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'The date sheets could not be loaded because access to them is currently restricted.';
  }
  if (lower.includes('does not exist') || lower.includes('schema cache')) {
    return 'Date sheets are not ready yet. Please check the date_sheets table and Data API settings.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'The date sheets could not be loaded right now. Please try again later.';
};

/** Said whenever a write names a row the database no longer holds, however that is discovered. */
const STALE_ROW_MESSAGE = 'That date sheet is no longer there. Reload the page to see what is stored.';

/**
 * Mapped on SQLSTATE first, because the message behind one code varies. A refusal here arrives
 * either as "permission denied for table date_sheets" (anon holds no write grant at all) or as
 * "new row violates row-level security policy" (signed in, but not a content manager) — same
 * 42501, same thing to say about it.
 */
const friendlyWriteError = (error: { code?: string; message: string }) => {
  const lower = error.message.toLowerCase();

  if (error.code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Only content managers can change date sheets.';
  }

  if (error.code === '23514' || lower.includes('violates check constraint')) {
    if (lower.includes('date_sheets_published_needs_file_check')) {
      return 'A published date sheet needs its file attached. Upload the sheet, or save it as a draft.';
    }
    if (lower.includes('date_sheets_title_check')) return 'Please enter the date sheet title.';
    if (lower.includes('date_sheets_term_check')) return 'Please enter the term, for example "Fall".';
    if (lower.includes('date_sheets_semester_check')) return 'Semester must be a whole number between 1 and 12.';
    if (lower.includes('date_sheets_year_check')) return 'Year must be a four-digit year between 2000 and 2100.';
    return 'Some of the date sheet details are not allowed. Please check the fields and try again.';
  }

  // PostgREST's answer when a single-row write matched nothing, which here almost always means
  // another content manager deleted the sheet while this drawer was open.
  if (lower.includes('multiple (or no) rows') || lower.includes('0 rows')) return STALE_ROW_MESSAGE;

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'The date sheet could not be saved right now. Please try again.';
};

const friendlyStorageError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied') || lower.includes('unauthorized')) {
    return 'Only content managers can upload date sheet files.';
  }
  if (lower.includes('exceeded') || lower.includes('too large') || lower.includes('payload')) {
    return 'That file is too large to upload. Please pick a smaller version.';
  }
  // The bucket's own allowed-MIME list, refused before any policy is consulted. assertDateSheetFile
  // catches this first, so reaching it means the list changed underneath us — say which rule bit.
  if (lower.includes('mime type') || lower.includes('not supported')) {
    return 'That file type is not accepted by the document store. Date sheets have to be PDF files.';
  }
  return 'That file could not be uploaded right now. Please try again.';
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

/**
 * PDF only, which is the bucket's rule rather than a preference. course-documents carries an
 * allowed-MIME list of application/pdf alone: a scanned JPG of a date sheet answers 415 "mime
 * type image/jpeg is not supported" before row-level security is consulted. Accepting images
 * here would only move that refusal from the file picker, where it can be explained, to the
 * upload, where it arrives as a failed save after the admin has filled the whole drawer.
 *
 * It is worth knowing this is the reason: exam offices circulate date sheets as photographs
 * often enough that whoever widens the bucket later should widen this list in the same change.
 */
const ACCEPTED_TYPES = ['application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;

function assertDateSheetFile(file: File): void {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(`"${file.name}" is not a PDF. Date sheets have to be uploaded as PDF files.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" is larger than 10 MB. Please pick a smaller version.`);
  }
}

function safeFileName(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
  return `${Date.now()}-${base || 'date-sheet'}.${extension}`;
}

/**
 * Best effort by design. Every caller has already done the thing that actually matters to the
 * admin; a bucket that refused the removal must not turn a completed save or delete into an
 * error. An orphaned file costs storage, a half-reported delete costs trust in the screen.
 */
async function sweepStorage(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(DATE_SHEETS_BUCKET).remove([path]);
  if (error) console.warn('Date sheet file could not be removed from storage', error);
}

export const dateSheetsService = {
  /** Every date sheet, drafts included. Newest term first, then by program and semester. */
  async list(): Promise<AdminDateSheet[]> {
    const { data, error } = await supabase
      .from('date_sheets')
      .select(dateSheetColumns)
      .order('year', { ascending: false })
      .order('program', { ascending: true })
      .order('semester', { ascending: true });

    if (error) throw new Error(friendlyReadError(error.message));
    return (data ?? []).map((row) => toDateSheet(row as DateSheetRow));
  },

  /**
   * Published sheets only, filtered here rather than left to the read policy. That policy is
   * `is_published OR can_manage_content()`, so a signed-in content manager visiting the public
   * page would otherwise be shown their own unpublished drafts as though students could see
   * them — and would have no way to tell that students cannot.
   */
  async listPublished(): Promise<AdminDateSheet[]> {
    const { data, error } = await supabase
      .from('date_sheets')
      .select(dateSheetColumns)
      .eq('is_published', true)
      .order('year', { ascending: false })
      .order('program', { ascending: true })
      .order('semester', { ascending: true });

    if (error) throw new Error(friendlyReadError(error.message));
    return (data ?? []).map((row) => toDateSheet(row as DateSheetRow));
  },

  async create(input: DateSheetSaveInput): Promise<AdminDateSheet> {
    assertDateSheetInput(input);

    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('date_sheets')
      .insert({ ...toPayload(input), created_by: userData.user?.id ?? null })
      .select(dateSheetColumns)
      .single();

    if (error) throw new Error(friendlyWriteError(error));
    return toDateSheet(data as DateSheetRow);
  },

  async update(id: string, input: DateSheetSaveInput): Promise<AdminDateSheet> {
    assertDateSheetInput(input);

    await refreshAuthSession();
    const { data, error } = await supabase
      .from('date_sheets')
      .update(toPayload(input))
      .eq('id', id)
      .select(dateSheetColumns)
      .single();

    if (error) throw new Error(friendlyWriteError(error));
    return toDateSheet(data as DateSheetRow);
  },

  /**
   * The row goes first and the file second. A file swept from a row that then survives leaves a
   * published date sheet whose download 404s permanently — the worst outcome available here,
   * since a student who clicks it has no way to know the sheet still exists somewhere. A row
   * deleted with its file left behind costs nothing but the bytes.
   *
   * Counted, and the count is load-bearing: Postgres applies an RLS USING clause to DELETE by
   * filtering rows rather than raising, so a caller the policy declines removes zero rows and
   * PostgREST answers 204 with no error at all. Unchecked, this would report success and then
   * sweep the file out from under a sheet that is still published. That is reachable without
   * anything strange happening — canManageContent() reads a profile cached at login, so an admin
   * demoted mid-session still passes the client gate while the database says no. A null count
   * means the header was absent and proves nothing, so only an explicit zero is a refusal.
   */
  async remove(id: string): Promise<void> {
    await refreshAuthSession();

    const { data: existing, error: pathError } = await supabase
      .from('date_sheets')
      .select('file_path')
      .eq('id', id)
      .maybeSingle();

    // Without this a refused read looks exactly like a sheet that never had a file, and the file
    // is left in the bucket with nothing recording that it was ever meant to go.
    if (pathError) console.warn('Date sheet file path could not be read before delete', pathError);

    const { error, count } = await supabase.from('date_sheets').delete({ count: 'exact' }).eq('id', id);

    if (error) throw new Error(friendlyWriteError(error));
    if (count === 0) throw new Error(STALE_ROW_MESSAGE);

    await sweepStorage((existing as { file_path: string | null } | null)?.file_path ?? null);
  },

  async uploadFile(file: File, dateSheetId: string): Promise<{ url: string; path: string }> {
    assertDateSheetFile(file);
    await refreshAuthSession();

    const path = `${DATE_SHEETS_PREFIX}/${dateSheetId}/${safeFileName(file)}`;
    const { error } = await supabase.storage
      .from(DATE_SHEETS_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) throw new Error(friendlyStorageError(error.message));

    const { data } = supabase.storage.from(DATE_SHEETS_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  /**
   * Called after a sheet has been replaced or a save was rolled back, both of which can be the
   * first bucket write in a while. The sweep only warns, so an expired token here would orphan
   * the file with nobody the wiser — the refresh is what keeps that from being routine.
   */
  async removeFile(path?: string | null): Promise<void> {
    if (!path) return;

    await refreshAuthSession();
    await sweepStorage(path);
  },
};
