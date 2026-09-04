import { supabase } from '@/lib/supabase';
import type { NavLinkItem } from '@/types';

/**
 * Which links the public navbar shows, and in what order.
 *
 * This service used to answer a failed read — and an empty table — with the repo's navLinks
 * seed. Both were wrong, and the empty case was the worse of the two: an admin who switched
 * every link off got the seed navbar back, so the toggles appeared to do nothing and there was
 * no way to work out why. An empty result is an instruction, not a gap.
 *
 * A failed read now throws, and the answer to "what should the navbar show when nobody can say"
 * is: nothing. The navbar is chrome on every page, so an error banner across the top of the
 * site would be out of all proportion to a missing menu — but the seed is a photograph of what
 * this navbar looked like when the file was written, and serving it as though it were current
 * hides the failure behind links that may point at routes that have since moved and may include
 * links the society deliberately took down. With no links at all the site still works: the logo
 * goes home, the search icon goes to /search, and the account controls beside them are rendered
 * by the header itself. The one person who can fix it — a content manager on the admin Navbar
 * page — gets the failure in words there.
 */

interface NavLinkRow {
  id: string;
  label: string;
  path: string;
  enabled: boolean;
  sort_order: number | null;
}

const navLinkColumns = 'id,label,path,enabled,sort_order';

const toNavLink = (row: NavLinkRow): NavLinkItem => ({
  id: row.id,
  label: row.label,
  to: row.path,
  enabled: row.enabled,
});

/** "to" is the front end's name for the column the row calls "path". */
const toPayload = (item: NavLinkItem, index: number) => ({
  id: item.id,
  label: item.label,
  path: item.to,
  enabled: item.enabled,
  sort_order: index,
});

const friendlyReadError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('does not exist') || lower.includes('schema cache')) {
    return 'The navbar links are not ready yet. Please check the nav_links table and Data API settings.';
  }
  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'The navbar links could not be loaded because access to them is currently restricted.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'The navbar links could not be loaded right now. Please try again later.';
};

const friendlyWriteError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Only content managers can change the navbar.';
  }
  if (lower.includes('null value') || lower.includes('not-null')) {
    return 'Every navbar link needs both a label and a path.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'The navbar could not be saved right now. Please try again.';
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

export const navLinksService = {
  /**
   * sort_order decides the run of links; label only breaks a tie between two rows holding the
   * same number, so the order a visitor sees is never left to whatever order Postgres returned.
   */
  async list(): Promise<NavLinkItem[]> {
    const { data, error } = await supabase
      .from('nav_links')
      .select(navLinkColumns)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });

    if (error) throw new Error(friendlyReadError(error.message));
    return ((data ?? []) as NavLinkRow[]).map(toNavLink);
  },

  /**
   * Saves a navbar edit as one upsert of only the rows it actually changed.
   *
   * This used to write all twelve rows on every edit, and that is how three links came to be
   * switched off with nobody admitting to it. sort_order is a link's position in the array the
   * admin page is holding, so the page has an opinion about every row, not just the one being
   * touched -- and an upsert of all twelve states that opinion as fact. A tab left open while
   * somebody else edited the navbar would, on its owner's very next toggle, quietly restore its
   * own hours-old view of the other eleven. Last writer wins, for rows that writer never touched.
   *
   * `baseline` is the last state this client knows the server held. Anything matching it is
   * left alone, so a toggle writes one row and a reorder writes the two that swapped. Two admins
   * can now work on different links at the same time without either undoing the other.
   *
   * Still one statement, for the reason it always was: a partial failure would leave the order
   * the admin sees and the order the site serves disagreeing about where the links go.
   */
  async save(items: NavLinkItem[], baseline: NavLinkItem[]): Promise<void> {
    const before = new Map(baseline.map((item, index) => [item.id, JSON.stringify(toPayload(item, index))]));
    const changed = items
      .map((item, index) => toPayload(item, index))
      .filter((row) => before.get(row.id) !== JSON.stringify(row));

    // Nothing moved. Worth the early return: the debounce fires on the trailing edge, so a
    // toggle flipped and flipped back inside it arrives here as a no-op.
    if (changed.length === 0) return;

    await refreshAuthSession();

    const { error } = await supabase.from('nav_links').upsert(changed, { onConflict: 'id' });

    if (error) throw new Error(friendlyWriteError(error.message));
  },

  /**
   * `authenticated` holds the DELETE grant on nav_links outright; what separates a content
   * manager from anyone else is the row-level policy, and Postgres applies that to a DELETE by
   * filtering the row out rather than by raising — PostgREST then answers 204 and this method
   * would report success for a link that is still in the navbar. A null count is the header
   * being absent and proves nothing, so only an explicit zero is read as a refusal.
   */
  async remove(id: string): Promise<void> {
    await refreshAuthSession();

    const { error, count } = await supabase.from('nav_links').delete({ count: 'exact' }).eq('id', id);

    if (error) throw new Error(friendlyWriteError(error.message));
    if (count === 0) {
      throw new Error(
        'That link was not removed. It may already be gone, or your account may no longer be allowed to manage the navbar.'
      );
    }
  },

  /**
   * saveAll is one statement but one event per row it wrote, and a reorder writes every row.
   * Called straight through, a single nudge would ask the server for the whole navbar eight
   * times over — eight chances for a read to land on a listener mid-edit. Collapsing the burst
   * also lets the events from one save arrive together rather than interleaved with the write
   * that produced them.
   */
  subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;

    let timeout: number | null = null;
    const scheduleCallback = () => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(callback, 150);
    };

    const channel = supabase
      .channel(`nav-links-sync-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nav_links' }, scheduleCallback)
      .subscribe();

    return () => {
      if (timeout) window.clearTimeout(timeout);
      void supabase.removeChannel(channel);
    };
  },
};
