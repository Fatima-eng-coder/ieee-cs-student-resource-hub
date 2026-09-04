import { useCallback, useEffect, useRef, useState } from 'react';
import { navLinksService } from '@/services/navLinksService';
import type { NavLinkItem } from '@/types';

/** How long a burst of toggles is collected before it becomes one whole-navbar upsert. */
const SAVE_DEBOUNCE_MS = 350;

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
 *
 * The other half of the problem is time. Editing is optimistic and debounced, so for a few
 * hundred milliseconds this page knows something the database does not; realtime meanwhile
 * re-reads on every change to the table, including the echo of this client's own write. A read
 * that started before the current state was reached is a photograph of a navbar that has since
 * moved on, and painting it is what made the toggles appear to flip themselves back. So a read
 * result is applied only when this client has nothing outstanding and nothing has changed under
 * it since the read began; otherwise it is dropped and re-asked for once the writes settle,
 * which is also how another admin's change arrives here.
 */
/**
 * @param live  Subscribe to cross-admin changes over realtime. Off by default, and that default
 *   is the important part: this hook backs the Header, so it runs on every page for every
 *   visitor, and subscribing there held an open WebSocket per anonymous reader. Concurrent
 *   realtime connections are the scarcest resource in this deployment — a few hundred, against
 *   request throughput an order of magnitude higher — so spending one per reader so a navbar
 *   edit lands a few seconds sooner is the worst trade available. The public navbar reads once
 *   and refreshes when the tab is focused; the admin editor passes `true`, where seeing another
 *   admin's change arrive is worth something and the client count is small.
 */
