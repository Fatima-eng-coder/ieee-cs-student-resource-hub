import type {
  SearchResult,
  Course,
  EventItem,
} from '@/types';
import {
  faqsService,
  quickLinksService,
  type AdminFaq,
  type AdminQuickLink,
} from '@/services/siteContentService';
import { coursesService } from '@/services/coursesService';
import { eventsService } from '@/services/eventsService';
import { teachers } from '@/data/teachers';

/** Normalize away spaces/punctuation so "CS 301" matches "CS-301". */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * FAQs, quick links, courses and events are the indexed collections that live in the database.
 * Indexing the static seeds they used to come from instead would hand a visitor a hit that
 * opens a page not containing it — a course the admin renamed months ago, an event added since
 * the seed was written and therefore findable nowhere. It is the same reason Projects Expo and
 * Date Sheets are left out below.
 *
 * search() is called from a useMemo and has to stay synchronous, so the four lists are fetched
 * on the first search and kept in this snapshot for the rest of the visit. Before the first
 * answer arrives the index holds none of them, which is the right way round: a hit that shows
 * up a moment late, never a hit that goes nowhere.
 *
 * "A moment late" only works if something asks again once it lands, and nothing did — the
 * caller's useMemo depends on the query and its own async result sets, none of which change
 * when this snapshot fills. So a visitor searching an FAQ before the fetch returned was told
 * there were no matches and had no reason to try again. Hence the subscription: filling the
 * snapshot is an event the search page can wait for.
 *
 * Each collection is fetched and tracked separately rather than as one Promise.all, so a
 * courses read that fails does not also cost the visitor their FAQs, and the page can name
 * exactly which part of the index is missing from the answer it is showing.
 */
type CollectionKey = 'faqs' | 'quickLinks' | 'courses' | 'events';

interface SiteContentSnapshot {
  faqs: AdminFaq[];
  quickLinks: AdminQuickLink[];
  courses: Course[];
  events: EventItem[];
}

/** How each collection is named to a visitor when it could not be loaded. */
const collectionNames: Record<CollectionKey, string> = {
  faqs: 'FAQs',
  quickLinks: 'quick links',
  courses: 'courses',
  events: 'events',
};

let siteContent: SiteContentSnapshot = { faqs: [], quickLinks: [], courses: [], events: [] };

/**
 * Events are read through listPublic: an unpublished event has no page for a hit to open, so
 * indexing it would produce exactly the dead result this snapshot exists to avoid.
 *
 * Each of these reads the snapshot only after its own await has resolved. Written the other way
 * round — `siteContent = { ...siteContent, faqs: await … }` — the spread is evaluated before the
 * await, so all four capture the empty snapshot they started from and whichever answers last
 * puts back an index holding nothing but its own collection.
 */
const loaders: Record<CollectionKey, () => Promise<void>> = {
  faqs: async () => {
    const faqs = await faqsService.list();
    siteContent = { ...siteContent, faqs };
  },
  quickLinks: async () => {
    const quickLinks = await quickLinksService.list();
    siteContent = { ...siteContent, quickLinks };
  },
  courses: async () => {
    const courses = await coursesService.list();
    siteContent = { ...siteContent, courses };
  },
  events: async () => {
    const events = await eventsService.listPublic();
    siteContent = { ...siteContent, events };
  },
};

const started = new Set<CollectionKey>();
const failed = new Set<CollectionKey>();
const settled = new Set<CollectionKey>();
let siteContentVersion = 0;
const siteContentListeners = new Set<() => void>();

/**
 * Bumped whenever the indexed collections change identity, so a component can put it in a
 * dependency array. A counter rather than the data itself: callers re-run search(), which
 * reads the snapshot directly, and passing the lists around would only invite a second copy.
 */
export function getSiteContentVersion(): number {
  return siteContentVersion;
}

export function subscribeSiteContent(listener: () => void): () => void {
  siteContentListeners.add(listener);
  return () => {
    siteContentListeners.delete(listener);
  };
}

/**
 * The collections the index is currently missing, named for a person. Empty is the normal
 * case, including before anything has loaded — a collection still on its way is not missing,
 * it is late, and the subscription above will produce the results when it arrives.
 */
