import { useCallback, useEffect, useRef, useState } from 'react';
import { navLinks as navLinksSeed } from '@/data/navLinks';
import { navLinksService } from '@/services/navLinksService';
import type { NavLinkItem } from '@/types';

const navLinksAreEqual = (a: NavLinkItem[], b: NavLinkItem[]) =>
  a.length === b.length &&
  a.every((item, index) => {
    const other = b[index];
    return other && item.id === other.id && item.label === other.label && item.to === other.to && item.enabled === other.enabled;
  });

export function useNavLinks() {
  const [items, setItems] = useState<NavLinkItem[]>(navLinksSeed);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingItems = useRef<NavLinkItem[] | null>(null);

  const applyItems = useCallback((next: NavLinkItem[]) => {
    setItems((current) => (navLinksAreEqual(current, next) ? current : next));
  }, []);

  const load = useCallback(async () => {
    try {
      applyItems(await navLinksService.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load navbar links.');
    }
  }, [applyItems]);

  const scheduleSave = useCallback((next: NavLinkItem[]) => {
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
      if (pendingItems.current) {
        void navLinksService.saveAll(pendingItems.current);
        pendingItems.current = null;
      }
      unsubscribeRealtime();
    };
  }, [load]);

  return { items, error, add, update, remove, setAll: persist, reload: load };
}
