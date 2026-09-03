import { supabase } from '@/lib/supabase';
import { footerColumns } from '@/data/footerLinks';
import type { FAQ, FooterColumn, FooterLinkItem, QuickLink } from '@/types';

/**
 * The FAQ list, the quick links directory and the footer links.
 *
 * The three have nothing to do with each other except their shape: each is an ordered list an
 * admin nudges up and down. That shape is exactly what they share here — one ordering scheme,
 * one reorder write, one set of words for a refused edit — instead of three copies of it
 * spread across three files.
 */

/**
 * Gap between neighbouring sort_order values. Reordering never spends it, because a nudge
 * swaps two values that already exist, but it leaves room for a later "insert between these
 * two" that would otherwise have to renumber every row below the insertion point.
 */
const ORDER_STEP = 10;

const faqColumns = 'id,question,answer,category,sort_order';
const quickLinkColumns = 'id,label,url,category,icon,sort_order';
const footerLinkColumns = 'id,label,path,footer_column,enabled,sort_order';
const socialLinkColumns = 'id,platform,url,label,is_published,sort_order';

/** Everything a reorder has to send back untouched — see writeOrder for why it sends it at all. */
const faqContentColumns = 'id,question,answer,category';
const quickLinkContentColumns = 'id,label,url,category,icon';
const footerLinkContentColumns = 'id,label,path,footer_column,enabled';
const socialLinkContentColumns = 'id,platform,url,label,is_published';

/** sort_order is the admin's business, not the public site's, so only these carry it. */
export interface AdminFaq extends FAQ {
  sortOrder: number;
}

export interface AdminQuickLink extends QuickLink {
  sortOrder: number;
}

export interface AdminFooterLink extends FooterLinkItem {
  sortOrder: number;
}

export type FaqInput = Omit<AdminFaq, 'id' | 'sortOrder'>;
export type QuickLinkInput = Omit<AdminQuickLink, 'id' | 'sortOrder'>;
export type FooterLinkInput = Omit<AdminFooterLink, 'id' | 'sortOrder'>;

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number | null;
}

interface QuickLinkRow {
  id: string;
  label: string;
  url: string;
  category: string;
  icon: string | null;
  sort_order: number | null;
}

interface FooterLinkRow {
  id: string;
  label: string;
  path: string;
  footer_column: string;
  enabled: boolean;
  sort_order: number | null;
}

const faqCategories: FAQ['category'][] = [
  'IEEE CS',
  'Past Papers',
  'Courses',
  'Events',
  'Navigation',
  'Projects Expo',
  'Contributions',
  'Technical Issues',
];

const quickLinkCategories: QuickLink['category'][] = [
  'University Portals',
  'Academic Resources',
  'Society Links',
  'Forms',
  'Event Links',
  'Past Paper Links',
  'Student Help',
];

/**
 * faqs_category_check already confines the column to this list, so the fallback should never
 * fire. It is here for the day the CHECK is widened ahead of the front end: both public pages
 * build their category headings from the union, and a value they have never heard of would
 * leave the entry unreachable under every heading rather than merely filed under a wrong one.
 */
const toFaqCategory = (value: string): FAQ['category'] =>
  faqCategories.includes(value as FAQ['category']) ? (value as FAQ['category']) : 'IEEE CS';

const toQuickLinkCategory = (value: string): QuickLink['category'] =>
  quickLinkCategories.includes(value as QuickLink['category'])
    ? (value as QuickLink['category'])
    : 'Student Help';

const toFooterColumn = (value: string): FooterColumn =>
  footerColumns.includes(value as FooterColumn) ? (value as FooterColumn) : 'Explore';

const toFaq = (row: FaqRow): AdminFaq => ({
  id: row.id,
  question: row.question,
  answer: row.answer,
  category: toFaqCategory(row.category),
  sortOrder: row.sort_order ?? 0,
});

const toFaqPayload = (input: FaqInput) => ({
  question: input.question.trim(),
  answer: input.answer.trim(),
  category: input.category,
});

const toQuickLink = (row: QuickLinkRow): AdminQuickLink => ({
  id: row.id,
  label: row.label,
  url: row.url,
  category: toQuickLinkCategory(row.category),
  icon: row.icon ?? undefined,
  sortOrder: row.sort_order ?? 0,
});

