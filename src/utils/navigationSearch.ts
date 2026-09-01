/**
 * Bridges the wayfinding map into the site-wide search box, so typing "CL-11" or
 * "canteen" on `/search` finds the real room and links straight to a route.
 *
 * The building dataset is ~160 kB, and most visitors never search for a room — so it is
 * pulled in with a dynamic import rather than a static one. That keeps it in the same
 * lazily loaded chunk as the map itself instead of the main bundle, at the cost of the
 * navigation results arriving a beat after the rest. `/search` already merges async
 * result sets (announcements, papers), so a third one fits the page as it stands.
 */

import type { SearchResult } from '@/types';

type NavigationModules = {
  searchPlaces: typeof import('@/lib/navigation/search')['searchPlaces'];
  categoryMeta: typeof import('@/lib/navigation/data')['categoryMeta'];
};

let modulesPromise: Promise<NavigationModules> | null = null;

function loadModules(): Promise<NavigationModules> {
  modulesPromise ??= Promise.all([
    import('@/lib/navigation/search'),
    import('@/lib/navigation/data'),
  ]).then(([searchModule, dataModule]) => ({
    searchPlaces: searchModule.searchPlaces,
    categoryMeta: dataModule.categoryMeta,
  }));
  return modulesPromise;
}

/** Only worth showing the strongest matches — the map itself is for browsing. */
const MAX_RESULTS = 8;
/**
 * Cap per distinct name. Without it a query like "washroom" fills every slot with the
 * eight "Male Washrooms" (they outrank the female ones only because the name is two
 * characters shorter), which is a worse answer than a spread across both.
 */
const MAX_PER_NAME = 2;

export async function searchNavigation(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const { searchPlaces, categoryMeta } = await loadModules();

  const seenNames = new Map<string, number>();
  const picked = [];
  for (const { place } of searchPlaces(query, MAX_RESULTS * 6)) {
    const used = seenNames.get(place.name) ?? 0;
    if (used >= MAX_PER_NAME) continue;
    seenNames.set(place.name, used + 1);
    picked.push(place);
    if (picked.length >= MAX_RESULTS) break;
  }

  return picked.map((place) => {
    const meta = categoryMeta(place.category);
    return {
      id: `nav-${place.id}`,
      title: place.name,
      type: 'Room / Lab',
      // Same-named rooms repeat across the building, so always say which one this is.
      description: place.ambiguous
        ? `${meta.label} · ${place.floorName} · ${place.zone} (${place.code})`
        : `${meta.label} · ${place.floorName}`,
      tags: [place.floorName, meta.label],
      // Deep-links the map with this room already set as the destination.
      link: `/navigation?to=${encodeURIComponent(place.id)}`,
    };
  });
}
