/**
 * CS block wayfinding — the 2D indoor map.
 *
 * Shape of the experience, and why:
 *
 * • Map first, not a wizard. You land on a floor plan you can already read; picking a
 *   start and destination narrows it rather than gating it. Tapping a room on the map is
 *   as good an entry point as searching for it.
 * • One route, fully explained. Summary → which floors → step by step → walk-along mode.
 * • Multi-floor is the hard case, so it gets the most help: the floor rail badges every
 *   floor the route touches with its leg number, the journey strip names the stairs or
 *   lift joining them, and guidance switches floors for you as you reach the transition.
 * • Every route is a URL, so a route can be sent to somebody who is actually lost.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CircleDot, MapPin, Navigation as NavigationIcon, TriangleAlert, X } from 'lucide-react';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import FloorPlan from '@/components/navigation/FloorPlan';
import FloorRail from '@/components/navigation/FloorRail';
import PlacePicker, { type PickerTarget } from '@/components/navigation/PlacePicker';
import RoutePanel from '@/components/navigation/RoutePanel';
import ThreeDNavigatorCard from '@/components/navigation/ThreeDNavigatorCard';
import CategoryGlyph from '@/components/navigation/CategoryGlyph';
import ChipScroller from '@/components/navigation/ChipScroller';
import {
  BUILDING_NAME,
  categoryMeta,
  defaultFloorId,
  dataset,
  floorName,
  placeById,
  places,
} from '@/lib/navigation/data';
import { buildDirections } from '@/lib/navigation/directions';
import { DEFAULT_TRAVEL_MODE, findNearest, findRoute, type TravelMode } from '@/lib/navigation/pathfinding';
import { QUICK_FILTERS } from '@/lib/navigation/quickFilters';
import { rememberPlace } from '@/lib/navigation/search';
import type { Place } from '@/lib/navigation/types';

const ROOM_COUNT = dataset.rooms.length;

export default function NavigationPage() {
  const [params, setParams] = useSearchParams();

  const originId = params.get('from');
  const destinationId = params.get('to');
  // `access=1` was the old step-free flag; keep old links working.
  const mode: TravelMode =
    params.get('mode') === 'lift' || params.get('access') === '1' ? 'lift' : DEFAULT_TRAVEL_MODE;

  const origin = originId ? (placeById.get(originId) ?? null) : null;
  const destination = destinationId ? (placeById.get(destinationId) ?? null) : null;

  const [activeFloorId, setActiveFloorId] = useState<string>(origin?.floorId ?? defaultFloorId);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  /** When a quick chip opens the picker, it opens showing just that category. */
  const [pickerFilterId, setPickerFilterId] = useState<string | null>(null);
  const [previewPlaceId, setPreviewPlaceId] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [guidanceIndex, setGuidanceIndex] = useState<number | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [copied, setCopied] = useState(false);

  /* -------------------------------------------------- */
  /* Route                                              */
  /* -------------------------------------------------- */

  const route = useMemo(
    () =>
      origin && destination && origin.id !== destination.id
        ? findRoute(origin.id, destination.id, { mode })
        : null,
    [origin, destination, mode]
  );

  const steps = useMemo(() => (route ? buildDirections(route) : []), [route]);

  /** Update the URL — every route state is shareable. */
  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  // Show the floor the route starts on as soon as a new route appears.
  useEffect(() => {
    if (!route) return;
    setGuidanceIndex(null);
    setActiveFloorId(route.legs[0]?.floorId ?? defaultFloorId);
    setFitToken((n) => n + 1);
  }, [route]);

  const setEndpoint = useCallback(
    (target: PickerTarget, place: Place | null) => {
      patchParams({ [target === 'origin' ? 'from' : 'to']: place?.id ?? null });
      if (place) {
        rememberPlace(place.id);
        setActiveFloorId(place.floorId);
        setFitToken((n) => n + 1);
      }
      setSelectedPlace(null);
    },
    [patchParams]
  );

  const swap = () => {
    patchParams({ from: destinationId, to: originId });
  };

  const clear = () => {
    patchParams({ from: null, to: null });
    setGuidanceIndex(null);
    setSelectedPlace(null);
  };

  /**
   * "Nearest washroom" and friends.
   *
   * With a starting point set this routes straight to the closest one by walking distance.
   * Without one there is nothing to be "nearest" to, so it opens the picker already
   * filtered to that category — the useful half of the answer, rather than a blank search
   * box that makes every chip behave identically.
   */
  const goToNearest = (filterId: string) => {
    const filter = QUICK_FILTERS.find((f) => f.id === filterId);
    if (!filter) return;

    if (!origin) {
      setPickerFilterId(filterId);
      setPicker('destination');
      return;
    }
    const nearest = findNearest(origin.id, filter.matches, { mode });
    if (nearest) setEndpoint('destination', nearest.to);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin or a permission prompt declined) — the URL
      // is in the address bar either way, so there is nothing to recover from.
    }
  };

  const activeStep = guidanceIndex !== null ? (steps[guidanceIndex] ?? null) : null;

  const onSelectPlaceFromMap = (place: Place) => {
    if (picker) {
      setEndpoint(picker, place);
      setPicker(null);
      return;
    }
    setSelectedPlace(place);
  };

  const onFloorChange = useCallback((floorId: string) => {
    setActiveFloorId((current) => {
      if (current === floorId) return current;
      setFitToken((n) => n + 1);
      return floorId;
    });
  }, []);

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Wayfinding"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Navigation' }]}
        title="Find your way around the CS block"
        subtitle="Search a room, tap it on the plan, and get a walking route — across floors, stairs and the lift."
        meta={[
          { value: `${ROOM_COUNT}`, label: 'Mapped rooms' },
          { value: '4', label: 'Floors' },
          { value: `${dataset.entrances.length}`, label: 'Entrances' },
        ]}
      />

      <PageSection tone="cream" top width="wide">
        {/* ---- Beta notice ------------------------------------------ */}
        <div className="mx-auto flex max-w-4xl items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <TriangleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-600" />
          <p className="text-sm leading-snug text-amber-800">
            <span className="font-semibold">Beta.</span> Plans were surveyed by student volunteers, so a door or room
            name may still be wrong —{' '}
            <Link to="/navigation/report" className="font-semibold underline underline-offset-2 hover:text-amber-900">
              tell us if something's off
            </Link>
            .
          </p>
        </div>

        {/* ---- From / To -------------------------------------------- */}
        <div className="mt-8">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <EndpointField
              label="From"
              place={origin}
              tone="origin"
              placeholder="Where are you now?"
              onOpen={() => {
                setPickerFilterId(null);
                setPicker('origin');
              }}
              onClear={() => setEndpoint('origin', null)}
            />
            <div className="flex justify-center py-1 sm:py-0">
              <ArrowRight className="hidden h-5 w-5 text-slate-300 sm:block" />
            </div>
            <EndpointField
              label="To"
              place={destination}
              tone="destination"
              placeholder="Where do you want to go?"
              onOpen={() => {
                setPickerFilterId(null);
                setPicker('destination');
              }}
              onClear={() => setEndpoint('destination', null)}
            />
          </div>

          <div className="mt-3">
            <span className="font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
              Take me to the nearest
            </span>
            {/* Scrolls with arrows when the chips overflow — otherwise nobody finds the
                ones past the right edge. */}
            <div className="mt-1.5">
              <ChipScroller label="Nearest places">
                {QUICK_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => goToNearest(filter.id)}
                    data-cursor="link"
                    title={
                      origin
                        ? `Route to the nearest ${filter.label.toLowerCase()}`
                        : `Show every ${filter.label.toLowerCase()} in the building`
                    }
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      destination && filter.matches(destination)
                        ? 'border-ieee-orange/50 bg-ieee-orange/10 text-ieee-orange'
                        : 'border-black/10 bg-white text-slate-600 hover:border-ieee-orange/40 hover:text-ieee-orange'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </ChipScroller>
            </div>
          </div>
        </div>

        {/* ---- Map + panel ------------------------------------------ */}
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
          <div className="relative h-[46vh] min-h-[19rem] overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm sm:h-[54vh] lg:h-[38rem]">
            <FloorPlan
              floorId={activeFloorId}
              route={route}
              activeStep={activeStep}
              origin={origin}
              destination={destination}
              previewPlaceId={previewPlaceId}
              onSelectPlace={onSelectPlaceFromMap}
              showLabels
              fitToken={fitToken}
            />

            <div className="absolute top-3 left-3 flex flex-col gap-2">
              <span className="rounded-xl bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-black/5 backdrop-blur">
                {floorName(activeFloorId)}
              </span>
              {picker && (
                <span className="rounded-xl bg-ieee-orange px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
                  Tap a room to set the {picker === 'origin' ? 'start' : 'destination'}
                </span>
              )}
            </div>

            {/* Horizontal along the bottom: a vertical rail sat over the S3 stairwell. */}
            <FloorRail
              activeFloorId={activeFloorId}
              onChange={onFloorChange}
              route={route}
              orientation="horizontal"
              className="absolute bottom-3 left-1/2 -translate-x-1/2"
            />

            {/* Tap a room → what do you want to do with it. */}
            <AnimatePresence>
              {selectedPlace && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-x-3 bottom-3 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-black/5 sm:inset-x-auto sm:left-1/2 sm:w-[22rem] sm:-translate-x-1/2"
                >
                  <div className="flex items-start gap-3">
                    <CategoryGlyph category={selectedPlace.category} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{selectedPlace.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {selectedPlace.ambiguous
                          ? `${categoryMeta(selectedPlace.category).label} · ${selectedPlace.zone} · ${selectedPlace.code}`
                          : selectedPlace.subtitle}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPlace(null)}
                      aria-label="Dismiss"
                      className="-mt-1 -mr-1 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEndpoint('origin', selectedPlace)}
                      className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-500/50 hover:text-teal-700"
                    >
                      I'm here
                    </button>
                    <button
                      type="button"
                      onClick={() => setEndpoint('destination', selectedPlace)}
                      className="flex-[1.4] rounded-xl bg-ieee-orange px-3 py-2 text-xs font-semibold text-white transition hover:bg-ieee-orange-dark"
                    >
                      Take me here
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ---- Side panel ----------------------------------------- */}
          <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm lg:h-[38rem]">
            {route ? (
              <RoutePanel
                route={route}
                steps={steps}
                activeStepIndex={guidanceIndex}
                activeFloorId={activeFloorId}
                mode={mode}
                onFloorChange={onFloorChange}
                onStartGuidance={() => setGuidanceIndex(0)}
                onExitGuidance={() => setGuidanceIndex(null)}
                onStepChange={setGuidanceIndex}
                onModeChange={(next) => patchParams({ mode: next === 'lift' ? 'lift' : null, access: null })}
                onSwap={swap}
                onClear={clear}
                onCopyLink={copyLink}
                copied={copied}
              />
            ) : (
              <EmptyPanel
                origin={origin}
                destination={destination}
                sameEndpoints={Boolean(origin && destination && origin.id === destination.id)}
                onPick={setPicker}
              />
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Drag to pan · scroll or pinch to zoom · tap any room for directions · {BUILDING_NAME}
        </p>
      </PageSection>

      {/* ---- 3D companion ------------------------------------------- */}
      <PageSection tone="white" width="wide">
        <ThreeDNavigatorCard />
      </PageSection>

      <PlacePicker
        open={picker !== null}
        target={picker ?? 'destination'}
        current={picker === 'origin' ? origin : destination}
        filterId={pickerFilterId}
        onPick={(place) => {
          if (picker) setEndpoint(picker, place);
          setPicker(null);
          setPickerFilterId(null);
        }}
        onClose={() => {
          setPicker(null);
          setPickerFilterId(null);
        }}
        onPreview={setPreviewPlaceId}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EndpointField({
  label,
  place,
  tone,
  placeholder,
  onOpen,
  onClear,
}: {
  label: string;
  place: Place | null;
  tone: 'origin' | 'destination';
  placeholder: string;
  onOpen: () => void;
  onClear: () => void;
}) {
  const Glyph = tone === 'origin' ? CircleDot : MapPin;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        data-cursor="link"
        className="flex w-full items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-left shadow-sm transition hover:border-ieee-orange/40 hover:shadow-md"
      >
        <Glyph className={`h-5 w-5 shrink-0 ${tone === 'origin' ? 'text-teal-600' : 'text-ieee-orange'}`} />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9px] font-semibold tracking-widest text-slate-400 uppercase">
            {label}
          </span>
          <span className={`block truncate text-sm ${place ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
            {place ? place.name : placeholder}
          </span>
        </span>
        {place && (
          <span className="hidden shrink-0 font-mono text-[10px] text-slate-400 sm:block">
            {place.floorName.replace(' Floor', '')}
          </span>
        )}
      </button>

      {place && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label.toLowerCase()}`}
          className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-white text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600 focus-visible:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function EmptyPanel({
  origin,
  destination,
  sameEndpoints,
  onPick,
}: {
  origin: Place | null;
  destination: Place | null;
  sameEndpoints: boolean;
  onPick: (target: PickerTarget) => void;
}) {
  const missing: PickerTarget | null = !origin ? 'origin' : !destination ? 'destination' : null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ieee-orange/10 text-ieee-orange">
        <NavigationIcon className="h-7 w-7" strokeWidth={1.8} />
      </span>

      {sameEndpoints ? (
        <>
          <p className="font-display text-lg font-bold text-slate-900">You're already there</p>
          <p className="max-w-xs text-sm text-slate-500">
            The start and the destination are the same place. Pick somewhere else to go.
          </p>
          <button
            type="button"
            onClick={() => onPick('destination')}
            className="rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark"
          >
            Choose a destination
          </button>
        </>
      ) : (
        <>
          <p className="font-display text-lg font-bold text-slate-900">
            {missing === 'origin' ? 'Where are you right now?' : 'Where do you want to go?'}
          </p>
          <p className="max-w-xs text-sm leading-relaxed text-slate-500">
            {missing === 'origin'
              ? 'Pick the entrance you came in through, or the room you are sitting in. You can also tap it straight on the plan.'
              : `Search a room code like CL-11, a name like Canteen, or just tap a room on the ${floorName(
                  origin?.floorId ?? defaultFloorId
                ).toLowerCase()} plan.`}
          </p>
          <button
            type="button"
            onClick={() => onPick(missing ?? 'destination')}
            className="rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
          >
            {missing === 'origin' ? 'Set my starting point' : 'Choose a destination'}
          </button>
          <p className="font-mono text-[10px] tracking-wide text-slate-300 uppercase">
            {places.length} places · 4 floors · step-free routing
          </p>
        </>
      )}
    </div>
  );
}
