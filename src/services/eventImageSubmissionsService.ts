/**
 * Photos a student sends in from an event.
 *
 * Two writes, in this order and no other: the file goes to storage first, then the row that
 * points at it. The table's CHECK requires a non-empty image_urls, so there is no valid row
 * to write until the files exist — which means the failure mode to design for is a row that
 * never lands after the upload did. Every path that can fail after an upload sweeps its own
 * files back out before it rethrows; the storage policy is scoped to submissions/<uid>/, so a
 * student can always take back their own orphan.
 *
 * Signing in is required, and that is a deliberate narrowing: the bucket used to accept
 * uploads from anyone holding the publishable key. See 20260901000700/800 for what that
 * bought and what it cost.
 */

import { supabase } from '@/lib/supabase';

const EVENT_IMAGES_BUCKET = 'event-images';

/** The table's own ceiling. Kept here so the picker can stop before the database has to. */
export const MAX_EVENT_PHOTOS = 3;

export interface EventImageSubmissionInput {
  /** The event's title, stored as free text: an album may be named before the event row is. */
  eventName: string;
  files: File[];
}

export interface EventImageSubmission {
  id: string;
  eventName: string;
  imageUrls: string[];
  imagePaths: string[];
  status: 'pending';
  submittedBy: string | null;
  studentEmail: string | null;
  createdAt: string;
}

interface EventImageSubmissionRow {
  id: string;
  event_name: string;
  image_urls: string[] | null;
  image_paths: string[] | null;
  status: 'pending';
  submitted_by: string | null;
  student_email: string | null;
  created_at: string;
}

const columns = 'id,event_name,image_urls,image_paths,status,submitted_by,student_email,created_at';

const toSubmission = (row: EventImageSubmissionRow): EventImageSubmission => ({
  id: row.id,
  eventName: row.event_name,
  imageUrls: Array.isArray(row.image_urls) ? row.image_urls : [],
  imagePaths: Array.isArray(row.image_paths) ? row.image_paths : [],
  status: row.status,
  submittedBy: row.submitted_by,
  studentEmail: row.student_email,
  createdAt: row.created_at,
});

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

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

const friendlyError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('5 pending') || lower.includes('pending submissions')) return message;
  if (lower.includes('max_images')) {
    return `Please send between 1 and ${MAX_EVENT_PHOTOS} photos.`;
  }
  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Your session does not allow this. Please log out, log back in, and try again.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'Those photos could not be sent right now. Please try again.';
};

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

    const uploaded: { url: string; path: string }[] = [];

    try {
      for (const [index, file] of input.files.entries()) {
        const path = `submissions/${userId}/${safeFileName(file, index)}`;
        const { error } = await supabase.storage
          .from(EVENT_IMAGES_BUCKET)
          .upload(path, file, { cacheControl: '3600', upsert: false });

        if (error) throw new Error(friendlyError(error.message));

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

      if (error) throw new Error(friendlyError(error.message));
      return toSubmission(data as EventImageSubmissionRow);
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

    if (error) throw new Error(friendlyError(error.message));
    return ((data ?? []) as EventImageSubmissionRow[]).map(toSubmission);
  },
};
