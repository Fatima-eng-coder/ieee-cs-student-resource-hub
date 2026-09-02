/**
 * Photos a student sends in from an event.
 *
 * Merged from two independent implementations of the same feature. The admin half — the review
 * queue's list, the discard, the realtime subscription — comes from master. The upload half is
 * rewritten, because master's version cannot work against the database as it now stands:
 *
 *   it wrote to  submissions/<event-name>/…   and allowed submitted_by to be null
 *   the policy allows  submissions/<uploader-uid>/…  and requires submitted_by = auth.uid()
 *
 * The bucket used to accept an upload from anyone holding the publishable key, to any path under
 * submissions/ — an unmetered upload endpoint for the whole internet. 20260901000700 and 000800
 * narrowed it to a signed-in student writing into their own folder, which is what the paths and
 * the session check below are for. Uploading anonymously now returns 403 whatever the path.
 *
 * Two writes, in this order and no other: the file goes to storage first, then the row that
 * points at it. The table's CHECK requires a non-empty image_urls, so there is no valid row to
 * write until the files exist — which makes the failure to design for a row that never lands
 * after the upload did. Every path that can fail afterwards sweeps its own files back out.
 */

import { supabase } from '@/lib/supabase';

const EVENT_IMAGES_BUCKET = 'event-images';

/** The table's own ceiling. Kept here so the picker stops before the database has to. */
export const MAX_EVENT_PHOTOS = 3;

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export type EventImageSubmissionStatus = 'pending';

export interface EventImageSubmission {
  id: string;
  eventName: string;
  imageUrls: string[];
  imagePaths: string[];
  status: EventImageSubmissionStatus;
  submittedBy: string | null;
  /** Stamped server-side from the session; never sent by the client. */
  studentEmail: string | null;
  createdAt: string;
}

interface EventImageSubmissionRow {
  id: string;
  event_name: string;
  image_urls: unknown;
  image_paths: unknown;
  status: EventImageSubmissionStatus;
  submitted_by: string | null;
  student_email: string | null;
  created_at: string;
}

export interface EventImageSubmissionInput {
  /** Free text: an album may be named before the event row is. */
  eventName: string;
  files: File[];
}

interface UploadResult {
  url: string;
  path: string;
}

const columns =
  'id,event_name,image_urls,image_paths,status,submitted_by,student_email,created_at';

/** jsonb columns arrive as unknown; anything that is not a string is not a path. */
const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toEventImageSubmission = (row: EventImageSubmissionRow): EventImageSubmission => ({
  id: row.id,
  eventName: row.event_name,
  imageUrls: toStringArray(row.image_urls),
  imagePaths: toStringArray(row.image_paths),
  status: row.status,
  submittedBy: row.submitted_by,
  studentEmail: row.student_email,
  createdAt: row.created_at,
});

const friendlyPublicError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('5 pending') || lower.includes('pending submissions')) return message;
  if (lower.includes('max_images')) return `Please send between 1 and ${MAX_EVENT_PHOTOS} photos.`;
  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Your session does not allow this. Please log out, log back in, and try again.';
  }
  if (lower.includes('payload') || lower.includes('too large')) {
    return 'Those photos are too large. Please pick smaller versions and try again.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'Those photos could not be sent right now. Please try again.';
};

const friendlyAdminError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Only content managers can review event photo submissions.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'Event photo submissions could not be loaded right now. Please try again.';
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

function assertPhotos(files: File[]): void {
  if (files.length === 0) throw new Error('Pick at least one photo to send.');
  if (files.length > MAX_EVENT_PHOTOS) {
    throw new Error(`You can send up to ${MAX_EVENT_PHOTOS} photos at a time.`);
  }
  for (const file of files) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      throw new Error(`"${file.name}" is not a PNG, JPG or WebP image.`);
    }
    if (file.size > MAX_BYTES) {
      throw new Error(`"${file.name}" is larger than 5 MB. Please pick a smaller version.`);
    }
  }
}

