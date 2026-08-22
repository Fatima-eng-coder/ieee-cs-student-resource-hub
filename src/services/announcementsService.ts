import { supabase } from '@/lib/supabase';
import type { Announcement } from '@/types';

interface AnnouncementRow {
  id: string;
  title: string;
  summary: string;
  body: string;
  date: string;
  category: Announcement['category'];
  pinned: boolean;
  poster_url: string | null;
}

const POSTER_BUCKET = 'announcement-posters';
const ANNOUNCEMENTS_CHANGED_EVENT = 'ieeecs:announcements-changed';
const ANNOUNCEMENTS_CHANNEL = 'ieeecs-announcements';

const toAnnouncement = (row: AnnouncementRow): Announcement => ({
  id: row.id,
  title: row.title,
  summary: row.summary,
  body: row.body,
  date: row.date,
  category: row.category,
  pinned: row.pinned,
  posterUrl: row.poster_url,
});

function posterPathFromPublicUrl(url?: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${POSTER_BUCKET}/`;
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;

    const path = parsed.pathname.slice(markerIndex + marker.length);
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

async function removePosterIfOwned(url?: string | null): Promise<void> {
  const path = posterPathFromPublicUrl(url);
  if (!path) return;

  const { error } = await supabase.storage.from(POSTER_BUCKET).remove([path]);
  if (error) console.error('Failed to remove announcement poster', error);
}

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

function notifyAnnouncementsChanged(): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new Event(ANNOUNCEMENTS_CHANGED_EVENT));

  try {
    const channel = new BroadcastChannel(ANNOUNCEMENTS_CHANNEL);
    channel.postMessage('changed');
    channel.close();
  } catch {
    /* BroadcastChannel is optional; same-tab updates still work. */
  }
}

export function subscribeAnnouncementsChanged(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let channel: BroadcastChannel | null = null;
  const onLocalChange = () => callback();
  const onBroadcast = () => callback();

  window.addEventListener(ANNOUNCEMENTS_CHANGED_EVENT, onLocalChange);

  try {
    channel = new BroadcastChannel(ANNOUNCEMENTS_CHANNEL);
    channel.addEventListener('message', onBroadcast);
  } catch {
    channel = null;
  }

  return () => {
    window.removeEventListener(ANNOUNCEMENTS_CHANGED_EVENT, onLocalChange);
    channel?.removeEventListener('message', onBroadcast);
    channel?.close();
  };
}

export const announcementsService = {
  async list(): Promise<Announcement[]> {
    const { data, error } = await supabase
      .from('announcements')
      .select('id,title,summary,body,date,category,pinned,poster_url')
      .order('pinned', { ascending: false })
      .order('date', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toAnnouncement(row as AnnouncementRow));
  },

  async create(input: Omit<Announcement, 'id'>): Promise<Announcement> {
    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('announcements')
      .insert({
        title: input.title.trim(),
        summary: input.summary.trim(),
        body: input.body.trim(),
        date: input.date,
        category: input.category,
        pinned: Boolean(input.pinned),
        poster_url: input.posterUrl || null,
        created_by: userData.user?.id ?? null,
      })
      .select('id,title,summary,body,date,category,pinned,poster_url')
      .single();

    if (error) throw new Error(error.message);
    const created = toAnnouncement(data as AnnouncementRow);
    notifyAnnouncementsChanged();
    return created;
  },

  async update(id: string, patch: Partial<Omit<Announcement, 'id'>>): Promise<Announcement> {
    await refreshAuthSession();
    let previousPosterUrl: string | null = null;

    if (patch.posterUrl !== undefined) {
      const { data: existing, error: existingError } = await supabase
        .from('announcements')
        .select('poster_url')
        .eq('id', id)
        .single();

      if (existingError) throw new Error(existingError.message);
      previousPosterUrl = (existing as Pick<AnnouncementRow, 'poster_url'>).poster_url;
    }

    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload.title = patch.title.trim();
    if (patch.summary !== undefined) payload.summary = patch.summary.trim();
    if (patch.body !== undefined) payload.body = patch.body.trim();
    if (patch.date !== undefined) payload.date = patch.date;
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.pinned !== undefined) payload.pinned = Boolean(patch.pinned);
    if (patch.posterUrl !== undefined) payload.poster_url = patch.posterUrl || null;

    const { data, error } = await supabase
      .from('announcements')
      .update(payload)
      .eq('id', id)
      .select('id,title,summary,body,date,category,pinned,poster_url')
      .single();

    if (error) throw new Error(error.message);
    const updated = toAnnouncement(data as AnnouncementRow);

    if (patch.posterUrl !== undefined && previousPosterUrl !== updated.posterUrl) {
      await removePosterIfOwned(previousPosterUrl);
    }

    notifyAnnouncementsChanged();
    return updated;
  },

  async remove(id: string): Promise<void> {
    await refreshAuthSession();
    const { data: existing, error: existingError } = await supabase
      .from('announcements')
      .select('poster_url')
      .eq('id', id)
      .single();

    if (existingError) throw new Error(existingError.message);

    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) throw new Error(error.message);

    await removePosterIfOwned((existing as Pick<AnnouncementRow, 'poster_url'>).poster_url);
    notifyAnnouncementsChanged();
  },

  async uploadPoster(file: File): Promise<string> {
    await refreshAuthSession();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const safeName = file.name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    const path = `${Date.now()}-${safeName || 'poster'}.${ext}`;

    const { error } = await supabase.storage
      .from(POSTER_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from(POSTER_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },
};
