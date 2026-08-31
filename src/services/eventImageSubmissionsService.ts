import { supabase } from '@/lib/supabase';

const EVENT_IMAGES_BUCKET = 'event-images';
const MAX_IMAGES = 3;

export type EventImageSubmissionStatus = 'pending';

export interface EventImageSubmission {
  id: string;
  eventName: string;
  imageUrls: string[];
  imagePaths: string[];
  status: EventImageSubmissionStatus;
  submittedBy: string | null;
  createdAt: string;
}

interface EventImageSubmissionRow {
  id: string;
  event_name: string;
  image_urls: unknown;
  image_paths: unknown;
  status: EventImageSubmissionStatus;
  submitted_by: string | null;
  created_at: string;
}

interface CreateEventImageSubmissionInput {
  eventName: string;
  images: string[];
}

interface UploadResult {
  url: string;
  path: string;
}

const columns = 'id,event_name,image_urls,image_paths,status,submitted_by,created_at';

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toEventImageSubmission = (row: EventImageSubmissionRow): EventImageSubmission => ({
  id: row.id,
  eventName: row.event_name,
  imageUrls: toStringArray(row.image_urls),
  imagePaths: toStringArray(row.image_paths),
  status: row.status,
  submittedBy: row.submitted_by,
  createdAt: row.created_at,
});

const friendlyPublicError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied') || lower.includes('not authorized')) {
    return 'Your photos could not be uploaded because storage access rules blocked the request. Please ask the team to enable public event photo submissions.';
  }

  if (lower.includes('payload') || lower.includes('too large')) {
    return 'One or more photos are too large. Please try smaller images.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  return 'Your event photos could not be submitted right now. Please try again.';
};

const friendlyAdminError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied') || lower.includes('not authorized')) {
    return 'Only content managers can manage event image submissions.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  return 'Event image submissions could not be updated right now. Please try again.';
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

function dataUrlToFile(dataUrl: string, index: number): File {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/^data:([^;]+);base64$/)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const extension = mime.split('/')[1] || 'jpg';
  return new File([bytes], `event-photo-${index + 1}.${extension}`, { type: mime });
}

function assertImage(file: File): void {
  if (!file.type.startsWith('image/')) throw new Error('Please upload image files only.');
}

async function uploadImage(dataUrl: string, eventName: string, index: number): Promise<UploadResult> {
  const file = dataUrlToFile(dataUrl, index);
  assertImage(file);

  const safeEvent = eventName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `submissions/${safeEvent || 'event'}/${Date.now()}-${crypto.randomUUID()}-${index + 1}.${extension}`;

  const { error } = await supabase.storage
    .from(EVENT_IMAGES_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(EVENT_IMAGES_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

async function cleanupUploads(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabase.storage.from(EVENT_IMAGES_BUCKET).remove(paths);
}

export const eventImageSubmissionsService = {
  async create(input: CreateEventImageSubmissionInput): Promise<void> {
    const eventName = input.eventName.trim();
    const images = input.images.slice(0, MAX_IMAGES);

    if (!eventName) throw new Error('Please select an event before submitting photos.');
    if (images.length === 0) throw new Error('Please add at least one photo.');
    if (input.images.length > MAX_IMAGES) throw new Error(`Please upload no more than ${MAX_IMAGES} photos at a time.`);

    const uploads: UploadResult[] = [];

    try {
      for (const image of images) {
        uploads.push(await uploadImage(image, eventName, uploads.length));
      }

      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('event_image_submissions').insert({
        event_name: eventName,
        image_urls: uploads.map((upload) => upload.url),
        image_paths: uploads.map((upload) => upload.path),
        status: 'pending',
        submitted_by: userData.user?.id ?? null,
      });

      if (error) {
        await cleanupUploads(uploads.map((upload) => upload.path));
        throw new Error(error.message);
      }
    } catch (err) {
      if (uploads.length > 0) await cleanupUploads(uploads.map((upload) => upload.path));
      throw new Error(err instanceof Error ? friendlyPublicError(err.message) : 'Your event photos could not be submitted right now.');
    }
  },

  async listForAdmin(): Promise<EventImageSubmission[]> {
    const { data, error } = await supabase
      .from('event_image_submissions')
      .select(columns)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyAdminError(error.message));
    return ((data ?? []) as EventImageSubmissionRow[]).map(toEventImageSubmission);
  },

  async remove(submission: EventImageSubmission): Promise<void> {
    await refreshAuthSession();

    if (submission.imagePaths.length > 0) {
      const { error: storageError } = await supabase.storage.from(EVENT_IMAGES_BUCKET).remove(submission.imagePaths);
      if (storageError) throw new Error(friendlyAdminError(storageError.message));
    }

    const { error } = await supabase.from('event_image_submissions').delete().eq('id', submission.id);
    if (error) throw new Error(friendlyAdminError(error.message));
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