/** An empty icon becomes NULL so "cleared" and "never set" are the same thing in the row. */
const toQuickLinkPayload = (input: QuickLinkInput) => ({
  label: input.label.trim(),
  url: input.url.trim(),
  category: input.category,
  icon: input.icon?.trim() || null,
});

const toFooterLink = (row: FooterLinkRow): AdminFooterLink => ({
  id: row.id,
  label: row.label,
  to: row.path,
  column: toFooterColumn(row.footer_column),
  enabled: row.enabled,
  sortOrder: row.sort_order ?? 0,
});

/** "to" and "column" are the front end's names; the row's are "path" and "footer_column". */
const toFooterLinkPayload = (input: FooterLinkInput) => ({
  label: input.label.trim(),
  path: input.to.trim(),
  footer_column: input.column,
  enabled: Boolean(input.enabled),
});

/** Everything the database would refuse, said in the admin's own words first. */
function assertFaq(input: FaqInput): void {
  if (!input.question.trim()) throw new Error('Please enter the question.');
  if (!input.answer.trim()) throw new Error('Please enter the answer.');
}

function assertQuickLink(input: QuickLinkInput): void {
  if (!input.label.trim()) throw new Error('Please enter the link label.');
  if (!input.url.trim()) throw new Error('Please enter the link URL.');
}

function assertFooterLink(input: FooterLinkInput): void {
  if (!input.label.trim()) throw new Error('Please enter the link label.');
  if (!input.to.trim()) throw new Error('Please enter the path the link points to.');
}

/**
 * PostgREST answers a policy denial with "permission denied for table faqs", which reads to an
 * admin as a broken page rather than as a boundary someone else is allowed to cross.
 */
/**
 * All three list() calls feed public pages, so their failures end up in front of students.
 * PostgREST's own words — "permission denied for table faqs", a schema-cache miss — read as a
 * broken site rather than as something the team needs to hear, and they name internals to
 * anyone who can open a browser.
 */
function toFriendlyReadError(error: { code?: string; message?: string }, noun: string): Error {
  const lower = (error.message ?? '').toLowerCase();

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('load failed')) {
    return new Error(`We could not reach the server, so ${noun} could not be loaded.`);
  }
  return new Error(`${noun[0].toUpperCase()}${noun.slice(1)} could not be loaded right now. Please try again shortly.`);
}

function toFriendlyError(error: { code?: string; message?: string }, action: string): Error {
  if (error.code === '42501') return new Error(`Only content managers can ${action}.`);
  return new Error(error.message || `Could not ${action}.`);
}

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

/**
 * The sort_order values a group holds once its rows have been rearranged: the values it
 * already has, dealt back out along the new arrangement. Because the multiset of values never
 * changes, a nudge rewrites exactly the two rows that traded places however long the list is,
 * and the values can never drift into a collision.
 *
 * Values that are not strictly increasing are thrown away for a fresh gapped run instead. Two
 * rows sharing a number is the one state in which the displayed order comes down to whatever
 * order Postgres felt like returning them in, and dealing a duplicate straight back out would
 * make the nudge look like it did nothing. The repair costs a write per row in the group and
 * happens once, not on every nudge.
 */
function dealSortOrders<T extends { sortOrder: number }>(arranged: T[]): T[] {
  const values = arranged.map((item) => item.sortOrder).sort((a, b) => a - b);
  const strictlyIncreasing = values.every((value, index) => index === 0 || value > values[index - 1]);

  return arranged.map((item, index) => ({
    ...item,
    sortOrder: strictlyIncreasing ? values[index] : (index + 1) * ORDER_STEP,
  }));
}

/** Swaps one item with its neighbour. Null when it is already at the end it is pushed towards. */
function nudge<T extends { id: string; sortOrder: number }>(
  group: T[],
  id: string,
  direction: -1 | 1
): T[] | null {
  const from = group.findIndex((item) => item.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= group.length) return null;

  const arranged = [...group];
  [arranged[from], arranged[to]] = [arranged[to], arranged[from]];
  return dealSortOrders(arranged);
}

/** The rows a reorder actually has to write: the ones whose sort_order moved. */
function movedRows<T extends { id: string; sortOrder: number }>(before: T[], after: T[]): T[] {
  const previous = new Map(before.map((item) => [item.id, item.sortOrder]));
  return after.filter((item) => previous.get(item.id) !== item.sortOrder);
}

