/**
 * World → SVG helpers for the floor-plan renderer.
 *
 * The dataset uses x = west→east and z = south→north. SVG's y axis grows downward, so
 * every point is flipped through `Z_MAX - z`, which puts north at the top of the map —
 * the orientation every paper floor plan in the building uses.
 *
 * Pan and zoom are done by moving the **viewBox**, not by transforming a group. That
 * keeps one number (`unitsPerPixel`) able to size strokes, labels and hit targets so
 * they stay a constant number of screen pixels at any zoom level.
 */

import { buildingInfo } from './data';
import type { Bounds, Point } from './types';

/** Breathing room around the footprint, in world units. */
const PADDING = 2.5;

const footprintX = buildingInfo.footprint.map(([x]) => x);
const footprintZ = buildingInfo.footprint.map(([, z]) => z);

export const WORLD = {
  minX: Math.min(...footprintX) - PADDING,
  maxX: Math.max(...footprintX) + PADDING,
  minZ: Math.min(...footprintZ) - PADDING,
  maxZ: Math.max(...footprintZ) + PADDING,
};

export const WORLD_WIDTH = WORLD.maxX - WORLD.minX;
export const WORLD_HEIGHT = WORLD.maxZ - WORLD.minZ;

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The whole building, fitted. */
export const FULL_VIEW: ViewBox = { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT };

export const viewBoxString = (v: ViewBox) => `${v.x} ${v.y} ${v.width} ${v.height}`;

/* ------------------------------------------------------------------ */
/* Coordinate conversion                                               */
/* ------------------------------------------------------------------ */

export const toSvgX = (x: number) => x - WORLD.minX;
export const toSvgY = (z: number) => WORLD.maxZ - z;

/** A point in SVG/view-box space, as opposed to the world-space `Point` (x/z). */
export interface ScreenPoint {
  x: number;
  y: number;
}

export const toSvg = (p: Point): ScreenPoint => ({ x: toSvgX(p.x), y: toSvgY(p.z) });

/** A world-space rectangle as SVG x/y/width/height (y flipped). */
export function toSvgRect(bounds: Bounds) {
  return {
    x: toSvgX(bounds.minX),
    y: toSvgY(bounds.maxZ),
    width: bounds.maxX - bounds.minX,
    height: bounds.maxZ - bounds.minZ,
  };
}

/** The building outline as an SVG path. */
export function footprintPath(): string {
  const [first, ...rest] = buildingInfo.footprint;
  const move = `M ${toSvgX(first[0])} ${toSvgY(first[1])}`;
  const lines = rest.map(([x, z]) => `L ${toSvgX(x)} ${toSvgY(z)}`).join(' ');
  return `${move} ${lines} Z`;
}

/* ------------------------------------------------------------------ */
/* Route polyline                                                      */
/* ------------------------------------------------------------------ */

const lengthOf = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * A polyline with rounded corners. Sharp right angles at corridor junctions read as
 * a schematic; rounded ones read as a walked path.
 */
export function roundedPath(points: Point[], radius = 1.2): string {
  const pts = points.map(toSvg).filter((p, i, arr) => i === 0 || lengthOf(arr[i - 1], p) > 1e-6);
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = pts[i - 1];
    const corner = pts[i];
    const next = pts[i + 1];

    // Never round more than half of either adjoining segment, or the curves collide.
    const r = Math.min(radius, lengthOf(prev, corner) / 2, lengthOf(corner, next) / 2);
    if (r < 0.05) {
      d += ` L ${corner.x} ${corner.y}`;
      continue;
    }

    const inLength = lengthOf(prev, corner);
    const outLength = lengthOf(corner, next);
    const entry = {
      x: corner.x - ((corner.x - prev.x) / inLength) * r,
      y: corner.y - ((corner.y - prev.y) / inLength) * r,
    };
    const exit = {
      x: corner.x + ((next.x - corner.x) / outLength) * r,
      y: corner.y + ((next.y - corner.y) / outLength) * r,
    };

    d += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }

  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/* ------------------------------------------------------------------ */
/* Fitting a view to some content                                      */
/* ------------------------------------------------------------------ */

/** Smallest view box containing every point, padded, clamped to sane zoom limits. */
export function fitPoints(points: Point[], padding = 6, minSize = 18): ViewBox {
  if (points.length === 0) return FULL_VIEW;

  const svgPoints = points.map(toSvg);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of svgPoints) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  let width = Math.max(maxX - minX + padding * 2, minSize);
  let height = Math.max(maxY - minY + padding * 2, minSize * (WORLD_HEIGHT / WORLD_WIDTH));
  width = Math.min(width, WORLD_WIDTH);
  height = Math.min(height, WORLD_HEIGHT);

  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;

  return {
    x: centreX - width / 2,
    y: centreY - height / 2,
    width,
    height,
  };
}

/**
 * Match a view box to a container's aspect ratio by growing the short axis, so the
 * content is never squashed and never crops what the caller asked to show.
 */
export function fitAspect(view: ViewBox, aspect: number): ViewBox {
  if (!Number.isFinite(aspect) || aspect <= 0) return view;
  const current = view.width / view.height;
  if (Math.abs(current - aspect) < 1e-3) return view;

  if (current < aspect) {
    const width = view.height * aspect;
    return { ...view, x: view.x - (width - view.width) / 2, width };
  }
  const height = view.width / aspect;
  return { ...view, y: view.y - (height - view.height) / 2, height };
}

/** Keep the view inside the plan so it can never be panned off into empty space. */
export function clampView(view: ViewBox): ViewBox {
  const width = Math.min(view.width, WORLD_WIDTH * 1.5);
  const height = Math.min(view.height, WORLD_HEIGHT * 1.5);
  // A little overscroll feels natural at the edges; much more just loses the building.
  const slackX = width / 8;
  const slackY = height / 8;
  return {
    width,
    height,
    x: Math.min(Math.max(view.x, -slackX), WORLD_WIDTH + slackX - width),
    y: Math.min(Math.max(view.y, -slackY), WORLD_HEIGHT + slackY - height),
  };
}

/** Zoom about a fixed point (in view-box space), e.g. the cursor or a pinch centre. */
export function zoomAround(view: ViewBox, focus: { x: number; y: number }, factor: number): ViewBox {
  const width = view.width / factor;
  const limited = Math.min(Math.max(width, WORLD_WIDTH / 14), WORLD_WIDTH * 1.4);
  const scale = limited / view.width;

  return clampView({
    x: focus.x - (focus.x - view.x) * scale,
    y: focus.y - (focus.y - view.y) * scale,
    width: view.width * scale,
    height: view.height * scale,
  });
}
