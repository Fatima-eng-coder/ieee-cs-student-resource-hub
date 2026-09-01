import { supabase } from '@/lib/supabase';
import type { Announcement } from '@/types';

/** Mirrors the announcements_form_source_check enum; restated so the service imports no component. */
export type FormSource = 'none' | 'external' | 'internal';

const announcementColumns =
  'id,title,summary,body,date,category,pinned,form_source,external_form_url,form_id,promoted,promo_headline,promo_cta_label,promo_starts_at,promo_ends_at,promo_sort';

/**
 * The public announcement shape plus the columns only the admin sets: the form an
 * announcement collects sign-ups through, and whether it is promoted onto the homepage.
 * Public callers keep reading it as a plain Announcement.
 */
export interface AdminAnnouncement extends Announcement {
  formSource: FormSource;
  externalFormUrl: string | null;
  formId: string | null;
  promoted: boolean;
  promoHeadline: string;
  promoCtaLabel: string;
  promoStartsAt: string | null;
  promoEndsAt: string | null;
  promoSort: number;
}

/** An announcement that points at an internal form, in the shape a confirm dialog needs. */
export interface AnnouncementFormLink {
  id: string;
  title: string;
  date: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  summary: string;
  body: string;
  date: string;
  category: Announcement['category'];
  pinned: boolean;
  form_source?: FormSource | string | null;
  external_form_url?: string | null;
  form_id?: string | null;
  promoted?: boolean | null;
  promo_headline?: string | null;
  promo_cta_label?: string | null;
  promo_starts_at?: string | null;
  promo_ends_at?: string | null;
  promo_sort?: number | null;
}

/**
 * Only a fully specified attachment survives the read, matching the database's own
 * coherence check: a source without the thing it names is no attachment at all.
 */
const toAttachment = (row: AnnouncementRow): Pick<AdminAnnouncement, 'formSource' | 'externalFormUrl' | 'formId'> => {
  const url = row.external_form_url?.trim() ?? '';

  if (row.form_source === 'internal' && row.form_id) {
    return { formSource: 'internal', externalFormUrl: null, formId: row.form_id };
  }

  if (row.form_source === 'external' && url) {
    return { formSource: 'external', externalFormUrl: url, formId: null };
  }

  return { formSource: 'none', externalFormUrl: null, formId: null };
};

const toAnnouncement = (row: AnnouncementRow): AdminAnnouncement => ({
  id: row.id,
  title: row.title,
  summary: row.summary,
  body: row.body,
  date: row.date,
  category: row.category,
  pinned: row.pinned,
  ...toAttachment(row),
  promoted: Boolean(row.promoted),
  promoHeadline: row.promo_headline ?? '',
  promoCtaLabel: row.promo_cta_label ?? '',
  promoStartsAt: row.promo_starts_at ?? null,
  promoEndsAt: row.promo_ends_at ?? null,
  promoSort: row.promo_sort ?? 0,
});

/**
 * announcements_form_config_check refuses a half-configured attachment outright, so a
 * source missing the URL or the form it names is normalised to 'none' before it is sent.
 */
const toAttachmentPayload = (input: Pick<AdminAnnouncement, 'formSource' | 'externalFormUrl' | 'formId'>) => {
  const url = input.externalFormUrl?.trim() ?? '';

  if (input.formSource === 'external' && url) {
    return { form_source: 'external', external_form_url: url, form_id: null };
  }

  if (input.formSource === 'internal' && input.formId) {
    return { form_source: 'internal', external_form_url: null, form_id: input.formId };
  }

  return { form_source: 'none', external_form_url: null, form_id: null };
};

const toPromoPayload = (
  input: Pick<
    AdminAnnouncement,
    'promoted' | 'promoHeadline' | 'promoCtaLabel' | 'promoStartsAt' | 'promoEndsAt' | 'promoSort'
  >
) => ({
  promoted: Boolean(input.promoted),
  promo_headline: input.promoHeadline.trim() || null,
  promo_cta_label: input.promoCtaLabel.trim() || null,
  promo_starts_at: input.promoStartsAt || null,
  promo_ends_at: input.promoEndsAt || null,
  promo_sort: Number.isFinite(input.promoSort) ? Math.trunc(input.promoSort) : 0,
});

/** The database rejects a window that closes before it opens; say so in the admin's words. */
function assertPromoWindow(startsAt: string | null | undefined, endsAt: string | null | undefined): void {
  if (!startsAt || !endsAt) return;
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new Error('The homepage promotion must end after it starts.');
  }
}

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

