/**
 * The interactive 2D floor plan.
 *
 * Pan/zoom is driven by the SVG viewBox rather than a group transform, which gives one
 * `unitsPerPixel` number that keeps strokes, labels and hit targets a constant *screen*
 * size at every zoom level — the thing that makes a vector map feel like a map instead
 * of a drawing that has been scaled up.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { categoryMeta, displayName, getFloorGeometry, floorName, placeById } from '@/lib/navigation/data';
import {
  FULL_VIEW,
  clampView,
  fitAspect,
  fitPoints,
  footprintPath,
  roundedPath,
  toSvg,
  toSvgRect,
  viewBoxString,
  zoomAround,
  type ViewBox,
} from '@/lib/navigation/geometry';
import type { Route } from '@/lib/navigation/pathfinding';
import type { DirectionStep } from '@/lib/navigation/directions';
import { fitLabel } from '@/lib/navigation/labels';
import type { Place, Point, Room } from '@/lib/navigation/types';

interface FloorPlanProps {
  floorId: string;
  route: Route | null;
  /** Highlighted while stepping through guidance. */
  activeStep: DirectionStep | null;
  origin: Place | null;
  destination: Place | null;
  /** Search result currently under the cursor — flashes on the map. */
  previewPlaceId: string | null;
  onSelectPlace: (place: Place) => void;
  showLabels: boolean;
  /** Bumping this number refits the view to the route (or the whole floor). */
  fitToken: number;
  className?: string;
}

/** Room label is only drawn once the room is at least this wide on screen. */
const LABEL_MIN_PX = 44;
/** Below this the plan is showing so much at once that per-room labels are noise. */
const LABEL_MAX_UNITS_PER_PX = 0.14;

