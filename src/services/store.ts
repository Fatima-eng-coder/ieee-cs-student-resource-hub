/**
 * Generic persistent collection store — the prototype "database".
 *
 * Every content type (events, courses, developers, …) is a keyed collection
 * seeded from the static data on first read, then persisted to localStorage and
 * kept in sync across every component that reads it (admin + public). Swapping
 * to a real backend later means replacing these three functions with API calls
 * + a query cache; `useCollection` and every page stay the same.
 */

const PREFIX = 'ieeecs_col_';

type Listener = () => void;

const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();
let storageListenerAttached = false;

const storageKey = (key: string) => PREFIX + key;

function ensureStorageListener() {
  if (storageListenerAttached || typeof window === 'undefined') return;
  storageListenerAttached = true;

  window.addEventListener('storage', (event) => {
    if (!event.key?.startsWith(PREFIX)) return;
    const key = event.key.slice(PREFIX.length);
    cache.delete(key);
    listeners.get(key)?.forEach((fn) => fn());
  });
}

/** Stable snapshot read (safe for useSyncExternalStore). Persists nothing. */
export function readCollection<T>(key: string, seed: T[]): T[] {
  ensureStorageListener();
  if (cache.has(key)) return cache.get(key) as T[];
  let value: T[] = seed;
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (raw) value = JSON.parse(raw) as T[];
  } catch {
    value = seed;
  }
  cache.set(key, value);
  return value;
}

export function writeCollection<T>(key: string, items: T[]): void {
  ensureStorageListener();
  cache.set(key, items);
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(items));
  } catch (e) {
    console.error(`Failed to persist collection "${key}"`, e);
  }
  listeners.get(key)?.forEach((fn) => fn());
}

export function subscribeCollection(key: string, cb: Listener): () => void {
  ensureStorageListener();
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => set!.delete(cb);
}
