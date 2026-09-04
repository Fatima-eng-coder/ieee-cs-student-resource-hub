import { useCallback, useEffect, useRef, useState } from 'react';
import { navLinksService } from '@/services/navLinksService';
import type { NavLinkItem } from '@/types';

/**
 * Edits are held locally until the admin presses Save.
 *
 * They used to save themselves on a 350ms debounce. That put a network write behind every
 * click, made "has my change landed" unanswerable from the screen, and meant a half-finished
 * reorder was already live. Worse, it hid a bug for a while: when the diffing baseline was
 * wrong the writes silently did nothing, and the only symptom was a toggle flipping back
 * some seconds later, long after the click that was supposed to have changed it.
 *
 * An explicit save makes the state legible -- there are unsaved changes or there are not -- and
 * a failure lands while the admin is still looking at what they did.
 */

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
  const [saving, setSaving] = useState(false);

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

  /**
   * Whether the screen holds edits the database has not been told about. Read by the load guard
   * as a ref, because a read landing on top of unsaved work would silently discard it.
   */
  const isDirtyRef = useRef(false);
  const loadedRef = useRef(false);
  const writesInFlight = useRef(0);

  /**
   * Bumped by every local edit and by every write that finishes. A read that began at an
   * earlier value cannot describe the navbar this client is now looking at, whichever of the
   * two the server answered from.
   */
  const revision = useRef(0);

  /** A read whose answer was dropped. One is taken as soon as there is nothing outstanding. */
  const refreshQueued = useRef(false);

  const hasOutstandingWrite = () => writesInFlight.current > 0 || isDirtyRef.current;

  const applyItems = useCallback((next: NavLinkItem[]) => {
    // Deliberately does NOT touch serverRef. This runs for optimistic local edits as well as
    // for reads, and recording an unsaved edit as "what the server holds" was the bug that made
    // toggles switch themselves back on: the diff was taken against the edit itself, found
    // nothing to write, and the next read restored the old value. Only load() may set it.
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

      // The one place the baseline is set: this is the only value that came from the server.
      serverRef.current = fresh;
      isDirtyRef.current = false;
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

  /** False when there is nothing safe to edit yet, so the caller knows not to show it either. */
  const stageEdit = useCallback((next: NavLinkItem[]) => {
    // Read as a ref, not as state: a stale closure here would be the difference between
    // refusing a destructive save and performing one.
    if (!loadedRef.current) {
      setWriteError('The navbar could not be read, so it cannot be edited. Reload before editing.');
      return false;
    }
    revision.current += 1;
    isDirtyRef.current = true;
    applyItems(next);
    return true;
  }, [applyItems]);

  const commit = useCallback((next: NavLinkItem[]) => { stageEdit(next); }, [stageEdit]);

  const add = useCallback((item: NavLinkItem) => commit([item, ...itemsRef.current]), [commit]);

  const update = useCallback(
    (id: string, patch: Partial<NavLinkItem>) =>
      commit(itemsRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item))),
    [commit]
  );

  /**
   * Staged, like every other edit. The row is dropped from the list on screen and the DELETE is
   * issued by saveChanges, which sequences it before the upsert that renumbers what is left.
   *
   * That ordering is what stops a deleted link coming back. Run side by side the two writes
   * race: a read landing between them still sees the row, puts it back into this page's list,
   * and the next upsert re-inserts it -- the link reappears in the navbar with nobody having
   * asked for it.
   */
  const remove = useCallback(
    (id: string) => {
      const next = itemsRef.current.filter((item) => item.id !== id);
      if (next.length !== itemsRef.current.length) stageEdit(next);
    },
    [stageEdit]
  );

  /**
   * Writes everything staged since the last successful save or read.
   *
   * Deletions first, then the upsert, for the ordering reason above. The upsert sends only rows
   * that differ from the baseline, so a toggle writes one row and a reorder writes the two that
   * swapped -- another admin working on a different link is not overwritten.
   */
  const saveChanges = useCallback(async () => {
    if (!loadedRef.current) {
      setWriteError('The navbar could not be read, so it cannot be saved. Reload before editing.');
      return false;
    }

    const next = itemsRef.current;
    const baseline = serverRef.current;
    const removedIds = baseline.filter((b) => !next.some((n) => n.id === b.id)).map((b) => b.id);

    setSaving(true);
    writesInFlight.current += 1;
    try {
      for (const id of removedIds) await navLinksService.remove(id);
      await navLinksService.save(next, baseline);

      // Only now is this what the server holds, and only now may it become the baseline.
      serverRef.current = next;
      isDirtyRef.current = false;
      setWriteError(null);
      return true;
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : 'Failed to save the navbar.');
      // The page is showing edits the database refused. Take the server's copy back so it stops
      // claiming a change that never happened.
      refreshQueued.current = true;
      return false;
    } finally {
      writesInFlight.current -= 1;
      revision.current += 1;
      setSaving(false);
      settle();
    }
  }, [settle]);

  useEffect(() => {
    void load();

    const refreshOnReturn = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', refreshOnReturn);
    window.addEventListener('focus', refreshOnReturn);

    const unsubscribeRealtime = live ? navLinksService.subscribe(() => void load()) : () => undefined;

    return () => {
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
    saving,
    /** True when the screen holds edits the database has not been told about. */
    dirty: items.length !== serverRef.current.length
      || items.some((item, i) => {
        const other = serverRef.current[i];
        return !other || other.id !== item.id || other.label !== item.label
          || other.to !== item.to || other.enabled !== item.enabled;
      }),
    saveChanges,
    add,
    update,
    remove,
    setAll: commit,
    reload: load,
  };
}