/** Index-suffixed so two files chosen in the same millisecond cannot collide. */
function safeFileName(file: File, index: number): string {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${Date.now()}-${index}-${base || 'event-photo'}.${extension}`;
}

/** Best effort: the row already failed, and a failed cleanup must not replace that message. */
async function discard(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(EVENT_IMAGES_BUCKET).remove(paths);
  if (error) console.warn('Could not remove uploaded photos after a failed submission', error);
}

export const eventImageSubmissionsService = {
  async submit(input: EventImageSubmissionInput): Promise<EventImageSubmission> {
    const eventName = input.eventName.trim();
    if (!eventName) throw new Error('Choose which event these photos are from.');
    assertPhotos(input.files);

    const { data: sessionData } = await supabase.auth.refreshSession();
    const userId = sessionData.session?.user.id ?? (await supabase.auth.getUser()).data.user?.id;
    if (!userId) {
      throw new Error('Please log in with your university account before sending photos.');
    }

    const uploaded: UploadResult[] = [];

    try {
      for (const [index, file] of input.files.entries()) {
        // submissions/<uid>/… is the only prefix the storage policy accepts, and the uid segment
        // is compared against auth.uid() — one student cannot write into another's folder.
        const path = `submissions/${userId}/${safeFileName(file, index)}`;
        const { error } = await supabase.storage
          .from(EVENT_IMAGES_BUCKET)
          .upload(path, file, { cacheControl: '3600', upsert: false });

        if (error) throw new Error(friendlyPublicError(error.message));

        const { data } = supabase.storage.from(EVENT_IMAGES_BUCKET).getPublicUrl(path);
        uploaded.push({ url: data.publicUrl, path });
      }

      const { data, error } = await supabase
        .from('event_image_submissions')
        .insert({
          event_name: eventName,
          image_urls: uploaded.map((item) => item.url),
          image_paths: uploaded.map((item) => item.path),
          status: 'pending',
          submitted_by: userId,
        })
        .select(columns)
        .single();

      if (error) throw new Error(friendlyPublicError(error.message));
      return toEventImageSubmission(data as EventImageSubmissionRow);
    } catch (cause) {
      await discard(uploaded.map((item) => item.path));
      throw cause;
    }
  },

  /** What the signed-in student has sent, so the page can say "already received". */
  async listMine(): Promise<EventImageSubmission[]> {
    const { data, error } = await supabase
      .from('event_image_submissions')
      .select(columns)
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyPublicError(error.message));
    return ((data ?? []) as EventImageSubmissionRow[]).map(toEventImageSubmission);
  },

  /** The review queue. Content managers only — the policy sees to that. */
  async listForAdmin(): Promise<EventImageSubmission[]> {
    const { data, error } = await supabase
      .from('event_image_submissions')
      .select(columns)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyAdminError(error.message));
    return ((data ?? []) as EventImageSubmissionRow[]).map(toEventImageSubmission);
  },

  /**
   * Discards a submission and its files.
   *
   * Row first, sweep second — the reverse of how this arrived from master. Postgres reports a
   * policy-declined DELETE as zero rows affected rather than as an error, so sweeping first and
   * then failing to delete would leave the submission in the queue with its photos already gone
   * and unrecoverable. The count is what tells a refusal apart from a success.
   */
  async remove(submission: EventImageSubmission): Promise<void> {
    await refreshAuthSession();

    const { error, count } = await supabase
      .from('event_image_submissions')
      .delete({ count: 'exact' })
      .eq('id', submission.id);

    if (error) throw new Error(friendlyAdminError(error.message));
    // Only an explicit zero. A null count means the header was absent and proves nothing.
    if (count === 0) {
      throw new Error('That submission was not removed. It may already be gone, or you may not have permission.');
    }

    await discard(submission.imagePaths);
  },

  subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;

    let timeout: number | null = null;
    const scheduleCallback = () => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(callback, 150);
    };

    const channel = supabase
      .channel(`event-image-submissions-sync-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_image_submissions' }, scheduleCallback)
      .subscribe();

    return () => {
      if (timeout) window.clearTimeout(timeout);
      void supabase.removeChannel(channel);
    };
  },
};