export function subscribeAnnouncementsChanged(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let timeout: number | null = null;
  const realtimeChannel = supabase.channel(`announcements-sync-${crypto.randomUUID()}`);
  const scheduleCallback = () => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(callback, 150);
  };

  realtimeChannel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, scheduleCallback)
    .subscribe();

  return () => {
    if (timeout) window.clearTimeout(timeout);
    void supabase.removeChannel(realtimeChannel);
  };
}

export const announcementsService = {
  async list(): Promise<AdminAnnouncement[]> {
    const { data, error } = await supabase
      .from('announcements')
      .select(announcementColumns)
      .order('pinned', { ascending: false })
      .order('date', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toAnnouncement(row as AnnouncementRow));
  },

  async create(input: Omit<AdminAnnouncement, 'id'>): Promise<AdminAnnouncement> {
    assertPromoWindow(input.promoStartsAt, input.promoEndsAt);
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
        ...toAttachmentPayload(input),
        ...toPromoPayload(input),
      })
      .select(announcementColumns)
      .single();

    if (error) throw new Error(error.message);
    return toAnnouncement(data as AnnouncementRow);
  },

  async update(id: string, patch: Partial<Omit<AdminAnnouncement, 'id'>>): Promise<AdminAnnouncement> {
    assertPromoWindow(patch.promoStartsAt, patch.promoEndsAt);
    await refreshAuthSession();
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload.title = patch.title.trim();
    if (patch.summary !== undefined) payload.summary = patch.summary.trim();
    if (patch.body !== undefined) payload.body = patch.body.trim();
    if (patch.date !== undefined) payload.date = patch.date;
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.pinned !== undefined) payload.pinned = Boolean(patch.pinned);

    // The three attachment columns are one value as far as the check constraint is
    // concerned, so they move together or not at all.
    if (patch.formSource !== undefined) {
      Object.assign(
        payload,
        toAttachmentPayload({
          formSource: patch.formSource,
          externalFormUrl: patch.externalFormUrl ?? null,
          formId: patch.formId ?? null,
        })
      );
    }

    if (patch.promoted !== undefined) {
      Object.assign(
        payload,
        toPromoPayload({
          promoted: patch.promoted,
          promoHeadline: patch.promoHeadline ?? '',
          promoCtaLabel: patch.promoCtaLabel ?? '',
          promoStartsAt: patch.promoStartsAt ?? null,
          promoEndsAt: patch.promoEndsAt ?? null,
          promoSort: patch.promoSort ?? 0,
        })
      );
    }

    const { data, error } = await supabase
      .from('announcements')
      .update(payload)
      .eq('id', id)
      .select(announcementColumns)
      .single();

    if (error) throw new Error(error.message);
    return toAnnouncement(data as AnnouncementRow);
  },

  /**
   * `authenticated` holds the DELETE grant on announcements outright; what separates a
   * content manager from anyone else is the row-level policy, and Postgres reports a delete
   * the policy refused as zero rows affected rather than as an error. Without the count a
   * refusal comes back here indistinguishable from a success. A null count is the header
   * being absent and says nothing either way, so only an explicit zero is a refusal.
   */
  async remove(id: string): Promise<void> {
    await refreshAuthSession();
    const { error, count } = await supabase.from('announcements').delete({ count: 'exact' }).eq('id', id);
    if (error) throw new Error(error.message);
    if (count === 0) {
      throw new Error(
        'That announcement was not deleted. It may already have been removed, or your account may no longer be allowed to manage announcements.'
      );
    }
  },

  /**
   * Announcements collecting sign-ups through one internal form. Read when a delete
   * confirmation opens, not per list render — which announcements share a form only matters
   * at the moment that form is about to disappear.
   */
  async listUsingForm(formId: string): Promise<AnnouncementFormLink[]> {
    const { data, error } = await supabase
      .from('announcements')
      .select('id,title,date')
      .eq('form_source', 'internal')
      .eq('form_id', formId)
      .order('date', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const link = row as Pick<AnnouncementRow, 'id' | 'title' | 'date'>;
      return { id: link.id, title: link.title, date: link.date };
    });
  },

  /**
   * Puts every announcement pointing at this form back to "no form" before the form itself
   * goes. The mirror of eventsService.detachForm, and for the same reasons: the referential
   * ON DELETE SET NULL plus its trigger would cover the database, but this keeps the delete
   * working whether or not that trigger is deployed, leaves the admin's list truthful, and
   * writes the same three columns the editor writes for "No form".
   */
  async detachForm(formId: string): Promise<void> {
    await refreshAuthSession();
    const { error } = await supabase
      .from('announcements')
      .update({ form_source: 'none', external_form_url: null, form_id: null })
      .eq('form_id', formId);

    if (error) throw new Error(error.message);
  },
};
