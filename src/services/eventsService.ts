import { supabase } from '@/lib/supabase';
import type { EventCategory, EventImageLayout, EventItem } from '@/types';

const EVENT_IMAGES_BUCKET = 'event-images';
const baseEventColumns =
  'id,title,description,long_description,event_type,date,time,venue,cover_image_url,cover_image_path,registration_open,registration_url,capacity,organizers,is_published,created_at,updated_at';
const attachmentColumns =
  'form_source,external_form_url,form_id,promoted,promo_headline,promo_cta_label,promo_starts_at,promo_ends_at,promo_sort';
const eventColumns = `${baseEventColumns},featured,image_layout,${attachmentColumns}`;

/** Mirrors the events_form_source_check enum; restated so the service imports no component. */
export type FormSource = 'none' | 'external' | 'internal';

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
  featured: boolean;
  imageLayout: EventImageLayout;
  registrationOpen: boolean;
  capacity: number;
  organizers: string[];
  isPublished: boolean;
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
  image_layout?: EventImageLayout | string | null;
  form_source?: FormSource | string | null;
  external_form_url?: string | null;
  form_id?: string | null;
  promoted?: boolean | null;
  promo_headline?: string | null;
  promo_cta_label?: string | null;
  promo_starts_at?: string | null;
  promo_ends_at?: string | null;
  promo_sort?: number | null;
  created_at: string;
  updated_at: string;
}