/**
 * Persists a reorder as a single upsert, which PostgREST sends as one INSERT ... ON CONFLICT
 * statement: either every moved row lands or none does. Issued as one UPDATE per row instead,
 * a swap that failed halfway would leave both rows holding the same sort_order — the exact
 * state this scheme exists to keep out of the table.
 *
 * That statement's INSERT arm is checked against the NOT NULL columns before the conflict is
 * ever detected, so a bare {id, sort_order} payload is rejected before it can resolve to an
 * update: each row has to be sent whole. Its content half is therefore re-read here rather
 * than taken from the copy the admin page loaded, which may be minutes old — PostgREST writes
 * DO UPDATE SET for every column it is handed, so a stale payload would quietly put back
 * whatever someone else edited in the meantime. The admin pressed "move down", not "save".
 */
async function writeOrder(
  table: string,
  contentColumns: string,
  moved: { id: string; sortOrder: number }[],
  action: string
): Promise<void> {
  if (moved.length === 0) return;

  const order = new Map(moved.map((row) => [row.id, row.sortOrder]));
  const { data, error } = await supabase.from(table).select(contentColumns).in('id', [...order.keys()]);
  if (error) throw toFriendlyError(error, action);

  // The column list is a parameter rather than a literal, so supabase-js cannot infer the row
  // shape here and hands back its "unparsed string" placeholder type instead.
  const current = (data ?? []) as unknown as Record<string, unknown>[];

  // A row deleted from another session since the page loaded simply drops out of this read.
  // The sort_order it was holding goes with it, so the row that was taking its place is still
  // the only one left holding that value and there is nothing to repair.
  const rows = current.map((row) => ({ ...row, sort_order: order.get(row.id as string) }));
  if (rows.length === 0) return;

  await refreshAuthSession();
  const { error: writeError } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (writeError) throw toFriendlyError(writeError, action);
}

/**
 * Where a new row goes: after everything already in its group. Read separately rather than
 * derived from the list the admin page is holding, so a row added from another session since
 * that page loaded still gets a value beyond it.
 */
async function nextSortOrder(
  table: string,
  action: string,
  group?: { column: string; value: string }
): Promise<number> {
  const all = supabase.from(table).select('sort_order');
  const scoped = group ? all.eq(group.column, group.value) : all;

  const { data, error } = await scoped.order('sort_order', { ascending: false }).limit(1).maybeSingle();
  if (error) throw toFriendlyError(error, action);
  return ((data as { sort_order: number | null } | null)?.sort_order ?? 0) + ORDER_STEP;
}

export const faqsService = {
  /**
   * One order for the whole collection, not one per category: the public page's "All" tab
   * shows every entry in a single list, and a per-category order would have nothing to say
   * about how two entries from different categories sit relative to each other there.
   *
   * created_at and id break any tie sort_order leaves, so the list a visitor sees is never
   * decided by the order the database happened to return rows in.
   */
  async list(): Promise<AdminFaq[]> {
    const { data, error } = await supabase
      .from('faqs')
      .select(faqColumns)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw toFriendlyReadError(error, 'the questions');
    return (data ?? []).map((row) => toFaq(row as FaqRow));
  },

  async create(input: FaqInput): Promise<AdminFaq> {
    assertFaq(input);
    await refreshAuthSession();

    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('faqs')
      .insert({
        ...toFaqPayload(input),
        sort_order: await nextSortOrder('faqs', 'add an FAQ'),
        created_by: userData.user?.id ?? null,
      })
      .select(faqColumns)
      .single();

    if (error) throw toFriendlyError(error, 'add an FAQ');
    return toFaq(data as FaqRow);
  },

  async update(id: string, input: FaqInput): Promise<AdminFaq> {
    assertFaq(input);
    await refreshAuthSession();

    const { data, error } = await supabase
      .from('faqs')
      .update(toFaqPayload(input))
      .eq('id', id)
      .select(faqColumns)
      .single();

    if (error) throw toFriendlyError(error, 'edit the FAQ list');
    return toFaq(data as FaqRow);
  },

  async remove(id: string): Promise<void> {
    await refreshAuthSession();
    /*
     * Counted. An RLS-refused DELETE is not an error — Postgres filters the row out and
     * PostgREST answers 204 — so an uncounted delete reports success for a row still sitting
     * in the table, and the page removes it from the list on that word alone. Only an explicit
     * zero is a refusal; a null count means the header was absent and proves nothing.
     */
    const { error, count } = await supabase
      .from('faqs')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) throw toFriendlyError(error, 'delete an FAQ');
    if (count === 0) {
      throw new Error('That item was not removed. It may already be gone, or you may not have permission.');
    }
  },

  /** Returns the list in its new order; unchanged when the entry is already at that end. */
  async move(faqs: AdminFaq[], id: string, direction: -1 | 1): Promise<AdminFaq[]> {
    const arranged = nudge(faqs, id, direction);
    if (!arranged) return faqs;

    await writeOrder('faqs', faqContentColumns, movedRows(faqs, arranged), 'reorder the FAQ list');

    return arranged;
  },
};

