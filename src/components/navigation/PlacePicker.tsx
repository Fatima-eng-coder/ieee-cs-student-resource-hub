/**
 * Full-screen place picker — the "where from / where to" step.
 *
 * Deliberately one component for both ends of the route so the interaction is identical
 * whichever field you tapped, and deliberately a sheet rather than an inline dropdown so
 * that on a phone the results get the whole screen instead of 120px above the keyboard.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Clock, Search, X } from 'lucide-react';
import { categoryMeta, floorLevel, floors, placeById, places, placesByFloor } from '@/lib/navigation/data';
import { groupByFloor, readRecentPlaceIds, searchPlaces } from '@/lib/navigation/search';
import { QUICK_FILTERS } from '@/lib/navigation/quickFilters';
import CategoryGlyph from './CategoryGlyph';
import type { Place } from '@/lib/navigation/types';

export type PickerTarget = 'origin' | 'destination';

interface PlacePickerProps {
  open: boolean;
  target: PickerTarget;
  /** The place already chosen for this field, if any. */
  current: Place | null;
  /**
   * Opened from a quick chip ("Washroom", "Canteen", …): show only that category, so the
   * chip answers the question instead of just opening a blank search box.
   */
  filterId?: string | null;
  onPick: (place: Place) => void;
  onClose: () => void;
  /** Highlight a place on the map as the user moves through the list. */
  onPreview: (placeId: string | null) => void;
}