export interface AdminEvent extends EventItem {
  coverImagePath: string | null;
  registrationUrl: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
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

export type EventChange =
  | { type: 'insert'; event: AdminEvent }
  | { type: 'update'; event: AdminEvent }
  | { type: 'delete'; id: string };

/**
 * An event that points at an internal form, in the shape a confirm dialog needs: enough to
 * name it, and — because deleting an event is also what deletes its artwork — the storage
 * path a cascading delete has to clean up.
 */
export interface EventFormLink {
  id: string;
  title: string;
  date: string;
  coverImagePath: string | null;
}

const validCategories: EventCategory[] = ['workshop', 'competition', 'seminar', 'session', 'hackathon', 'other'];

const normalizeCategory = (value: string): EventCategory =>
  validCategories.includes(value as EventCategory) ? (value as EventCategory) : 'workshop';

const normalizeImageLayout = (value: string | null | undefined): EventImageLayout =>
  value === 'banner' ? 'banner' : 'poster';

const normalizeOrganizers = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const getLocalDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTiming = (date: string): EventItem['timing'] => {
  const today = getLocalDateKey();
  return date >= today ? 'upcoming' : 'previous';
};

/**
 * `registration_url` is the pre-forms column. The migration copied it into
 * external_form_url, but a row saved before that ran — or by an older build — can still
 * carry only the legacy value, so it stands in when form_source has not been set. Anything
 * written from here keeps the two in step, which is what stops a cleared attachment from
 * being resurrected by a stale legacy value on the next read.
 */
const toAttachment = (row: EventRow): Pick<AdminEvent, 'formSource' | 'externalFormUrl' | 'formId'> => {
  const source = row.form_source ?? 'none';
  const legacyUrl = row.registration_url?.trim() ?? '';

  if (source === 'internal' && row.form_id) {
    return { formSource: 'internal', externalFormUrl: null, formId: row.form_id };
  }

  const url = row.external_form_url?.trim() || legacyUrl;
  if ((source === 'external' || source === 'none') && url) {
    return { formSource: 'external', externalFormUrl: url, formId: null };
  }

  return { formSource: 'none', externalFormUrl: null, formId: null };
};

const toAdminEvent = (row: EventRow): AdminEvent => {
  const attachment = toAttachment(row);

  return {
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
    imageLayout: normalizeImageLayout(row.image_layout),
    registrationOpen: row.registration_open,
    // Kept populated for the public pages that still read it; an internal form has no URL
    // to give them, so it reads as empty there until they learn about form_id.
    registrationUrl: attachment.externalFormUrl ?? '',
    capacity: row.capacity ?? 0,
    registered: 0,
    image: row.cover_image_url ?? '',
    organizers: normalizeOrganizers(row.organizers),
    coverImagePath: row.cover_image_path,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...attachment,
    registrationFormId: attachment.formId ?? undefined,
    promoted: Boolean(row.promoted),
    promoHeadline: row.promo_headline ?? '',
    promoCtaLabel: row.promo_cta_label ?? '',
    promoStartsAt: row.promo_starts_at ?? null,
    promoEndsAt: row.promo_ends_at ?? null,
    promoSort: row.promo_sort ?? 0,
  };
};

/**
 * Columns added after the first release. A database that predates any of them fails the
 * whole select, so the read drops back to the columns that have always been there rather
 * than showing the admin an empty events table.
 */
const optionalEventColumns = [
  'featured',
  'image_layout',
  'form_source',
  'external_form_url',
  'form_id',
  'promoted',
  'promo_headline',
  'promo_cta_label',
  'promo_starts_at',
  'promo_ends_at',
  'promo_sort',
];

const isMissingOptionalEventsColumn = (message: string) => {
  const lower = message.toLowerCase();
  return lower.includes('events') && optionalEventColumns.some((column) => lower.includes(column));
};

async function selectEvents(useFeaturedColumn: boolean) {
  return supabase
    .from('events')
    .select(useFeaturedColumn ? eventColumns : baseEventColumns)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .returns<EventRow[]>();
}

async function selectEventById(id: string, useFeaturedColumn: boolean) {
  return supabase
    .from('events')
    .select(useFeaturedColumn ? eventColumns : baseEventColumns)
    .eq('id', id)
    .maybeSingle()
    .returns<EventRow>();
}

/**
 * events_form_config_check refuses any half-configured attachment, and a rejected insert
 * costs the admin the whole drawer — so an external source with no URL, or an internal one
 * with no form, is normalised down to "none" here rather than sent and bounced.
 *
 * registration_url is written as a mirror of the external URL until it is dropped: the
 * public event pages still read it, and leaving a stale value behind after the admin
 * detaches a form would put a dead Register button back on the site.
 */
const toAttachmentPayload = (event: EventSaveInput) => {
  const url = event.externalFormUrl?.trim() ?? '';

  if (event.formSource === 'external' && url) {
    return { form_source: 'external', external_form_url: url, form_id: null, registration_url: url };
  }

  if (event.formSource === 'internal' && event.formId) {
    return { form_source: 'internal', external_form_url: null, form_id: event.formId, registration_url: null };
  }

  return { form_source: 'none', external_form_url: null, form_id: null, registration_url: null };
};

const toPromoPayload = (event: EventSaveInput) => ({
  promoted: Boolean(event.promoted),
  promo_headline: event.promoHeadline.trim() || null,
  promo_cta_label: event.promoCtaLabel.trim() || null,
  promo_starts_at: event.promoStartsAt || null,
  promo_ends_at: event.promoEndsAt || null,
  promo_sort: Number.isFinite(event.promoSort) ? Math.trunc(event.promoSort) : 0,
});

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
  featured: Boolean(event.featured),
  image_layout: event.imageLayout,
  registration_open: Boolean(event.registrationOpen),
  capacity: Number(event.capacity) || 0,
  organizers: event.organizers.map((organizer) => organizer.trim()).filter(Boolean),
  is_published: Boolean(event.isPublished),
  ...toAttachmentPayload(event),
  ...toPromoPayload(event),
});

/** Everything the database would refuse, named in the admin's own words first. */
function assertEventInput(input: EventSaveInput): void {
  if (!input.title.trim()) throw new Error('Please enter the event title.');
  if (!input.description.trim()) throw new Error('Please enter a short event description.');
  if (!input.date) throw new Error('Please select the event date.');
  if (!input.time.trim()) throw new Error('Please enter the event time.');
  if (!input.venue.trim()) throw new Error('Please enter the event venue.');

  if (
    input.promoStartsAt &&
    input.promoEndsAt &&
    new Date(input.promoEndsAt).getTime() <= new Date(input.promoStartsAt).getTime()
  ) {
    throw new Error('The homepage promotion must end after it starts.');
  }
}

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