const quickLinkCategoryIndex = (category: QuickLink['category']) => quickLinkCategories.indexOf(category);

const byQuickLinkOrder = (a: AdminQuickLink, b: AdminQuickLink) =>
  quickLinkCategoryIndex(a.category) - quickLinkCategoryIndex(b.category) || a.sortOrder - b.sortOrder;

/**
 * The arrangement a fresh read returns, so the admin page can place a link it just created or
 * re-filed without re-reading everything. Stable, so two links sharing a sort_order keep the
 * created_at/id order the database put them in.
 */
export const sortQuickLinks = (links: AdminQuickLink[]): AdminQuickLink[] => [...links].sort(byQuickLinkOrder);

export const quickLinksService = {
  /**
   * Ordered within each category, not across all of them: the public page renders one card per
   * category, so a card is the only place two quick links are ever seen next to each other and
   * a number saying where one sits relative to a link in another card would describe nothing.
   * The categories themselves are not ordered by the database — both pages lay them out from
   * quickLinkCategories.
   */
  async list(): Promise<AdminQuickLink[]> {
    const { data, error } = await supabase
      .from('quick_links')
      .select(quickLinkColumns)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw toFriendlyReadError(error, 'the quick links');
    return sortQuickLinks((data ?? []).map((row) => toQuickLink(row as QuickLinkRow)));
  },

  async create(input: QuickLinkInput): Promise<AdminQuickLink> {
    assertQuickLink(input);
    await refreshAuthSession();

    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('quick_links')
      .insert({
        ...toQuickLinkPayload(input),
        sort_order: await nextSortOrder('quick_links', 'add a quick link', {
          column: 'category',
          value: input.category,
        }),
        created_by: userData.user?.id ?? null,
      })
      .select(quickLinkColumns)
      .single();

    if (error) throw toFriendlyError(error, 'add a quick link');
    return toQuickLink(data as QuickLinkRow);
  },

  async update(id: string, input: QuickLinkInput): Promise<AdminQuickLink> {
    assertQuickLink(input);
    await refreshAuthSession();

    const { data, error } = await supabase
      .from('quick_links')
      .update(toQuickLinkPayload(input))
      .eq('id', id)
      .select(quickLinkColumns)
      .single();

    if (error) throw toFriendlyError(error, 'edit quick links');
    return toQuickLink(data as QuickLinkRow);
  },

  async remove(id: string): Promise<void> {
    await refreshAuthSession();
    /*
     * Counted. An RLS-refused DELETE is not an error — Postgres filters the row out and
     * PostgREST answers 204 — so an uncounted delete reports success for a row still sitting
     * in the table, and the page removes it from the list on that word alone. Only an explicit
     * zero is a refusal; a null count means the header was absent and proves nothing.
     */
    const { error, count } = await supabase
      .from('quick_links')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) throw toFriendlyError(error, 'delete a quick link');
    if (count === 0) {
      throw new Error('That item was not removed. It may already be gone, or you may not have permission.');
    }
  },

  /**
   * Nudges a link past its neighbour in its own category. The returned list is re-sorted so its
   * array order still matches what a fresh read would give, which is what the page renders.
   */
  async move(links: AdminQuickLink[], id: string, direction: -1 | 1): Promise<AdminQuickLink[]> {
    const link = links.find((item) => item.id === id);
    if (!link) return links;

    const category = links.filter((item) => item.category === link.category);
    const arranged = nudge(category, id, direction);
    if (!arranged) return links;

    await writeOrder(
      'quick_links',
      quickLinkContentColumns,
      movedRows(category, arranged),
      'reorder quick links'
    );

    const reordered = new Map(arranged.map((item) => [item.id, item]));
    return sortQuickLinks(links.map((item) => reordered.get(item.id) ?? item));
  },
};

const footerColumnIndex = (column: FooterColumn) => footerColumns.indexOf(column);