/**
 * Collections that have been asked for and have not answered yet, either way.
 *
 * Between the first keystroke and the network answering, the index genuinely does not hold
 * these — so "No results found" is a claim the page is in no position to make. A read that
 * eventually fails can take ten seconds to say so, and for those ten seconds a student
 * searching for a course they know exists was being told it does not.
 */
export function getPendingCollections(): string[] {
  return (Object.keys(loaders) as CollectionKey[])
    .filter((key) => started.has(key) && !settled.has(key))
    .map((key) => collectionNames[key]);
}

export function getUnavailableCollections(): string[] {
  return (Object.keys(collectionNames) as CollectionKey[])
    .filter((key) => failed.has(key))
    .map((key) => collectionNames[key]);
}

function publish(): void {
  siteContentVersion += 1;
  siteContentListeners.forEach((listener) => listener());
}

/**
 * Each collection is attempted at most once from here. A failure is deliberately not retried
 * on this path: a failure bumps the version counter so the page can say what is missing, that
 * re-runs the caller's useMemo, and that calls search() again — so retrying here would re-fire
 * the failing read for as long as the visitor leaves a query in the box. Retrying belongs to
 * primeSiteContent(), which only ever runs because a person opened the page or asked for it.
 */
function loadCollection(key: CollectionKey): void {
  if (started.has(key)) return;
  started.add(key);

  void loaders[key]().then(
    () => {
      failed.delete(key);
      settled.add(key);
      publish();
    },
    (error: unknown) => {
      failed.add(key);
      settled.add(key);
      publish();
      console.warn(`Could not load ${collectionNames[key]} for search`, error);
    }
  );
}

function loadSiteContent(): void {
  (Object.keys(loaders) as CollectionKey[]).forEach(loadCollection);
}

/**
 * Lets a page start the fetch on mount instead of waiting for the visitor's first keystroke,
 * and is the one path that gives a collection that already failed another go — bounded by the
 * page being opened or the visitor pressing "try again", never by a render.
 */
export function primeSiteContent(): void {
  failed.forEach((key) => {
    started.delete(key);
    settled.delete(key);
  });
  loadSiteContent();
}

/** Built fresh per search so results always reflect the collections as they stand. */
function buildIndex(): SearchResult[] {
  const results: SearchResult[] = [];

  siteContent.courses.forEach((c) =>
    results.push({
      id: c.id,
      title: `${c.code} — ${c.name}`,
      type: 'Course',
      description: c.description,
      tags: [c.code, c.department],
      link: `/courses/${c.id}`,
    })
  );

  siteContent.events.forEach((e) =>
    results.push({
      id: e.id,
      title: e.title,
      type: 'Event',
      description: e.description,
      tags: [e.category, e.timing],
      link: `/events/${e.id}`,
    })
  );

  // Projects Expo and Date Sheets are deferred behind a coming-soon screen, so their
  // entries are not indexed — a search hit that lands on "this module is being rebuilt" is
  // worse than no hit at all.

  siteContent.faqs.forEach((f) =>
    results.push({ id: f.id, title: f.question, type: 'FAQ', description: f.answer, tags: [f.category], link: `/faq-contact` })
  );

  // Rooms are NOT indexed here. They come from the surveyed building dataset via
  // utils/navigationSearch.ts, which is loaded on demand so the ~160 kB of floor-plan
  // data stays out of the main bundle. The old `destinations` seed listed placeholder
  // rooms ("Room 101", "AI Lab") that do not exist in the building.

  teachers.forEach((t) =>
    results.push({
      id: t.id,
      title: t.name,
      type: 'Teacher',
      description: `${t.designation}, ${t.department}`,
      tags: [t.department],
      link: `/courses/teachers`,
    })
  );

  siteContent.quickLinks.forEach((q) =>
    results.push({
      id: q.id,
      title: q.label,
      type: 'Quick Link',
      description: q.category,
      tags: [q.category],
      link: q.url.startsWith('/') ? q.url : '/quick-links',
    })
  );

  return results;
}

export function search(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  loadSiteContent();
  const nq = norm(q);
  return buildIndex().filter((item) => {
    const hay = `${item.title} ${item.description} ${item.tags.join(' ')}`.toLowerCase();
    return hay.includes(q) || (nq.length >= 2 && norm(hay).includes(nq));
  });
}