export default function PlacePicker({
  open,
  target,
  current,
  filterId = null,
  onPick,
  onClose,
  onPreview,
}: PlacePickerProps) {
  const [query, setQuery] = useState('');
  const [browseFloorId, setBrowseFloorId] = useState<string>(floors[0].id);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset every time the sheet opens so it never reopens mid-search.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    setBrowseFloorId(current?.floorId ?? floors[0].id);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open, current]);

  // Lock the page behind the sheet so scrolling the results doesn't scroll the page.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const recents = useMemo(
    () => (open ? readRecentPlaceIds().map((id) => placeById.get(id)).filter((p): p is Place => Boolean(p)) : []),
    [open]
  );

  const quickFilter = useMemo(() => QUICK_FILTERS.find((f) => f.id === filterId) ?? null, [filterId]);

  /**
   * A category chip lists every match across the building; typing narrows within it.
   * Otherwise it is a plain search.
   */
  const results = useMemo(() => {
    const typed = query.trim();
    if (quickFilter) {
      const matches = places.filter(quickFilter.matches);
      const allowed = new Set(matches.map((p) => p.id));
      if (!typed) {
        return matches
          .map((place) => ({ place, score: 1 }))
          .sort((a, b) => floorLevel(a.place.floorId) - floorLevel(b.place.floorId));
      }
      return searchPlaces(typed).filter((r) => allowed.has(r.place.id));
    }
    return typed ? searchPlaces(typed) : [];
  }, [query, quickFilter]);

  const grouped = useMemo(() => groupByFloor(results), [results]);
  const flatResults = useMemo(() => grouped.flatMap((g) => g.results.map((r) => r.place)), [grouped]);

  const browseList = placesByFloor.get(browseFloorId) ?? [];
  /** With a category chip active, the results list replaces the recents/browse view. */
  const showingResults = Boolean(quickFilter) || query.trim().length > 0;

  useEffect(() => {
    onPreview(flatResults[activeIndex]?.id ?? null);
  }, [activeIndex, flatResults, onPreview]);

  const commit = (place: Place) => {
    onPreview(null);
    onPick(place);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onPreview(null);
      onClose();
      return;
    }
    if (flatResults.length === 0) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => {
        const next = event.key === 'ArrowDown' ? i + 1 : i - 1;
        return (next + flatResults.length) % flatResults.length;
      });
      listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const place = flatResults[activeIndex];
      if (place) commit(place);
    }
  };

  const title = quickFilter
    ? `Every ${quickFilter.label.toLowerCase()} in the building`
    : target === 'origin'
      ? 'Where are you now?'
      : 'Where do you want to go?';

  const hint = quickFilter
    ? 'Pick one to route there — or set where you are first and the chip will pick the closest for you.'
    : target === 'origin'
      ? 'Pick the room, entrance, staircase or lift you are standing at — or tap it straight on the map.'
      : 'Search a room code, a lab name or just what you need — "washroom", "canteen", "print".';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/45 backdrop-blur-sm sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => {
            onPreview(null);
            onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onKeyDown}
            className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:mt-8 sm:h-auto sm:max-h-[80vh] sm:max-w-2xl sm:rounded-3xl"
          >
            {/* ---- Header ------------------------------------------ */}
            <div className="shrink-0 border-b border-black/5 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onPreview(null);
                    onClose();
                  }}
                  className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 sm:hidden"
                  aria-label="Close"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold text-slate-900">{title}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onPreview(null);
                    onClose();
                  }}
                  className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:flex"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="relative mt-3">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  type="search"
                  autoComplete="off"
                  placeholder={quickFilter ? `Filter ${quickFilter.label.toLowerCase()}s…` : 'Try “CL-11”, “canteen”, “112”…'}
                  aria-label="Search places"
                  className="w-full rounded-xl border border-black/10 bg-slate-50 py-3 pr-4 pl-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-ieee-orange/50 focus:bg-white focus:ring-2 focus:ring-ieee-orange/20"
                />
              </div>
            </div>

            {/* ---- Body -------------------------------------------- */}
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
              {showingResults ? (
                grouped.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">
                    Nothing matches “{query.trim()}”. Try a room code like <span className="font-mono">CL-7</span> or a
                    word like <span className="font-semibold">lab</span>.
                  </p>
                ) : (
                  <>
                    <p className="sr-only" aria-live="polite">
                      {flatResults.length} result{flatResults.length === 1 ? '' : 's'}
                    </p>
                    {grouped.map((group) => (
                      <section key={group.floorId} className="mb-4 last:mb-0">
                        <h3 className="sticky top-0 z-10 -mx-1 bg-white/95 px-1 py-1.5 font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase backdrop-blur">
                          {group.floorName} · {group.results.length}
                        </h3>
                        <ul className="mt-1 space-y-1">
                          {group.results.map(({ place }) => {
                            const index = flatResults.indexOf(place);
                            return (
                              <PlaceRow
                                key={place.id}
                                place={place}
                                active={index === activeIndex}
                                onSelect={() => commit(place)}
                                onHover={() => setActiveIndex(index)}
                              />
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </>
                )
              ) : (
                <>
                  {recents.length > 0 && (
                    <section className="mb-5">
                      <h3 className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                        <Clock className="h-3 w-3" /> Recent
                      </h3>
                      <ul className="mt-2 space-y-1">
                        {recents.map((place) => (
                          <PlaceRow key={place.id} place={place} active={false} onSelect={() => commit(place)} showFloor />
                        ))}
                      </ul>
                    </section>
                  )}

                  <section>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                        Browse by floor
                      </h3>
                      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                        {floors.map((floor) => (
                          <button
                            key={floor.id}
                            type="button"
                            onClick={() => setBrowseFloorId(floor.id)}
                            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                              browseFloorId === floor.id
                                ? 'bg-white text-ieee-orange shadow-sm'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {floor.badge}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ul className="mt-2 space-y-1 pb-4">
                      {browseList.map((place) => (
                        <PlaceRow key={place.id} place={place} active={false} onSelect={() => commit(place)} />
                      ))}
                    </ul>
                  </section>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */

function PlaceRow({
  place,
  active,
  onSelect,
  onHover,
  showFloor = false,
}: {
  place: Place;
  active: boolean;
  onSelect: () => void;
  onHover?: () => void;
  showFloor?: boolean;
}) {
  const meta = categoryMeta(place.category);

  return (
    <li>
      <button
        type="button"
        data-active={active}
        onClick={onSelect}
        onMouseEnter={onHover}
        onFocus={onHover}
        className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
          active ? 'bg-ieee-orange/10 ring-1 ring-ieee-orange/25' : 'hover:bg-slate-50'
        }`}
      >
        <CategoryGlyph category={place.category} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-semibold text-slate-800">{place.name}</span>
            {place.ambiguous && (
              <span className="font-mono text-[10px] font-medium text-slate-400">{place.code}</span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {place.ambiguous ? `${meta.label} · ${place.zone}` : place.subtitle}
            {showFloor && place.ambiguous ? ` · ${place.floorName}` : ''}
          </span>
        </span>
      </button>
    </li>
  );
}
