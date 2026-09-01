import { useCallback, useEffect, useRef, useState } from 'react';
import { navLinksService } from '@/services/navLinksService';
import type { NavLinkItem } from '@/types';

const navLinksAreEqual = (a: NavLinkItem[], b: NavLinkItem[]) =>
  a.length === b.length &&
  a.every((item, index) => {
    const other = b[index];
    return other && item.id === other.id && item.label === other.label && item.to === other.to && item.enabled === other.enabled;
  });

/**
 * The navbar, read from the database.
 *
 * It used to start from the repo's navLinks seed, which made a failed read indistinguishable
 * from a healthy one: the site painted the seed navbar and looked entirely fine while serving
 * links nobody had approved. Worse on the admin side — the editor rendered that same seed, and
 * the first toggle saved it, writing the repo's defaults over whatever was really stored.
 *
 * So it starts empty and only ever holds what was actually read. `loaded` is the guard: until a
 * read has succeeded there is nothing to edit, and every write path refuses, because a save
 * built on data this hook never read is a save that destroys data.
 */
export function useNavLinks() {
  const [items, setItems] = useState<NavLinkItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingItems = useRef<NavLinkItem[] | null>(null);

  const applyItems = useCallback((next: NavLinkItem[]) => {
    setItems((current) => (navLinksAreEqual(current, next) ? current : next));
  }, []);

  const load = useCallback(async () => {
    try {
      applyItems(await navLinksService.list());
      loadedRef.current = true;
      setLoaded(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load navbar links.');
    }
  }, [applyItems]);

  const scheduleSave = useCallback((next: NavLinkItem[]) => {
    // Read as a ref, not as state: a stale closure here would be the difference between
    // refusing a destructive save and performing one.
    if (!loadedRef.current) {
      setError('The navbar could not be read, so it cannot be saved. Reload before editing.');
      return;
    }
    pendingItems.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      pendingItems.current = null;
      void navLinksService.saveAll(next).then(
        () => setError(null),
        (err) => setError(err instanceof Error ? err.message : 'Failed to save navbar links.')
      );
    }, 350);
  }, []);

  const persist = useCallback((next: NavLinkItem[]) => {
    setItems(next);
    scheduleSave(next);
  }, [scheduleSave]);

  const add = useCallback((item: NavLinkItem) => {
    setItems((current) => {
      const next = [item, ...current];
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const update = useCallback(
    (id: string, patch: Partial<NavLinkItem>) => {
      setItems((current) => {
        const next = current.map((item) => (item.id === id ? { ...item, ...patch } : item));
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const remove = useCallback((id: string) => {
    if (!loadedRef.current) {
      setError('The navbar could not be read, so it cannot be edited. Reload before editing.');
      return;
    }
    setItems((current) => {
      const next = current.filter((item) => item.id !== id);
      scheduleSave(next);
      void navLinksService.remove(id).catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to remove navbar link.');
      });
      return next;
    });
  }, [scheduleSave]);

  useEffect(() => {
    void load();
    const unsubscribeRealtime = navLinksService.subscribe(() => void load());
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      // Flush an edit the debounce had not fired yet. Guarded for the same reason as above.
      if (pendingItems.current && loadedRef.current) {
        void navLinksService.saveAll(pendingItems.current);
      }
      pendingItems.current = null;
      unsubscribeRealtime();
    };
  }, [load]);

  return { items, loaded, error, add, update, remove, setAll: persist, reload: load };
}
