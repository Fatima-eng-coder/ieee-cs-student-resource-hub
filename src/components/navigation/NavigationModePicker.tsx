/**
 * The 2D-or-3D choice, at the top of the page where everyone sees it.
 *
 * The 3D navigator used to be mentioned only in a card below the map, and nobody found it: the
 * map is tall and interactive, so people engage with it and the page effectively ends there.
 * A prompt underneath has the same problem however it is worded — it is under the thing that
 * stops you. So the choice moved above the map. The navbar now reads "2D/3D Navigations", which
 * promises two things; this is where the page delivers both.
 *
 * Deliberately two cards rather than a segmented 2D | 3D toggle. A toggle means "the thing
 * below me changes", and 3D is a separate deployment that opens in its own tab — so a toggle
 * would either lie about where you are the moment you came back, or force the heavy model into
 * this page, which is the exact thing keeping the two apps apart is for.
 *
 * And it sits ABOVE the map without gating it: the plan is still the next thing on screen, so
 * somebody standing in a corridor who just wants a route pays nothing for a decision they
 * already made.
 */

import { ArrowUpRight, Check } from 'lucide-react';

import { geometryByFloor, defaultFloorId } from '@/lib/navigation/data';
import { FULL_VIEW, footprintPath, toSvgRect, viewBoxString } from '@/lib/navigation/geometry';
import { NAVIGATOR_3D_URL } from './ThreeDNavigatorCard';

/** The 3D card's thumbnail. One of the real screenshots in public/nav-3d/. */
const SHOT_3D = '/nav-3d/3d_pic_1.png';

/**
 * A still of the ground floor, drawn from the same survey the live map uses.
 *
 * Not a screenshot and not stock art: it is the actual footprint and the actual room boxes, so
 * it cannot drift out of date when the dataset changes. No text, no interaction — at this size
 * it is a texture that says "floor plan", and the real one is a few hundred pixels below.
 */
function MiniPlan() {
  const ground = geometryByFloor.get(defaultFloorId);
  const rooms = ground?.rooms ?? [];

  return (
    <svg
      viewBox={viewBoxString(FULL_VIEW)}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path d={footprintPath()} fill="#ffffff" stroke="#CBBFA8" strokeWidth={0.6} />
      {rooms.map((room) => {
        const r = toSvgRect(room.bounds);
        return (
          <rect
            key={room.id}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            fill="#F4EFE4"
            stroke="#C9BCA3"
            strokeWidth={0.35}
            rx={0.4}
          />
        );
      })}
    </svg>
  );
}

export default function NavigationModePicker() {
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      {/* ---- 2D: the view you are already looking at ------------------ */}
      {/*
        A div, not a link. This card is the page you are on, so there is nowhere for it to go;
        aria-current is what says so to a screen reader, and the tick says it on screen.
      */}
      <div
        aria-current="page"
        className="flex items-center gap-4 rounded-2xl border-2 border-ieee-orange bg-white p-3 shadow-sm sm:p-4"
      >
        <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-cream ring-1 ring-black/5 sm:h-24 sm:w-28">
          <MiniPlan />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-slate-900 sm:text-lg">2D map</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-ieee-orange px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-white uppercase">
              <Check className="h-3 w-3" strokeWidth={3} />
              You&rsquo;re here
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
            Search a room, tap it on the plan, get a walking route. Nothing to install, works on
            any phone.
          </p>
        </div>
      </div>

      {/* ---- 3D: a different app, on its own deployment --------------- */}
      {/*
        The whole card is the link, so the tap target is the card rather than a small button in
        it. That is also why "Open the 3D app" below is a span: an anchor inside an anchor is
        invalid, and the outer one already goes there.
      */}
      <a
        href={NAVIGATOR_3D_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-cursor="link"
        className="group flex items-center gap-4 rounded-2xl border-2 border-black/10 bg-white p-3 shadow-sm transition hover:border-ieee-orange/50 hover:shadow-md sm:p-4"
      >
        <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-[#EFE9DC] ring-1 ring-black/5 sm:h-24 sm:w-28">
          <img
            src={SHOT_3D}
            alt=""
            /* Eager, not lazy: this card sits in the first screen, and a lazily-loaded image
               in the initial viewport only delays itself. The bottom card's showcase uses the
               same file, so the byte cost is shared rather than doubled. */
            loading="eager"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-slate-900 sm:text-lg">
              3D navigator
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
              New tab
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
            Walk the same block in 3D. Installs like an app and keeps working with no signal.
          </p>
          <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ieee-orange sm:text-sm">
            Open the 3D app
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </a>
    </div>
  );
}