const byFooterOrder = (a: AdminFooterLink, b: AdminFooterLink) =>
  footerColumnIndex(a.column) - footerColumnIndex(b.column) || a.sortOrder - b.sortOrder;

/**
 * The arrangement a fresh read returns. The admin page holds its links in an array and has to
 * put a newly created one in the right place without re-reading the whole list.
 */
export const sortFooterLinks = (links: AdminFooterLink[]): AdminFooterLink[] => [...links].sort(byFooterOrder);

export const footerLinksService = {
  /**
   * Ordered within each column, because a footer column is the only place two of these links
   * are ever seen next to each other. Columns themselves are not ordered by the database: the
   * footer and its admin preview both lay them out from the footerColumns constant.
   */
  async list(): Promise<AdminFooterLink[]> {
    const { data, error } = await supabase
      .from('footer_links')
      .select(footerLinkColumns)
      .order('footer_column', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw toFriendlyReadError(error, 'the footer links');
    return (data ?? []).map((row) => toFooterLink(row as FooterLinkRow));
  },

  /**
   * public.footer_links keys on a text id the application chooses — the seeded rows carry the
   * front end's own fl-* constants — so a new link needs one minted here rather than handed
   * over by a column default.
   */
  async create(input: FooterLinkInput): Promise<AdminFooterLink> {
    assertFooterLink(input);
    await refreshAuthSession();

    const { data, error } = await supabase
      .from('footer_links')
      .insert({
        id: `fl-${crypto.randomUUID()}`,
        ...toFooterLinkPayload(input),
        sort_order: await nextSortOrder('footer_links', 'add a footer link', {
          column: 'footer_column',
          value: input.column,
        }),
      })
      .select(footerLinkColumns)
      .single();

    if (error) throw toFriendlyError(error, 'add a footer link');
    return toFooterLink(data as FooterLinkRow);
  },

  async update(id: string, input: FooterLinkInput): Promise<AdminFooterLink> {
    assertFooterLink(input);
    await refreshAuthSession();

    const { data, error } = await supabase
      .from('footer_links')
      .update(toFooterLinkPayload(input))
      .eq('id', id)
      .select(footerLinkColumns)
      .single();

    if (error) throw toFriendlyError(error, 'edit footer links');
    return toFooterLink(data as FooterLinkRow);
  },

  async remove(id: string): Promise<void> {
    await refreshAuthSession();
    /*
     * Counted. An RLS-refused DELETE is not an error — Postgres filters the row out and
     * PostgREST answers 204 — so an uncounted delete reports success for a row still sitting
     * in the table, and the page removes it from the list on that word alone. Only an explicit
     * zero is a refusal; a null count means the header was absent and proves nothing.
     */
    const { error, count } = await supabase
      .from('footer_links')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) throw toFriendlyError(error, 'delete a footer link');
    if (count === 0) {
      throw new Error('That item was not removed. It may already be gone, or you may not have permission.');
    }
  },

  /**
   * Nudges a link past its neighbour in its own column. The returned list is re-sorted so its
   * array order still matches what a fresh read would give, which is what the page renders.
   */
  async move(links: AdminFooterLink[], id: string, direction: -1 | 1): Promise<AdminFooterLink[]> {
    const link = links.find((item) => item.id === id);
    if (!link) return links;

    const column = links.filter((item) => item.column === link.column);
    const arranged = nudge(column, id, direction);
    if (!arranged) return links;

    await writeOrder(
      'footer_links',
      footerLinkContentColumns,
      movedRows(column, arranged),
      'reorder the footer'
    );

    const reordered = new Map(arranged.map((item) => [item.id, item]));
    return sortFooterLinks(links.map((item) => reordered.get(item.id) ?? item));
  },
};


// ---------------------------------------------------------------------------------------
// The chapter's own social accounts
// ---------------------------------------------------------------------------------------
//
// The footer's social icons pointed at https://instagram.com and https://linkedin.com -- the
// platforms' front pages, not this chapter's profiles. Nobody could correct that without a
// deploy, so it sat wrong. These rows are what the footer reads now.