/**
 * The same 5 MB ceiling bannersService, galleryService, projectsService and
 * eventImageSubmissionsService all apply. This function checked the MIME type and stopped,
 * which made event covers the one upload path in the app with no size limit in the browser --
 * and the event-images bucket had none either, so nothing bounded it at all.
 */
const MAX_BYTES = 5 * 1024 * 1024;

function assertEventImage(file: File): void {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Please upload a PNG, JPG, or WebP image.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('That image is larger than 5 MB. Please pick a smaller version.');
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
    if (error && isMissingOptionalEventsColumn(error.message)) {
      const fallback = await selectEvents(false);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toAdminEvent(row as EventRow));
  },

  async listPublic(): Promise<EventItem[]> {
    let { data, error } = await selectEvents(true);
    if (error && isMissingOptionalEventsColumn(error.message)) {
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
    if (error && isMissingOptionalEventsColumn(error.message)) {
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
    assertEventInput(input);

    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();
    let { data, error } = await supabase
      .from('events')
      .insert({
        ...toPayload(input),
        created_by: userData.user?.id ?? null,
      })
      .select(eventColumns)
      .single()
      .returns<EventRow>();

    if (error) throw new Error(error.message);
    return toAdminEvent(data as EventRow);
  },

  async update(id: string, input: EventSaveInput): Promise<AdminEvent> {
    assertEventInput(input);

    await refreshAuthSession();
    let { data, error } = await supabase
      .from('events')
      .update(toPayload(input))
      .eq('id', id)
      .select(eventColumns)
      .single()
      .returns<EventRow>();

    if (error) throw new Error(error.message);
    return toAdminEvent(data as EventRow);
  },

  /**
   * `authenticated` holds the DELETE grant on events outright; what separates a content
   * manager from anyone else is the row-level policy, and Postgres reports a delete the
   * policy refused as zero rows affected rather than as an error. Without the count a
   * refusal comes back here indistinguishable from a success, and the admin gets a green
   * banner for a row that is still there. A null count is the header being absent and says
   * nothing either way, so only an explicit zero is treated as a refusal.
   */
  async remove(id: string): Promise<void> {
    await refreshAuthSession();
    const { error, count } = await supabase.from('events').delete({ count: 'exact' }).eq('id', id);
    if (error) throw new Error(error.message);
    if (count === 0) {
      throw new Error(
        'That event was not deleted. It may already have been removed, or your account may no longer be allowed to manage events.'
      );
    }
  },

  /**
   * Events collecting sign-ups through one internal form. Read when a delete confirmation
   * opens, never per list render: the admin table already shows whether a form is attached,
   * and which events share it only matters at the moment one of them is about to disappear.
   */
  async listUsingForm(formId: string): Promise<EventFormLink[]> {
    const { data, error } = await supabase
      .from('events')
      .select('id,title,date,cover_image_path')
      .eq('form_source', 'internal')
      .eq('form_id', formId)
      .order('date', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const link = row as Pick<EventRow, 'id' | 'title' | 'date' | 'cover_image_path'>;
      return { id: link.id, title: link.title, date: link.date, coverImagePath: link.cover_image_path };
    });
  },

  /**
   * Puts every event pointing at this form back to "no form" before the form itself goes.
   *
   * The database would survive without this — form_id is ON DELETE SET NULL and a trigger
   * normalises form_source alongside it — but relying on that leaves three problems. The
   * trigger has to be deployed for the delete to succeed at all (without it the referential
   * update trips events_form_config_check and the delete fails with an error naming events,
   * not forms). The admin's open events list keeps showing "Site form" for a form that no
   * longer exists. And doing it here writes exactly what the editor writes when an admin
   * picks "No form", so the surviving rows land in a state the rest of the app already
   * understands, including the legacy registration_url mirror that toAttachment would
   * otherwise read back as an external link.
   */
  async detachForm(formId: string): Promise<void> {
    await refreshAuthSession();
    const { error } = await supabase
      .from('events')
      .update({ form_source: 'none', external_form_url: null, form_id: null, registration_url: null })
      .eq('form_id', formId);

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
