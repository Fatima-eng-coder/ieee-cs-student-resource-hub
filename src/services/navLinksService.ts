import { supabase } from '@/lib/supabase';
import { navLinks as navLinksSeed } from '@/data/navLinks';
import { readCollection, writeCollection } from '@/services/store';
import type { NavLinkItem } from '@/types';

interface NavLinkRow {
  id: string;
  label: string;
  path: string;
  enabled: boolean;
  sort_order: number | null;
}

const COLLECTION_KEY = 'navLinks';
const navColumns = 'id,label,path,enabled,sort_order';

const isMissingTableError = (error: { code?: string; message?: string }) =>
  error.code === '42P01' ||
  error.code === 'PGRST205' ||
  error.message?.toLowerCase().includes('does not exist');

const rowToNavLink = (row: NavLinkRow): NavLinkItem => ({
  id: row.id,
  label: row.label,
  to: row.path,
  enabled: row.enabled,
});

const navLinkToRow = (item: NavLinkItem, index: number) => ({
  id: item.id,
  label: item.label,
  path: item.to,
  enabled: item.enabled,
  sort_order: index,
});

const localLinks = () => readCollection<NavLinkItem>(COLLECTION_KEY, navLinksSeed);

export const navLinksService = {
  async list(): Promise<NavLinkItem[]> {
    const { data, error } = await supabase
      .from('nav_links')
      .select(navColumns)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });

    if (error) {
      if (!isMissingTableError(error)) console.warn('Could not load navbar links', error);
      return localLinks();
    }

    if (!data || data.length === 0) return localLinks();
    return (data as NavLinkRow[]).map(rowToNavLink);
  },

  async saveAll(items: NavLinkItem[]): Promise<void> {
    const { error } = await supabase
      .from('nav_links')
      .upsert(items.map(navLinkToRow), { onConflict: 'id' });

    if (error) {
      if (isMissingTableError(error)) {
        writeCollection(COLLECTION_KEY, items);
        return;
      }
      throw new Error(error.message);
    }

    writeCollection(COLLECTION_KEY, items);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('nav_links').delete().eq('id', id);
    if (error) {
      if (isMissingTableError(error)) return;
      throw new Error(error.message);
    }
  },

  subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;

    const channel = supabase
      .channel(`nav-links-sync-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nav_links' }, callback)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