/** The platforms the table's CHECK accepts. Keep in step with social_links_platform_check. */
export const SOCIAL_PLATFORMS = [
  'instagram',
  'linkedin',
  'facebook',
  'x',
  'youtube',
  'github',
  'website',
  'email',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface SocialLink {
  id: string;
  platform: SocialPlatform;
  url: string;
  /** Empty means "use the platform's own name" — the accessible label falls back to it. */
  label: string;
  isPublished: boolean;
  sortOrder: number;
}

export type SocialLinkInput = Omit<SocialLink, 'id' | 'sortOrder'>;

interface SocialLinkRow {
  id: string;
  platform: string;
  url: string;
  label: string | null;
  is_published: boolean;
  sort_order: number | null;
}

const toSocialLink = (row: SocialLinkRow): SocialLink => ({
  id: row.id,
  platform: row.platform as SocialPlatform,
  url: row.url,
  label: row.label ?? '',
  isPublished: row.is_published,
  sortOrder: row.sort_order ?? 0,
});

const toSocialLinkPayload = (input: SocialLinkInput) => ({
  platform: input.platform,
  url: input.url.trim(),
  label: input.label.trim(),
  is_published: input.isPublished,
});

function assertSocialLink(input: SocialLinkInput): void {
  if (!input.url.trim()) throw new Error('Please enter the profile URL.');
  if (input.url.trim().length > 500) throw new Error('That URL is too long. Please shorten it.');
  if (!(SOCIAL_PLATFORMS as readonly string[]).includes(input.platform)) {
    throw new Error('Please choose a platform from the list.');
  }
}

/**
 * 23505 here means the platform is already taken, and the table is deliberately built that way:
 * two Instagram rows is a mistake every time, and the footer has no way to say which is real.
 * Named precisely, because "Could not add a social link" gives an admin nothing to do about it.
 */
function toSocialLinkWriteError(error: { code?: string; message?: string }, action: string): Error {
  if (error.code === '23505') {
    return new Error('There is already a link for that platform. Edit the existing one instead.');
  }
  if (error.code === '23514') {
    return new Error('That link was rejected. Check the URL is filled in and under 500 characters.');
  }
  return toFriendlyError(error, action);
}

export const socialLinksService = {
  /** The published ones, in order — what the footer draws. */
  async listPublished(): Promise<SocialLink[]> {
    const { data, error } = await supabase
      .from('social_links')
      .select(socialLinkColumns)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('platform', { ascending: true });

    if (error) throw toFriendlyReadError(error, 'the social links');
    return (data ?? []).map((row) => toSocialLink(row as SocialLinkRow));
  },

  /**
   * Every row, published or not. The read policy only exposes published rows, so an admin
   * calling this without a content-manager session gets a short list rather than an error --
   * which is why the admin page gates on the role rather than on this failing.
   */
  async list(): Promise<SocialLink[]> {
    const { data, error } = await supabase
      .from('social_links')
      .select(socialLinkColumns)
      .order('sort_order', { ascending: true })
      .order('platform', { ascending: true });

    if (error) throw toFriendlyReadError(error, 'the social links');
    return (data ?? []).map((row) => toSocialLink(row as SocialLinkRow));
  },

  async create(input: SocialLinkInput): Promise<SocialLink> {
    assertSocialLink(input);
    await refreshAuthSession();

    const { data, error } = await supabase
      .from('social_links')
      .insert({
        ...toSocialLinkPayload(input),
        sort_order: await nextSortOrder('social_links', 'add a social link'),
      })
      .select(socialLinkColumns)
      .single();

    if (error) throw toSocialLinkWriteError(error, 'add a social link');
    return toSocialLink(data as SocialLinkRow);
  },

  async update(id: string, input: SocialLinkInput): Promise<SocialLink> {
    assertSocialLink(input);
    await refreshAuthSession();

    const { data, error } = await supabase
      .from('social_links')
      .update(toSocialLinkPayload(input))
      .eq('id', id)
      .select(socialLinkColumns)
      .single();

    if (error) throw toSocialLinkWriteError(error, 'edit social links');
    return toSocialLink(data as SocialLinkRow);
  },

  /** Counted, for the same reason every other delete here is — see footerLinksService.remove. */
  async remove(id: string): Promise<void> {
    await refreshAuthSession();

    const { error, count } = await supabase
      .from('social_links')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw toFriendlyError(error, 'delete a social link');
    if (count === 0) {
      throw new Error('That link was not removed. It may already be gone, or you may not have permission.');
    }
  },

  async move(links: SocialLink[], id: string, direction: -1 | 1): Promise<SocialLink[]> {
    const arranged = nudge(links, id, direction);
    if (!arranged) return links;

    await writeOrder(
      'social_links',
      socialLinkContentColumns,
      movedRows(links, arranged),
      'reorder the social links'
    );
    return arranged;
  },
};
