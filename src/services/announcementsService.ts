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
}

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
});

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
      .select('id,title,summary,body,date,category,pinned')
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
        created_by: userData.user?.id ?? null,
      })
      .select('id,title,summary,body,date,category,pinned')
      .single();

    if (error) throw new Error(error.message);
    const created = toAnnouncement(data as AnnouncementRow);
    notifyAnnouncementsChanged();
    return created;
  },

  async update(id: string, patch: Partial<Omit<Announcement, 'id'>>): Promise<Announcement> {
    await refreshAuthSession();
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload.title = patch.title.trim();
    if (patch.summary !== undefined) payload.summary = patch.summary.trim();
    if (patch.body !== undefined) payload.body = patch.body.trim();
    if (patch.date !== undefined) payload.date = patch.date;
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.pinned !== undefined) payload.pinned = Boolean(patch.pinned);

    const { data, error } = await supabase
      .from('announcements')
      .update(payload)
      .eq('id', id)
      .select('id,title,summary,body,date,category,pinned')
      .single();

    if (error) throw new Error(error.message);
    const updated = toAnnouncement(data as AnnouncementRow);

    notifyAnnouncementsChanged();
    return updated;
  },

  async remove(id: string): Promise<void> {
    await refreshAuthSession();
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) throw new Error(error.message);

    notifyAnnouncementsChanged();
  },
};