export default function FloorPlan({
  floorId,
  route,
  activeStep,
  origin,
  destination,
  previewPlaceId,
  onSelectPlace,
  showLabels,
  fitToken,
  className = '',
}: FloorPlanProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 960, height: 480 });
  const [view, setView] = useState<ViewBox>(FULL_VIEW);

  const geometry = useMemo(() => getFloorGeometry(floorId), [floorId]);
  const aspect = size.width / Math.max(size.height, 1);
  const unitsPerPixel = view.width / Math.max(size.width, 1);

  /* -------------------------------------------------- */
  /* Sizing                                             */
  /* -------------------------------------------------- */

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* -------------------------------------------------- */
  /* Fitting                                            */
  /* -------------------------------------------------- */

  /** Points of the route that live on the floor currently being shown. */
  const legPoints = useMemo<Point[]>(() => {
    if (!route) return [];
    const leg = route.legs.find((l) => l.floorId === floorId);
    return leg ? leg.nodes.map(({ x, z }) => ({ x, z })) : [];
  }, [route, floorId]);

  const fitAll = useCallback(() => setView(fitAspect(FULL_VIEW, aspect)), [aspect]);

  /**
   * Frame the part of the route that happens on this floor. The minimum size matters:
   * a leg can be a two-metre hop to the lift, and zooming that tight shows a corridor
   * with no context. Keeping at least ~20 m of building in frame keeps it readable.
   */
  const fitRoute = useCallback(() => {
    if (legPoints.length === 0) {
      setView(fitAspect(FULL_VIEW, aspect));
      return;
    }
    setView(clampView(fitAspect(fitPoints(legPoints, 8, 40), aspect)));
  }, [legPoints, aspect]);

  // Refit whenever the caller asks, the floor changes, or the container is resized.
  useEffect(() => {
    fitRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, floorId, aspect]);

  // While guidance is running, keep the current step in frame.
  useEffect(() => {
    if (!activeStep || activeStep.floorId !== floorId) return;
    const points = activeStep.points.length > 1 ? activeStep.points : [...activeStep.points, ...legPoints.slice(0, 1)];
    setView(clampView(fitAspect(fitPoints(points, 10, 34), aspect)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep?.id, floorId]);

  /* -------------------------------------------------- */
  /* Pan + zoom                                         */
  /* -------------------------------------------------- */

  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: ViewBox; distance: number; centre: { x: number; y: number } } | null>(null);
  const dragged = useRef(false);

  /** Screen pixels → view-box units. */
  const toViewPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: view.x + ((clientX - rect.left) / rect.width) * view.width,
        y: view.y + ((clientY - rect.top) / rect.height) * view.height,
      };
    },
    [view]
  );

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragged.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        view,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        centre: toViewPoint((a.x + b.x) / 2, (a.y + b.y) / 2),
      };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Two fingers: pinch to zoom about the midpoint.
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.distance > 0) {
        dragged.current = true;
        setView(zoomAround(gesture.current.view, gesture.current.centre, distance / gesture.current.distance));
      }
      return;
    }

    if (pointers.current.size !== 1) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setView((current) =>
      clampView({
        ...current,
        x: current.x - (dx / rect.width) * current.width,
        y: current.y - (dy / rect.height) * current.height,
      })
    );
  };

  const endPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };

  // Wheel zoom has to be a non-passive native listener, or the page scrolls with it.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const focus = toViewPoint(event.clientX, event.clientY);
      setView((current) => zoomAround(current, focus, event.deltaY < 0 ? 1.18 : 1 / 1.18));
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [toViewPoint]);

  const zoomBy = (factor: number) =>
    setView((current) =>
      zoomAround(current, { x: current.x + current.width / 2, y: current.y + current.height / 2 }, factor)
    );

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const pan = view.width * 0.12;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-pan, 0],
      ArrowRight: [pan, 0],
      ArrowUp: [0, -pan],
      ArrowDown: [0, pan],
    };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      setView((current) => clampView({ ...current, x: current.x + dx, y: current.y + dy }));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(1.25);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomBy(1 / 1.25);
    } else if (event.key === '0') {
      event.preventDefault();
      fitAll();
    }
  };

  /* -------------------------------------------------- */
  /* Derived render data                                */
  /* -------------------------------------------------- */

  const routePath = useMemo(() => (legPoints.length > 1 ? roundedPath(legPoints) : ''), [legPoints]);

  const activePath = useMemo(() => {
    if (!activeStep || activeStep.floorId !== floorId || activeStep.points.length < 2) return '';
    return roundedPath(activeStep.points);
  }, [activeStep, floorId]);

  /** Where the route enters and leaves this floor, for the "continues upstairs" pins. */
  const legInfo = useMemo(() => route?.legs.find((l) => l.floorId === floorId) ?? null, [route, floorId]);

  const labelScale = Math.max(unitsPerPixel, 0.001);
  const stroke = (px: number) => px * labelScale;
  const font = (px: number) => px * labelScale;
  const labelsVisible = showLabels && labelScale < LABEL_MAX_UNITS_PER_PX;

  const roomIsOnRoute = (room: Room) =>
    route?.from.id === room.id || route?.to.id === room.id || previewPlaceId === room.id;

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-hidden ${className}`}>
      <svg
        ref={svgRef}
        viewBox={viewBoxString(view)}
        className="h-full w-full touch-none select-none"
        style={{ cursor: 'grab' }}
        role="application"
        tabIndex={0}
        aria-label={`Floor plan of the ${floorName(floorId)}. Arrow keys pan, plus and minus zoom, 0 fits the floor.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
        onKeyDown={onKeyDown}
        onDoubleClick={(event) => {
          const focus = toViewPoint(event.clientX, event.clientY);
          setView((current) => zoomAround(current, focus, 1.6));
        }}
      >
        <defs>
          {/* Stair treads, drawn once and tiled into every stairwell. */}
          <pattern id="fp-stairs" width="1.6" height="1.6" patternUnits="userSpaceOnUse">
            <rect width="1.6" height="1.6" fill="#E2E8F0" />
            <line x1="0" y1="0" x2="1.6" y2="0" stroke="#94A3B8" strokeWidth="0.22" />
          </pattern>
          <filter id="fp-slab-shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="0.7" stdDeviation="0.8" floodColor="#0F172A" floodOpacity="0.12" />
          </filter>
          <marker id="fp-route-end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
            <circle cx="5" cy="5" r="4" fill="#FF6C0C" />
          </marker>
        </defs>

        {/* ---- Slab ------------------------------------------------ */}
        <path d={footprintPath()} fill="#FFFFFF" stroke="#CBD5E1" strokeWidth={stroke(1.6)} filter="url(#fp-slab-shadow)" />

        {/* ---- Corridors ------------------------------------------- */}
        {geometry.corridors.map((corridor, i) => {
          const rect = toSvgRect(corridor.bounds);
          return <rect key={`corridor-${i}`} {...rect} fill="#F8FAFC" />;
        })}

        {/* ---- Atrium void (open to the floor below) ---------------- */}
        {geometry.voids.map((hole, i) => {
          const rect = toSvgRect(hole.bounds);
          return (
            <g key={`void-${i}`}>
              <rect {...rect} fill="#EEF2F6" stroke="#94A3B8" strokeWidth={stroke(1)} strokeDasharray={`${stroke(4)} ${stroke(3)}`} />
              {labelsVisible && (
                <text
                  x={rect.x + rect.width / 2}
                  y={rect.y + rect.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={font(9)}
                  fill="#94A3B8"
                  className="font-mono uppercase"
                  style={{ letterSpacing: font(0.5) }}
                >
                  open below
                </text>
              )}
            </g>
          );
        })}

        {/* ---- Rooms ----------------------------------------------- */}
        {geometry.rooms.map((room) => {
          const rect = toSvgRect(room.bounds);
          const meta = categoryMeta(room.category);
          const highlighted = roomIsOnRoute(room);
          const isDestination = destination?.id === room.id;
          const isOrigin = origin?.id === room.id;
          const widthPx = rect.width / labelScale;

          return (
            <g key={room.id}>
              <rect
                {...rect}
                rx={0.35}
                fill={highlighted ? '#FFF3E8' : meta.fill}
                stroke={isDestination ? '#FF6C0C' : isOrigin ? '#0F766E' : highlighted ? '#FDBA74' : meta.stroke}
                strokeWidth={stroke(isDestination || isOrigin ? 2.6 : 1.1)}
                className="cursor-pointer transition-[fill] duration-150"
                onClick={() => {
                  if (dragged.current) return;
                  const place = placeById.get(room.id);
                  if (place) onSelectPlace(place);
                }}
              >
                <title>{`${room.name} — ${meta.label}, ${floorName(room.floorId)}`}</title>
              </rect>

              {/* Door: a short opening drawn on the room wall. */}
              <circle
                cx={toSvg(room.door).x}
                cy={toSvg(room.door).y}
                r={stroke(2.2)}
                fill="#FFFFFF"
                stroke={meta.stroke}
                strokeWidth={stroke(1)}
                pointerEvents="none"
              />

              {labelsVisible && widthPx > LABEL_MIN_PX && (
                <RoomLabel room={room} rect={rect} colour={meta.text} fontSize={font(10.5)} />
              )}
            </g>
          );
        })}

        {/* ---- Stairwells and lifts -------------------------------- */}
        {geometry.stairs.map((core) => {
          const rect = toSvgRect(core.bounds);
          return (
            <g key={core.id}>
              <rect {...rect} rx={0.3} fill="url(#fp-stairs)" stroke="#94A3B8" strokeWidth={stroke(1.2)} />
              {labelsVisible && rect.width / labelScale > 30 && (
                <text
                  x={rect.x + rect.width / 2}
                  y={rect.y + rect.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={font(9)}
                  fill="#334155"
                  className="pointer-events-none font-bold"
                >
                  {core.id}
                </text>
              )}
            </g>
          );
        })}

        {geometry.elevators.map((core) => {
          const rect = toSvgRect(core.bounds);
          const inset = Math.min(rect.width, rect.height) * 0.22;
          return (
            <g key={core.id}>
              <rect {...rect} rx={0.3} fill="#E2E8F0" stroke="#64748B" strokeWidth={stroke(1.2)} />
              <rect
                x={rect.x + inset}
                y={rect.y + inset}
                width={rect.width - inset * 2}
                height={rect.height - inset * 2}
                fill="none"
                stroke="#64748B"
                strokeWidth={stroke(1)}
              />
              {labelsVisible && rect.width / labelScale > 26 && (
                <text
                  x={rect.x + rect.width / 2}
                  y={rect.y + rect.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={font(9)}
                  fill="#334155"
                  className="pointer-events-none font-bold"
                >
                  {core.id}
                </text>
              )}
            </g>
          );
        })}

        {/* ---- Entrances ------------------------------------------- */}
        {geometry.entrances.map((entrance) => {
          const outside = toSvg(entrance.outsidePosition);
          const door = toSvg(entrance.doorCentre);
          return (
            <g key={entrance.id} className="cursor-pointer" onClick={() => {
              if (dragged.current) return;
              const place = placeById.get(`LM-ENT-${entrance.id}`);
              if (place) onSelectPlace(place);
            }}>
              <line
                x1={door.x}
                y1={door.y}
                x2={outside.x}
                y2={outside.y}
                stroke="#059669"
                strokeWidth={stroke(2.4)}
                strokeLinecap="round"
              />
              <circle cx={outside.x} cy={outside.y} r={stroke(5)} fill="#ECFDF5" stroke="#059669" strokeWidth={stroke(1.6)} />
              <text
                x={outside.x}
                y={outside.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={font(7)}
                fill="#047857"
                className="pointer-events-none font-bold"
              >
                {entrance.id}
              </text>
              <title>{entrance.name}</title>
            </g>
          );
        })}

        {/* ---- Route ----------------------------------------------- */}
        {routePath && (
          <g pointerEvents="none">
            {/* Casing keeps the line legible over every room fill. */}
            <path d={routePath} fill="none" stroke="#FFFFFF" strokeWidth={stroke(9)} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
            <path d={routePath} fill="none" stroke="#FF6C0C" strokeWidth={stroke(5)} strokeLinecap="round" strokeLinejoin="round" />
            <path
              d={routePath}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={stroke(1.7)}
              strokeLinecap="round"
              strokeDasharray={`${stroke(3)} ${stroke(7)}`}
              className="nav-route-dashes"
              style={{ ['--nav-dash-cycle' as string]: `${stroke(10)}` }}
            />
            {activePath && (
              <path
                d={activePath}
                fill="none"
                stroke="#0F172A"
                strokeWidth={stroke(6.5)}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
              />
            )}
          </g>
        )}

        {/* ---- Where the route joins / leaves this floor ------------ */}
        {legInfo?.arriveVia && (
          <FloorLink
            point={legInfo.nodes[0]}
            label={`from ${legInfo.arriveVia.fromFloorName.replace(' Floor', '')}`}
            direction={legInfo.arriveVia.direction === 'up' ? 'down' : 'up'}
            scale={labelScale}
          />
        )}
        {legInfo?.departVia && (
          <FloorLink
            point={legInfo.nodes[legInfo.nodes.length - 1]}
            label={`to ${legInfo.departVia.toFloorName.replace(' Floor', '')}`}
            direction={legInfo.departVia.direction}
            scale={labelScale}
          />
        )}

        {/* ---- Start / end markers --------------------------------- */}
        {origin && origin.floorId === floorId && <Marker place={origin} tone="origin" scale={labelScale} />}
        {destination && destination.floorId === floorId && <Marker place={destination} tone="destination" scale={labelScale} />}
      </svg>

      {/* ---- Overlay chrome ---------------------------------------- */}
      <NorthArrow />
      <ScaleBar unitsPerPixel={unitsPerPixel} />

      <div className="pointer-events-auto absolute right-2 bottom-2 flex flex-col gap-1 sm:right-3 sm:bottom-3 sm:gap-1.5">
        <MapButton label="Zoom in" onClick={() => zoomBy(1.35)}>
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10 4v12M4 10h12" />
          </svg>
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomBy(1 / 1.35)}>
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 10h12" />
          </svg>
        </MapButton>
        <MapButton label={route ? 'Fit route' : 'Fit floor'} onClick={route ? fitRoute : fitAll}>
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4" />
          </svg>
        </MapButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

/**
 * A room name fitted to its box: the longest form that fits, wrapped onto two lines
 * before falling back to an abbreviation, and omitted entirely if even initials overflow.
 */
function RoomLabel({
  room,
  rect,
  colour,
  fontSize,
}: {
  room: Room;
  rect: { x: number; y: number; width: number; height: number };
  colour: string;
  fontSize: number;
}) {
  const fitted = fitLabel(displayName(room.shortName), rect.width, rect.height, fontSize);
  if (!fitted) return null;

  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;
  const lineHeight = fitted.fontSize * 1.15;
  // Shift up by half a line per extra line so the block stays vertically centred.
  const firstY = centreY - ((fitted.lines.length - 1) * lineHeight) / 2;

  return (
    <text
      x={centreX}
      y={firstY}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={fitted.fontSize}
      fill={colour}
      className="pointer-events-none font-semibold"
    >
      {fitted.lines.map((line, i) => (
        <tspan key={line} x={centreX} dy={i === 0 ? 0 : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function Marker({ place, tone, scale }: { place: Place; tone: 'origin' | 'destination'; scale: number }) {
  const { x, y } = toSvg(place.position);
  const colour = tone === 'origin' ? '#0F766E' : '#FF6C0C';
  const r = scale * 8;

  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={r * 1.9} fill={colour} opacity={0.16} className="nav-marker-pulse" />
      <circle cx={x} cy={y} r={r} fill="#FFFFFF" stroke={colour} strokeWidth={scale * 3.2} />
      <circle cx={x} cy={y} r={r * 0.4} fill={colour} />
    </g>
  );
}

/** A pin showing the route continuing onto another floor. */
function FloorLink({
  point,
  label,
  direction,
  scale,
}: {
  point: Point;
  label: string;
  direction: 'up' | 'down';
  scale: number;
}) {
  const { x, y } = toSvg(point);
  const r = scale * 11;

  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={r} fill="#0F172A" stroke="#FFFFFF" strokeWidth={scale * 2.5} />
      <path
        d={
          direction === 'up'
            ? `M ${x} ${y - r * 0.45} L ${x - r * 0.4} ${y + r * 0.15} L ${x + r * 0.4} ${y + r * 0.15} Z`
            : `M ${x} ${y + r * 0.45} L ${x - r * 0.4} ${y - r * 0.15} L ${x + r * 0.4} ${y - r * 0.15} Z`
        }
        fill="#FFFFFF"
      />
      <text
        x={x}
        y={y + r * 2.2}
        textAnchor="middle"
        fontSize={scale * 9}
        fill="#0F172A"
        className="font-mono font-semibold"
        stroke="#FFFFFF"
        strokeWidth={scale * 2.4}
        paintOrder="stroke"
      >
        {label}
      </text>
    </g>
  );
}

function NorthArrow() {
  return (
    <div className="pointer-events-none absolute top-3 right-3 hidden h-11 w-11 items-center justify-center rounded-full bg-white/85 shadow-sm ring-1 ring-black/5 backdrop-blur sm:flex">
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M12 3.5 L15.4 13 L12 11 L8.6 13 Z" fill="#FF6C0C" />
        <path d="M12 11 L15.4 13 L12 20.5 L8.6 13 Z" fill="#CBD5E1" />
        <text x="12" y="7.4" textAnchor="middle" fontSize="5.5" fill="#0F172A" className="font-bold">
          N
        </text>
      </svg>
      <span className="sr-only">North is up</span>
    </div>
  );
}

/** A bar whose *label* changes with zoom so the reader always gets a round number. */
function ScaleBar({ unitsPerPixel }: { unitsPerPixel: number }) {
  const metresPerPixel = unitsPerPixel * 0.5;
  const targets = [1, 2, 5, 10, 20, 50];
  const metres = targets.find((m) => m / metresPerPixel > 46) ?? targets[targets.length - 1];
  const widthPx = Math.round(metres / metresPerPixel);

  return (
    <div className="pointer-events-none absolute bottom-16 left-3 select-none sm:bottom-3">
      <div className="flex flex-col gap-1">
        <div className="h-2 border-x-2 border-b-2 border-slate-500/70" style={{ width: `${Math.min(widthPx, 160)}px` }} />
        <span className="font-mono text-[10px] font-medium text-slate-500">{metres} m</span>
      </div>
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-slate-600 shadow-sm ring-1 ring-black/5 backdrop-blur transition hover:bg-white hover:text-ieee-orange sm:h-9 sm:w-9 sm:rounded-xl"
    >
      {children}
    </button>
  );
}
