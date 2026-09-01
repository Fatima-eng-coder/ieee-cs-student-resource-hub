/**
 * Promotional banners, moved off the localStorage collection they used to live in.
 *
 * Nothing on the public site renders these yet — BannerCarousel exists but no page mounts it —
 * so `is_published` is currently a flag the admin sets for a surface that has not been built.
 * It is still honoured here rather than ignored: listPublished() is what that page will call,
 * and a draft banner leaking onto the site the day someone mounts the carousel is not a bug
 * anyone would think to look for.
 */

import { supabase } from '@/lib/supabase';
import type { Banner } from '@/types';

/**
 * Artwork shares the event-images bucket rather than getting one of its own, on the same
 * reasoning galleryService uses for `gallery/`: creating a bucket is a dashboard action no
 * migration in this repo can perform, and this one already carries the two policies needed —
 * content-manager write, public read. The `banners/` prefix keeps it apart from event art.
 *
 * Not course-documents, which is where the date sheets go and where this was first pointed.
 * That bucket has an allowed-MIME list of application/pdf alone: uploading a PNG there answers
 * 415 "mime type image/png is not supported" before row-level security is ever consulted, so
 * no banner image can be stored in it. Widening that list is a dashboard change, and widening
 * a bucket that holds nothing but PDFs to accept images so that banners can live beside course
 * material is a worse trade than using the bucket already meant for pictures.
 */
const BANNERS_BUCKET = 'event-images';
const BANNERS_PREFIX = 'banners';

const bannerColumns =
  'id,title,subtitle,image_url,image_path,cta_label,cta_link,banner_type,is_published,sort_order,created_at,updated_at';

export type BannerType = Banner['type'];

export const BANNER_TYPES: BannerType[] = ['sponsor', 'workshop', 'announcement', 'partner', 'campaign'];

/** The public banner shape plus the columns only the admin sets. */
export interface AdminBanner extends Banner {
  subtitle: string;
  imagePath: string | null;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BannerSaveInput {
  title: string;
  subtitle: string;
  image: string;
  imagePath: string | null;
  ctaLabel: string;
  ctaLink: string;
  type: BannerType;
  isPublished: boolean;
  sortOrder: number;
}

interface BannerRow {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  image_path: string | null;
  cta_label: string | null;
  cta_link: string | null;
  banner_type: BannerType | string;
  is_published: boolean;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

const normalizeType = (value: string): BannerType =>
  BANNER_TYPES.includes(value as BannerType) ? (value as BannerType) : 'announcement';

const toBanner = (row: BannerRow): AdminBanner => ({
  id: row.id,
  title: row.title,
  subtitle: row.subtitle ?? '',
  image: row.image_url ?? '',
  imagePath: row.image_path,
  ctaLabel: row.cta_label ?? '',
  ctaLink: row.cta_link ?? '',
  type: normalizeType(row.banner_type),
  isPublished: row.is_published,
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * cta_label and cta_link are NOT NULL with an empty-string default, and site_banners_cta_check
 * compares them as a pair — so a cleared call to action is written as two empty strings, never
 * as null, which would fail the NOT NULL before the check ever got a look at it.
 */
const toPayload = (input: BannerSaveInput) => ({
  title: input.title.trim(),
  subtitle: input.subtitle.trim(),
  image_url: input.image.trim() || null,
  image_path: input.imagePath ?? null,
  cta_label: input.ctaLabel.trim(),
  cta_link: input.ctaLink.trim(),
  banner_type: input.type,
  is_published: Boolean(input.isPublished),
  sort_order: Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder) : 0,
});

/** Everything the database would refuse, named in the admin's own words first. */
function assertBannerInput(input: BannerSaveInput): void {
  if (!input.title.trim()) throw new Error('Please enter the banner title.');

  // site_banners_cta_check: a label with nowhere to go renders as a dead button, and a link
  // with no label renders as nothing at all. Which half is missing is the useful part.
  const label = input.ctaLabel.trim();
  const link = input.ctaLink.trim();
  if (label && !link) throw new Error('Please add the link this call to action should open, or clear the button label.');
  if (link && !label) throw new Error('Please add the button label for this link, or clear the link.');
}

const friendlyReadError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'The banners could not be loaded because access to them is currently restricted.';
  }
  if (lower.includes('does not exist') || lower.includes('schema cache')) {
    return 'Banners are not ready yet. Please check the site_banners table and Data API settings.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'The banners could not be loaded right now. Please try again later.';
};

/** Said whenever a write names a row the database no longer holds, however that is discovered. */
const STALE_ROW_MESSAGE = 'That banner is no longer there. Reload the page to see what is stored.';

/**
 * Mapped on SQLSTATE first, because the message behind one code varies. A refusal here arrives
 * either as "permission denied for table site_banners" (anon holds no write grant at all) or as
 * "new row violates row-level security policy" (signed in, but not a content manager) — same
 * 42501, same thing to say about it.
 */
const friendlyWriteError = (error: { code?: string; message: string }) => {
  const lower = error.message.toLowerCase();

  if (error.code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Only content managers can change banners.';
  }

  if (error.code === '23514' || lower.includes('violates check constraint')) {
    if (lower.includes('site_banners_cta_check')) {
      return 'A call to action needs both a button label and a link. Fill in both, or clear both.';
    }
    if (lower.includes('site_banners_title_check')) return 'Please enter the banner title.';
    if (lower.includes('site_banners_type_check')) return 'Please choose one of the listed banner types.';
    return 'Some of the banner details are not allowed. Please check the fields and try again.';
  }

  // PostgREST's answer when a single-row write matched nothing, which here almost always means
  // another content manager deleted the banner while this drawer was open.
  if (lower.includes('multiple (or no) rows') || lower.includes('0 rows')) return STALE_ROW_MESSAGE;

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'The banner could not be saved right now. Please try again.';
};

const friendlyStorageError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied') || lower.includes('unauthorized')) {
    return 'Only content managers can upload banner artwork.';
  }
  if (lower.includes('exceeded') || lower.includes('too large') || lower.includes('payload')) {
    return 'That image is too large to upload. Please pick a smaller version.';
  }
  // The bucket's own allowed-MIME list, refused before any policy is consulted. assertBannerImage
  // catches this first, so reaching it means the list changed underneath us — say which rule bit.
  if (lower.includes('mime type') || lower.includes('not supported')) {
    return 'That file type is not accepted by the image store. Please upload a PNG, JPG or WebP image.';
  }
  return 'That image could not be uploaded right now. Please try again.';
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function assertBannerImage(file: File): void {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(`"${file.name}" is not a PNG, JPG or WebP image.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" is larger than 5 MB. Please pick a smaller version.`);
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
  return `${Date.now()}-${base || 'banner'}.${extension}`;
}

/**
 * Best effort by design. Every caller has already done the thing that actually matters to the
 * admin; a bucket that refused the removal must not turn a completed save or delete into an
 * error. An orphaned file costs storage, a half-reported delete costs trust in the screen.
 */
async function sweepStorage(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(BANNERS_BUCKET).remove([path]);
  if (error) console.warn('Banner artwork could not be removed from storage', error);
}

export const bannersService = {
  /** Every banner, drafts included. sort_order leads so the admin's arrangement is what shows. */
  async list(): Promise<AdminBanner[]> {
    const { data, error } = await supabase
      .from('site_banners')
      .select(bannerColumns)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyReadError(error.message));
    return (data ?? []).map((row) => toBanner(row as BannerRow));
  },

