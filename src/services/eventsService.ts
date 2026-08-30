import { supabase } from '@/lib/supabase';
import type { EventCategory, EventItem } from '@/types';

const EVENT_IMAGES_BUCKET = 'event-images';
const baseEventColumns =
  'id,title,description,long_description,event_type,date,time,venue,cover_image_url,cover_image_path,registration_open,registration_url,capacity,organizers,is_published,created_at,updated_at';
const eventColumns = `${baseEventColumns},featured`;

export interface EventSaveInput {
  title: string;
  description: string;
  longDescription: string;
  category: EventCategory;
  date: string;
  time: string;
  venue: string;
  coverImageUrl?: string;
  coverImagePath?: string | null;
  registrationOpen: boolean;
  registrationUrl?: string;
  capacity: number;
  organizers: string[];
  isPublished: boolean;
}

interface EventRow {
  id: string;
  title: string;
  description: string;
  long_description: string | null;
  event_type: EventCategory | string;
  date: string;
  time: string;
  venue: string;
  cover_image_url: string | null;
  cover_image_path: string | null;
  registration_open: boolean;
  registration_url: string | null;
  capacity: number | null;
  organizers: unknown;
  is_published: boolean;
  featured?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface AdminEvent extends EventItem {
  coverImagePath: string | null;
  registrationUrl: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EventChange =
  | { type: 'insert'; event: AdminEvent }
  | { type: 'update'; event: AdminEvent }
  | { type: 'delete'; id: string };

const validCategories: EventCategory[] = ['workshop', 'competition', 'seminar', 'session', 'hackathon', 'other'];

const normalizeCategory = (value: string): EventCategory =>
  validCategories.includes(value as EventCategory) ? (value as EventCategory) : 'workshop';

const normalizeOrganizers = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const getTiming = (date: string): EventItem['timing'] => {
  const today = new Date().toISOString().slice(0, 10);
  return date >= today ? 'upcoming' : 'previous';
};

const toAdminEvent = (row: EventRow): AdminEvent => ({
  id: row.id,
  title: row.title,
  description: row.description,
  longDescription: row.long_description ?? '',
  date: row.date,
  time: row.time,
  venue: row.venue,
  category: normalizeCategory(row.event_type),
  timing: getTiming(row.date),
  featured: Boolean(row.featured),
  registrationOpen: row.registration_open,
  registrationUrl: row.registration_url ?? '',
  capacity: row.capacity ?? 0,
  registered: 0,
  image: row.cover_image_url ?? '',
  organizers: normalizeOrganizers(row.organizers),
  coverImagePath: row.cover_image_path,
  isPublished: row.is_published,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const isMissingFeaturedColumn = (message: string) =>
  message.toLowerCase().includes('featured') && message.toLowerCase().includes('events');

async function selectEvents(useFeaturedColumn: boolean) {
  return supabase
    .from('events')
    .select(useFeaturedColumn ? eventColumns : baseEventColumns)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
}

async function selectEventById(id: string, useFeaturedColumn: boolean) {
  return supabase
    .from('events')
    .select(useFeaturedColumn ? eventColumns : baseEventColumns)
    .eq('id', id)
    .maybeSingle();
}

const toPayload = (event: EventSaveInput) => ({
  title: event.title.trim(),
  description: event.description.trim(),
  long_description: event.longDescription.trim(),
  event_type: event.category,
  date: event.date,
  time: event.time.trim(),
  venue: event.venue.trim(),
  cover_image_url: event.coverImageUrl?.trim() || null,
  cover_image_path: event.coverImagePath ?? null,
  registration_open: Boolean(event.registrationOpen),
  registration_url: event.registrationUrl?.trim() || null,
  capacity: Number(event.capacity) || 0,
  organizers: event.organizers.map((organizer) => organizer.trim()).filter(Boolean),
  is_published: Boolean(event.isPublished),
});

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

function assertEventImage(file: File): void {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Please upload a PNG, JPG, or WebP image.');
  }
}

function safeFileName(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
  return `${Date.now()}-${base || 'event-cover'}.${extension}`;
}

export function subscribeEventsChanged(callback: (change?: EventChange) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let timeout: number | null = null;
  const realtimeChannel = supabase.channel(`events-sync-${crypto.randomUUID()}`);
  const scheduleCallback = (change?: EventChange) => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => callback(change), 150);
  };

  realtimeChannel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (payload) => {
      if (payload.eventType === 'INSERT') {
        scheduleCallback({ type: 'insert', event: toAdminEvent(payload.new as EventRow) });
        return;
      }

      if (payload.eventType === 'UPDATE') {
        scheduleCallback({ type: 'update', event: toAdminEvent(payload.new as EventRow) });
        return;
      }

      if (payload.eventType === 'DELETE') {
        const oldRow = payload.old as Partial<EventRow>;
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

export const eventsService = {
  async listAdmin(): Promise<AdminEvent[]> {
    let { data, error } = await selectEvents(true);
    if (error && isMissingFeaturedColumn(error.message)) {
      const fallback = await selectEvents(false);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toAdminEvent(row as EventRow));
  },

  async listPublic(): Promise<EventItem[]> {
    let { data, error } = await selectEvents(true);
    if (error && isMissingFeaturedColumn(error.message)) {
      const fallback = await selectEvents(false);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row) => toAdminEvent(row as EventRow))
      .filter((event) => event.isPublished);
  },

  async getPublic(id?: string): Promise<EventItem | null> {
    if (!id) return null;

    let { data, error } = await selectEventById(id, true);
    if (error && isMissingFeaturedColumn(error.message)) {
      const fallback = await selectEventById(id, false);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);
    if (!data) return null;

    const event = toAdminEvent(data as EventRow);
    return event.isPublished ? event : null;
  },

  async create(input: EventSaveInput): Promise<AdminEvent> {
    if (!input.title.trim()) throw new Error('Please enter the event title.');
    if (!input.description.trim()) throw new Error('Please enter a short event description.');
    if (!input.date) throw new Error('Please select the event date.');
    if (!input.time.trim()) throw new Error('Please enter the event time.');
    if (!input.venue.trim()) throw new Error('Please enter the event venue.');

    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();
    let { data, error } = await supabase
      .from('events')
      .insert({
        ...toPayload(input),
        created_by: userData.user?.id ?? null,
      })
      .select(eventColumns)
      .single();
    if (error && isMissingFeaturedColumn(error.message)) {
      const fallback = await supabase
        .from('events')
        .insert({
          ...toPayload(input),
          created_by: userData.user?.id ?? null,
        })
        .select(baseEventColumns)
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);
    return toAdminEvent(data as EventRow);
  },

  async update(id: string, input: EventSaveInput): Promise<AdminEvent> {
    if (!input.title.trim()) throw new Error('Please enter the event title.');
    if (!input.description.trim()) throw new Error('Please enter a short event description.');
    if (!input.date) throw new Error('Please select the event date.');
    if (!input.time.trim()) throw new Error('Please enter the event time.');
    if (!input.venue.trim()) throw new Error('Please enter the event venue.');

    await refreshAuthSession();
    let { data, error } = await supabase
      .from('events')
      .update(toPayload(input))
      .eq('id', id)
      .select(eventColumns)
      .single();
    if (error && isMissingFeaturedColumn(error.message)) {
      const fallback = await supabase
        .from('events')
        .update(toPayload(input))
        .eq('id', id)
        .select(baseEventColumns)
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);
    return toAdminEvent(data as EventRow);
  },

  async remove(id: string): Promise<void> {
    await refreshAuthSession();
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async uploadCoverImage(file: File, eventId: string): Promise<{ url: string; path: string }> {
    assertEventImage(file);
    await refreshAuthSession();

    const path = `events/${eventId}/${safeFileName(file)}`;
    const { error } = await supabase.storage
      .from(EVENT_IMAGES_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from(EVENT_IMAGES_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  async removeCoverImage(path?: string | null): Promise<void> {
    if (!path) return;
    const { error } = await supabase.storage.from(EVENT_IMAGES_BUCKET).remove([path]);
    if (error) throw new Error(error.message);
  },
};