export function useNavLinks(live = false) {
  const [items, setItems] = useState<NavLinkItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  /**
   * `items` mirrored, because every edit is composed from the current list and React only
   * hands that to a state updater — and a state updater is no place to start a network write.
   * React re-runs updaters (StrictMode does it on every render in development), so the delete
   * that used to live inside one was issued twice, and the second call found the row already
   * gone and reported the successful delete as a failure.
   */
  const itemsRef = useRef<NavLinkItem[]>([]);

  /**
   * The last list this client knows the server held, which is what every save is diffed
   * against. Distinct from `itemsRef`: that one carries the optimistic edit the admin can
   * already see, and diffing against it would find nothing to write.
   */
  const serverRef = useRef<NavLinkItem[]>([]);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingItems = useRef<NavLinkItem[] | null>(null);
  const writesInFlight = useRef(0);

  /**
   * Bumped by every local edit and by every write that finishes. A read that began at an
   * earlier value cannot describe the navbar this client is now looking at, whichever of the
   * two the server answered from.
   */
  const revision = useRef(0);

  /** A read whose answer was dropped. One is taken as soon as there is nothing outstanding. */
  const refreshQueued = useRef(false);

  const hasOutstandingWrite = () =>
    saveTimer.current !== null || pendingItems.current !== null || writesInFlight.current > 0;

  const applyItems = useCallback((next: NavLinkItem[]) => {
    // Recorded before the equality bail-out: a read that matches what is on screen still tells
    // us what the server holds, and skipping it there would leave the baseline behind for ever.
    serverRef.current = next;
    if (navLinksAreEqual(itemsRef.current, next)) return;
    itemsRef.current = next;
    setItems(next);
  }, []);

  const load = useCallback(async () => {
    const startedAt = revision.current;

    try {
      const fresh = await navLinksService.list();
      setReadError(null);

      // The read succeeded, so the error is cleared either way — but its answer is only the
      // truth about the navbar if nothing of this client's has happened since it was asked.
      if (revision.current !== startedAt || hasOutstandingWrite()) {
        refreshQueued.current = true;
        return;
      }

      applyItems(fresh);
      loadedRef.current = true;
      setLoaded(true);
    } catch (err) {
      setReadError(err instanceof Error ? err.message : 'Failed to load navbar links.');
    }
  }, [applyItems]);

  /**
   * The read that was put off while this client was mid-write. It is how a change another
   * admin made during the edit reaches this page, and how a refused write gets the truth back
   * onto it — so it runs on failure as much as on success.
   */
  const settle = useCallback(() => {
    if (hasOutstandingWrite() || !refreshQueued.current) return;
    refreshQueued.current = false;
    void load();
  }, [load]);

  const runSave = useCallback(
    (next: NavLinkItem[]) => {
      writesInFlight.current += 1;

      const baseline = serverRef.current;

      void navLinksService
        .save(next, baseline)
        .then(() => {
          setWriteError(null);
          // Accepted, so this is now what the server holds — and the baseline the next edit is
          // diffed against. Without this a second toggle would be diffed against the state
          // before the first and would rewrite both.
          serverRef.current = next;
        })
        .catch((err: unknown) => {
          setWriteError(err instanceof Error ? err.message : 'Failed to save navbar links.');
          // The page is showing an edit the database refused. Take the server's copy back so
          // it stops claiming a change that never happened.
          refreshQueued.current = true;
        })
        .finally(() => {
          writesInFlight.current -= 1;
          revision.current += 1;
          settle();
        });
    },
    [settle]
  );

  /** False when the edit was refused, so the caller knows not to show it either. */
  const scheduleSave = useCallback(
    (next: NavLinkItem[]) => {
      // Read as a ref, not as state: a stale closure here would be the difference between
      // refusing a destructive save and performing one.
      if (!loadedRef.current) {
        setWriteError('The navbar could not be read, so it cannot be saved. Reload before editing.');
        return false;
      }

      revision.current += 1;
      pendingItems.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        pendingItems.current = null;
        runSave(next);
      }, SAVE_DEBOUNCE_MS);

      return true;
    },
    [runSave]
  );

  /**
   * An edit reaches the screen only once it has been accepted for saving. A page that shows a
   * change it was never allowed to write is a page that lies about the state of the site.
   */
  const commit = useCallback(
    (next: NavLinkItem[]) => {
      if (!scheduleSave(next)) return;
      applyItems(next);
    },
    [applyItems, scheduleSave]
  );

  const add = useCallback((item: NavLinkItem) => commit([item, ...itemsRef.current]), [commit]);

  const update = useCallback(
    (id: string, patch: Partial<NavLinkItem>) =>
      commit(itemsRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item))),
    [commit]
  );

  /**
   * The delete goes first, and the upsert that renumbers what is left only follows a delete
   * that actually happened.
   *
   * Run side by side, as they were, the two writes race: nothing sequences them, and the
   * moment a read lands between the delete being issued and the upsert being sent — which the
   * realtime subscription makes routine — the server's copy still holds the deleted row, puts
   * it back into this page's list, and the next edit sweeps it into the upsert payload, which
   * re-inserts it. The link reappears in the navbar with no one having asked for it.
   *
   * Sequencing also makes a refusal legible: a delete the row-level policy filtered out no
   * longer leaves the page renumbering rows around a link that is still live on the site.
   */
  const remove = useCallback(
    (id: string) => {
      if (!loadedRef.current) {
        setWriteError('The navbar could not be read, so it cannot be edited. Reload before editing.');
        return;
      }

      const next = itemsRef.current.filter((item) => item.id !== id);
      if (next.length === itemsRef.current.length) return;

      // Whatever the debounce is still holding was composed before this delete and still names
      // the row, so it is dropped rather than sent. Nothing is lost with it: every edit it
      // carried is already in `next`, which is built from the list on screen.
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      pendingItems.current = null;

      applyItems(next);
      revision.current += 1;
      writesInFlight.current += 1;

      void navLinksService
        .remove(id)
        .then(() => {
          setWriteError(null);
          /*
           * Renumber from what state holds NOW, not from `next`.
           *
           * `next` was computed before the delete was issued, so passing it here writes back a
           * snapshot from before the round trip — any toggle, rename or reorder made while the
           * delete was in flight is silently reverted by the very save meant to close the gap
           * in sort_order. Reading through the setter is what makes the renumber operate on
           * the list as it actually stands.
           */
          setItems((latest) => {
            runSave(latest);
            return latest;
          });
        })
        .catch((err: unknown) => {
          setWriteError(err instanceof Error ? err.message : 'Failed to remove navbar link.');
          refreshQueued.current = true;
        })
        .finally(() => {
          writesInFlight.current -= 1;
          revision.current += 1;
          settle();
        });
    },
    [applyItems, runSave, settle]
  );

  useEffect(() => {
    void load();

    const refreshOnReturn = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', refreshOnReturn);
    window.addEventListener('focus', refreshOnReturn);

    const unsubscribeRealtime = live ? navLinksService.subscribe(() => void load()) : () => undefined;

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      // Flush an edit the debounce had not fired yet. Guarded for the same reason as above.
      if (pendingItems.current && loadedRef.current) {
        // Nothing is mounted to show this, but an uncaught rejection here surfaces as a page
        // error in dev and as noise in production logs.
        void navLinksService
          .save(pendingItems.current, serverRef.current)
          .catch((err: unknown) => console.warn('Navbar changes could not be saved on unmount', err));
      }
      pendingItems.current = null;
      document.removeEventListener('visibilitychange', refreshOnReturn);
      window.removeEventListener('focus', refreshOnReturn);
      unsubscribeRealtime();
    };
  }, [load, live]);

  return {
    items,
    loaded,
    /** A refused write is the more urgent of the two: the admin just did something, and it did not take. */
    error: writeError ?? readError,
    add,
    update,
    remove,
    setAll: commit,
    reload: load,
  };
}