  /**
   * Published banners only, filtered here rather than left to the read policy. That policy is
   * `is_published OR can_manage_content()`, so a signed-in content manager browsing the public
   * site would otherwise be shown their own unfinished drafts as though they were live.
   */
  async listPublished(): Promise<AdminBanner[]> {
    const { data, error } = await supabase
      .from('site_banners')
      .select(bannerColumns)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyReadError(error.message));
    return (data ?? []).map((row) => toBanner(row as BannerRow));
  },

  async create(input: BannerSaveInput): Promise<AdminBanner> {
    assertBannerInput(input);

    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('site_banners')
      .insert({ ...toPayload(input), created_by: userData.user?.id ?? null })
      .select(bannerColumns)
      .single();

    if (error) throw new Error(friendlyWriteError(error));
    return toBanner(data as BannerRow);
  },

  async update(id: string, input: BannerSaveInput): Promise<AdminBanner> {
    assertBannerInput(input);

    await refreshAuthSession();
    const { data, error } = await supabase
      .from('site_banners')
      .update(toPayload(input))
      .eq('id', id)
      .select(bannerColumns)
      .single();

    if (error) throw new Error(friendlyWriteError(error));
    return toBanner(data as BannerRow);
  },

  /**
   * The row goes first and the artwork second. A file swept from a row that then survives is a
   * banner rendering a broken image on the public site for good; a row deleted with its file
   * left behind costs nothing but the bytes.
   *
   * Counted, and the count is load-bearing: Postgres applies an RLS USING clause to DELETE by
   * filtering rows rather than raising, so a caller the policy declines removes zero rows and
   * PostgREST answers 204 with no error at all. Unchecked, this would report success and then
   * sweep the artwork out from under a banner that is still in the database. That is reachable
   * without anything strange happening — canManageContent() reads a profile cached at login, so
   * an admin demoted mid-session still passes the client gate while the database says no. A null
   * count means the header was absent and proves nothing, so only an explicit zero is a refusal.
   */
  async remove(id: string): Promise<void> {
    await refreshAuthSession();

    const { data: existing, error: pathError } = await supabase
      .from('site_banners')
      .select('image_path')
      .eq('id', id)
      .maybeSingle();

    // Without this a refused read looks exactly like a banner that never had artwork, and the
    // file is left in the bucket with nothing recording that it was ever meant to go.
    if (pathError) console.warn('Banner artwork path could not be read before delete', pathError);

    const { error, count } = await supabase.from('site_banners').delete({ count: 'exact' }).eq('id', id);

    if (error) throw new Error(friendlyWriteError(error));
    if (count === 0) throw new Error(STALE_ROW_MESSAGE);

    await sweepStorage((existing as { image_path: string | null } | null)?.image_path ?? null);
  },

  async uploadImage(file: File, bannerId: string): Promise<{ url: string; path: string }> {
    assertBannerImage(file);
    await refreshAuthSession();

    const path = `${BANNERS_PREFIX}/${bannerId}/${safeFileName(file)}`;
    const { error } = await supabase.storage
      .from(BANNERS_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) throw new Error(friendlyStorageError(error.message));

    const { data } = supabase.storage.from(BANNERS_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  /**
   * Called after artwork has been replaced or a save was rolled back, both of which can be the
   * first bucket write in a while. The sweep only warns, so an expired token here would orphan
   * the file with nobody the wiser — the refresh is what keeps that from being routine.
   */
  async removeImage(path?: string | null): Promise<void> {
    if (!path) return;

    await refreshAuthSession();
    await sweepStorage(path);
  },
};
