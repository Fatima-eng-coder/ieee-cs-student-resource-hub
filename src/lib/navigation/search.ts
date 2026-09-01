/**
 * Search over every place in the building.
 *
 * Tuned for how people actually type room names here: "cl11", "CL 11", "lab 11" and
 * "cl-11" all have to find CL-11, and a bare "washroom" has to list every washroom
 * grouped by floor rather than returning one arbitrary match.
 */

import { categoryMeta, floorLevel, places } from './data';
import type { Place } from './types';

/** Strip punctuation and case so "CL-11", "cl 11" and "cl11" all normalise alike. */
const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

interface IndexedPlace {
  place: Place;
  /** Normalised name, e.g. "cl 11". */
  name: string;
  /** Name with all separators removed, e.g. "cl11". */
  squashed: string;
  /** Every other searchable string, normalised. */
  terms: string[];
  squashedTerms: string[];
}

const index: IndexedPlace[] = places.map((place) => {
  const meta = categoryMeta(place.category);
  const terms = [...place.keywords, meta.label, meta.plural, place.floorName]
    .filter(Boolean)
    .map(normalise);

  return {
    place,
    name: normalise(place.name),
    squashed: compact(place.name),
    terms,
    squashedTerms: terms.map(compact),
  };
});

/** Every character of `query` appears in `text`, in order — catches typo-ish input. */
function isSubsequence(query: string, text: string): boolean {
  let i = 0;
  for (let j = 0; j < text.length && i < query.length; j += 1) {
    if (text[j] === query[i]) i += 1;
  }
  return i === query.length;
}

/**
 * Higher is better; 0 means no match. The bands are wide apart so an exact hit always
 * outranks a prefix hit, a prefix hit always outranks a substring hit, and so on.
 */
function scorePlace(entry: IndexedPlace, query: string, squashedQuery: string): number {
  const { name, squashed, terms, squashedTerms } = entry;

  if (name === query || squashed === squashedQuery) return 1000;
  if (name.startsWith(query) || squashed.startsWith(squashedQuery)) return 800 - name.length;

  // Word-start match: "office" finds "Front office area".
  if (name.split(' ').some((word) => word.startsWith(query))) return 600 - name.length;

  if (squashed.includes(squashedQuery)) return 450 - name.length;

  // Category and alias hits — "washroom", "lab", "lift", "S2".
  if (terms.some((term) => term === query) || squashedTerms.some((term) => term === squashedQuery)) {
    return 400;
  }
  if (terms.some((term) => term.split(' ').some((word) => word.startsWith(query)))) return 300;
  if (squashedTerms.some((term) => term.includes(squashedQuery))) return 200;

  // Last resort — only for queries long enough that a loose match is still meaningful.
  if (squashedQuery.length >= 3 && isSubsequence(squashedQuery, squashed)) return 100;

  return 0;
}

export interface SearchResult {
  place: Place;
  score: number;
}

export function searchPlaces(query: string, limit = 40): SearchResult[] {
  const normalised = normalise(query);
  if (!normalised) return [];
  const squashedQuery = compact(query);

  const results: SearchResult[] = [];
  for (const entry of index) {
    const score = scorePlace(entry, normalised, squashedQuery);
    if (score > 0) results.push({ place: entry.place, score });
  }

  results.sort(
    (a, b) =>
      b.score - a.score ||
      floorLevel(a.place.floorId) - floorLevel(b.place.floorId) ||
      a.place.name.localeCompare(b.place.name, undefined, { numeric: true })
  );

  return results.slice(0, limit);
}

export interface FloorGroup {
  floorId: string;
  floorName: string;
  results: SearchResult[];
}

/** Results grouped by floor, floors ordered lowest first, best floor first. */
export function groupByFloor(results: SearchResult[]): FloorGroup[] {
  const groups = new Map<string, FloorGroup>();

  for (const result of results) {
    const { floorId, floorName } = result.place;
    if (!groups.has(floorId)) groups.set(floorId, { floorId, floorName, results: [] });
    groups.get(floorId)!.results.push(result);
  }

  return [...groups.values()].sort((a, b) => {
    const bestA = Math.max(...a.results.map((r) => r.score));
    const bestB = Math.max(...b.results.map((r) => r.score));
    return bestB - bestA || floorLevel(a.floorId) - floorLevel(b.floorId);
  });
}

/* ------------------------------------------------------------------ */
/* Recent picks                                                        */
/* ------------------------------------------------------------------ */

const RECENTS_KEY = 'ieeecs_nav_recent_places';
const MAX_RECENTS = 6;

export function readRecentPlaceIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberPlace(placeId: string): void {
  try {
    const next = [placeId, ...readRecentPlaceIds().filter((id) => id !== placeId)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota — recents are a convenience, never a requirement.
  }
}
