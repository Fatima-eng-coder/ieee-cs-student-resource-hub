/**
 * Turns a `Route` into turn-by-turn walking instructions.
 *
 * Three deliberate choices about how the steps read:
 *
 * 1. A turn and the walk that follows it are ONE step ("Turn right and continue for 8 m"),
 *    not two. Splitting them doubles the step count for no extra information.
 * 2. Instructions are generated from a *simplified* copy of the path. The raw graph has
 *    half-metre jogs and a couple of overshoots (the corridor node past a stairwell, say)
 *    that are invisible when you are walking but would each become their own step.
 *    Distances are still summed along the real path, so the numbers stay honest.
 * 3. Steps name landmarks you actually pass ("past the Canteen on your right"). Indoors,
 *    "15 metres" means little on its own; a door you can see means a lot.
 */

import { BUILDING_NAME, floorName, geometryByFloor, unitsToMetres } from './data';
import type { Route, RouteLeg, RouteTransition } from './pathfinding';
import type { GraphNode, Point, Room } from './types';

export type StepKind = 'start' | 'walk' | 'stairs' | 'elevator' | 'floor-arrival' | 'arrive';

export type StepIcon =
  | 'start'
  | 'straight'
  | 'left'
  | 'right'
  | 'slight-left'
  | 'slight-right'
  | 'u-turn'
  | 'stairs-up'
  | 'stairs-down'
  | 'elevator'
  | 'flag';

export interface DirectionStep {
  id: string;
  kind: StepKind;
  /** Floor this step happens on — the map follows this. */
  floorId: string;
  /** Primary instruction, e.g. "Turn right and continue for 12 m". */
  text: string;
  /** Optional supporting line, e.g. "You'll pass the Canteen on your right". */
  detail?: string;
  /** Metres walked during this step; 0 for transitions and arrival. */
  metres: number;
  icon: StepIcon;
  /** The real polyline this step covers, so the map can highlight and zoom to it. */
  points: Point[];
  /** Index of the route leg this step belongs to. */
  legIndex: number;
}

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

/** Douglas–Peucker tolerance, in world units (1 unit = 0.5 m). */
const SIMPLIFY_EPSILON = 0.9;
/** Below this, a bend is not worth calling a turn. */
const MIN_TURN_DEG = 22;
/** Below this, a walk is too short to be its own step (world units). */
const MIN_SEGMENT_UNITS = 5;
/** A corner this sharp is always kept, however short the approach to it. */
const HARD_CORNER_DEG = 100;
/** How close (world units) a door must be to the walking line to count as "passed". */
const PASS_RADIUS = 3.2;

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

const RAD = 180 / Math.PI;

/** Bearing in degrees clockwise from north (x = east, z = north). */
function bearing(a: Point, b: Point): number {
  return (Math.atan2(b.x - a.x, b.z - a.z) * RAD + 360) % 360;
}

/** Signed turn from one bearing to the next, in (-180, 180]. Positive = to the right. */
function turnAngle(from: number, to: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return delta === -180 ? 180 : delta;
}

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.z - a.z);

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const compassOf = (deg: number) => COMPASS[Math.round(deg / 45) % 8];

/** Round to something a person can act on without implying false precision. */
function readableMetres(metres: number): number {
  if (metres < 10) return Math.max(1, Math.round(metres));
  if (metres < 40) return Math.round(metres / 5) * 5;
  return Math.round(metres / 10) * 10;
}

/**
 * Which side of the direction of travel a point falls on.
 * Cross product of the travel vector with the offset vector: positive is left.
 */
function sideOf(from: Point, to: Point, target: Point): 'left' | 'right' {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return dx * (target.z - from.z) - dz * (target.x - from.x) > 0 ? 'left' : 'right';
}

/** Perpendicular distance from a point to a segment, plus how far along the segment it lies. */
function projectOntoSegment(a: Point, b: Point, p: Point): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return { distance: distance(a, p), t: 0 };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq));
  return { distance: distance({ x: a.x + t * dx, z: a.z + t * dz }, p), t };
}

const perpendicularDistance = (p: Point, a: Point, b: Point) => projectOntoSegment(a, b, p).distance;

/* ------------------------------------------------------------------ */
/* Path simplification (index based, so distances stay tied to the      */
/* real polyline)                                                      */
/* ------------------------------------------------------------------ */

/** Douglas–Peucker over a point list, returning the indices worth keeping. */
function douglasPeucker(points: Point[], epsilon: number): number[] {
  if (points.length <= 2) return points.map((_, i) => i);

  const keep = new Set<number>([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worstIndex = -1;
    let worstDistance = epsilon;

    for (let i = first + 1; i < last; i += 1) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > worstDistance) {
        worstDistance = d;
        worstIndex = i;
      }
    }

    if (worstIndex !== -1) {
      keep.add(worstIndex);
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  return [...keep].sort((a, b) => a - b);
}

/** |turn| at kept[position], using its kept neighbours. Endpoints count as a hard corner. */
function turnMagnitudeAt(points: Point[], kept: number[], position: number): number {
  if (position <= 0 || position >= kept.length - 1) return 180;
  const a = points[kept[position - 1]];
  const b = points[kept[position]];
  const c = points[kept[position + 1]];
  return Math.abs(turnAngle(bearing(a, b), bearing(b, c)));
}

/** Drop vertices whose bend is too gentle to mention. */
function dropGentleBends(points: Point[], kept: number[]): number[] {
  let result = kept;
  let changed = true;
  while (changed && result.length > 2) {
    changed = false;
    for (let i = 1; i < result.length - 1; i += 1) {
      if (turnMagnitudeAt(points, result, i) < MIN_TURN_DEG) {
        result = [...result.slice(0, i), ...result.slice(i + 1)];
        changed = true;
        break;
      }
    }
  }
  return result;
}

/**
 * Fold away segments too short to be their own instruction. Of the two endpoints,
 * drop whichever is the gentler corner — and never drop a genuinely sharp one unless
 * the segment is tiny.
 */
function dropShortSegments(points: Point[], kept: number[]): number[] {
  let result = kept;
  let changed = true;
  while (changed && result.length > 2) {
    changed = false;
    for (let i = 1; i < result.length; i += 1) {
      const length = distance(points[result[i - 1]], points[result[i]]);
      if (length >= MIN_SEGMENT_UNITS) continue;

      const candidates = [i - 1, i]
        .filter((position) => position > 0 && position < result.length - 1)
        .map((position) => ({ position, turn: turnMagnitudeAt(points, result, position) }))
        .filter(({ turn }) => turn < HARD_CORNER_DEG || length < 1.5)
        .sort((a, b) => a.turn - b.turn);

      if (candidates.length === 0) continue;
      const { position } = candidates[0];
      result = [...result.slice(0, position), ...result.slice(position + 1)];
      changed = true;
      break;
    }
  }
  return result;
}

function simplifyIndices(points: Point[]): number[] {
  if (points.length <= 2) return points.map((_, i) => i);
  return dropShortSegments(points, dropGentleBends(points, douglasPeucker(points, SIMPLIFY_EPSILON)));
}

/** Length actually walked between two indices, following every real vertex in between. */
function pathLength(points: Point[], from: number, to: number): number {
  let total = 0;
  for (let i = from; i < to; i += 1) total += distance(points[i], points[i + 1]);
  return total;
}

/* ------------------------------------------------------------------ */
/* Landmarks you pass along the way                                    */
/* ------------------------------------------------------------------ */

/** Categories worth calling out — a generic "Room 214" is noise, a canteen is a signpost. */
const LANDMARK_PRIORITY: Record<string, number> = {
  canteen: 5,
  'print-shop': 4,
  'female-prayer-room': 4,
  administration: 3,
  'male-washroom': 2,
  'female-washroom': 2,
  laboratory: 1,
};

function passedLandmark(
  from: Point,
  to: Point,
  floorId: string,
  segmentMetres: number,
  exclude: Set<string>
): { room: Room; side: 'left' | 'right' } | null {
  // Only worth naming something on a walk long enough for it to be a useful checkpoint.
  if (segmentMetres < 6) return null;

  const rooms = geometryByFloor.get(floorId)?.rooms ?? [];
  let best: { room: Room; side: 'left' | 'right'; score: number } | null = null;

  for (const room of rooms) {
    if (exclude.has(room.id)) continue;
    const priority = LANDMARK_PRIORITY[room.category];
    if (!priority) continue;

    const { distance: perpendicular, t } = projectOntoSegment(from, to, room.door);
    // Ignore doors right at either end — those belong to the turn, not the walk.
    if (perpendicular > PASS_RADIUS || t < 0.15 || t > 0.85) continue;

    const score = priority * 10 - perpendicular;
    if (!best || score > best.score) best = { room, side: sideOf(from, to, room.door), score };
  }

  return best ? { room: best.room, side: best.side } : null;
}

/* ------------------------------------------------------------------ */
/* Wording                                                             */
/* ------------------------------------------------------------------ */

function describeTurn(angle: number): { verb: string; icon: StepIcon } | null {
  const magnitude = Math.abs(angle);
  const right = angle > 0;
  if (magnitude < MIN_TURN_DEG) return null;
  if (magnitude < 60) return { verb: right ? 'Bear right' : 'Bear left', icon: right ? 'slight-right' : 'slight-left' };
  if (magnitude < 145) return { verb: right ? 'Turn right' : 'Turn left', icon: right ? 'right' : 'left' };
  return { verb: 'Turn around', icon: 'u-turn' };
}

const elevatorButton = (floorId: string) => (floorId === 'GF' ? 'G' : floorId.replace('F', ''));

function transitionText(t: RouteTransition): string {
  if (t.kind === 'elevator') {
    return `Take ${t.coreName} ${t.direction} to the ${t.toFloorName} — press ${elevatorButton(t.toFloorId)}.`;
  }
  const flights = t.floors === 1 ? 'one floor' : `${t.floors} floors`;
  return `Take ${t.coreName} ${t.direction} ${flights} to the ${t.toFloorName}.`;
}

/* ------------------------------------------------------------------ */
/* Step generation                                                     */
/* ------------------------------------------------------------------ */

function legSteps(
  leg: RouteLeg,
  legIndex: number,
  isFirstLeg: boolean,
  isLastLeg: boolean,
  route: Route,
  mentioned: Set<string>
): DirectionStep[] {
  const points: GraphNode[] = leg.nodes;
  if (points.length < 2) return [];

  const kept = simplifyIndices(points);
  const steps: DirectionStep[] = [];
  let previousBearing: number | null = null;

  for (let i = 0; i < kept.length - 1; i += 1) {
    const fromIndex = kept[i];
    const toIndex = kept[i + 1];
    const from = points[fromIndex];
    const to = points[toIndex];
    if (distance(from, to) < 0.3) continue;

    // Distance follows the real path, not the simplified straight line.
    const segmentMetres = unitsToMetres(pathLength(points, fromIndex, toIndex));
    const heading = bearing(from, to);
    const turn = previousBearing === null ? null : describeTurn(turnAngle(previousBearing, heading));
    const rounded = readableMetres(segmentMetres);

    let text: string;
    let icon: StepIcon;

    if (previousBearing === null) {
      // The only orientation cue available at the start of a walk is a compass bearing,
      // and the map shows a north arrow to make it usable.
      const heading8 = compassOf(heading);
      if (isFirstLeg && route.from.kind === 'room') {
        text = `Leave ${route.from.name} and head ${heading8} for ${rounded} m.`;
      } else if (isFirstLeg) {
        text = `Head ${heading8} for ${rounded} m.`;
      } else {
        text = `Head ${heading8} along the corridor for ${rounded} m.`;
      }
      icon = 'straight';
    } else if (turn) {
      text = `${turn.verb} and continue for ${rounded} m.`;
      icon = turn.icon;
    } else {
      text = `Continue straight for ${rounded} m.`;
      icon = 'straight';
    }

    const landmark = passedLandmark(from, to, leg.floorId, segmentMetres, mentioned);
    let detail: string | undefined;
    if (landmark) {
      mentioned.add(landmark.room.id);
      detail = `You'll pass ${landmark.room.name} on your ${landmark.side}.`;
    }

    steps.push({
      id: `${leg.floorId}-walk-${i}`,
      kind: 'walk',
      floorId: leg.floorId,
      text,
      detail,
      metres: segmentMetres,
      icon,
      points: points.slice(fromIndex, toIndex + 1).map(({ x, z }) => ({ x, z })),
      legIndex,
    });

    previousBearing = heading;
  }

  // Which side the destination door ends up on is the single most useful arrival cue.
  if (isLastLeg && steps.length > 0 && route.to.kind === 'room') {
    const last = points[points.length - 1];
    const beforeLast = points[Math.max(0, points.length - 2)];
    if (distance(beforeLast, last) > 1e-6) {
      const doorSide = sideOf(beforeLast, last, route.to.position);
      // The arrival cue is more useful than a landmark you pass on the way, so it wins
      // the one detail line the final step gets.
      steps[steps.length - 1].detail = `${route.to.name} will be on your ${doorSide}.`;
    }
  }

  return steps;
}

export function buildDirections(route: Route): DirectionStep[] {
  const steps: DirectionStep[] = [];
  const mentioned = new Set<string>([route.from.id, route.to.id]);

  steps.push({
    id: 'start',
    kind: 'start',
    floorId: route.from.floorId,
    text: `Start at ${route.from.name}.`,
    detail:
      route.from.kind === 'entrance'
        ? 'Step inside and face into the building.'
        : floorName(route.from.floorId),
    metres: 0,
    icon: 'start',
    points: [route.from.position],
    legIndex: 0,
  });

  route.legs.forEach((leg, legIndex) => {
    if (leg.arriveVia) {
      steps.push({
        id: `arrive-${leg.floorId}`,
        kind: 'floor-arrival',
        floorId: leg.floorId,
        text: `You're now on the ${leg.floorName}.`,
        detail:
          leg.arriveVia.kind === 'elevator'
            ? 'Step out of the lift and carry on.'
            : 'Leave the stairwell and carry on.',
        metres: 0,
        icon: 'flag',
        points: [{ x: leg.nodes[0].x, z: leg.nodes[0].z }],
        legIndex,
      });
    }

    steps.push(
      ...legSteps(leg, legIndex, legIndex === 0, legIndex === route.legs.length - 1, route, mentioned)
    );

    if (leg.departVia) {
      const t = leg.departVia;
      const last = leg.nodes[leg.nodes.length - 1];
      steps.push({
        id: `transition-${t.coreId}-${t.fromFloorId}`,
        kind: t.kind === 'elevator' ? 'elevator' : 'stairs',
        floorId: leg.floorId,
        text: transitionText(t),
        detail:
          t.kind === 'elevator'
            ? 'Wait for the doors, then continue when you arrive.'
            : `${t.floors === 1 ? 'One flight' : `${t.floors} flights`} ${t.direction}.`,
        metres: 0,
        icon: t.kind === 'elevator' ? 'elevator' : t.direction === 'up' ? 'stairs-up' : 'stairs-down',
        points: [{ x: last.x, z: last.z }],
        legIndex,
      });
    }
  });

  steps.push({
    id: 'arrive',
    kind: 'arrive',
    floorId: route.to.floorId,
    text: `You've arrived at ${route.to.name}.`,
    detail: `${route.to.subtitle} · ${BUILDING_NAME}`,
    metres: 0,
    icon: 'flag',
    points: [route.to.position],
    legIndex: Math.max(0, route.legs.length - 1),
  });

  return steps;
}

/** Compact one-line summary for cards and share text. */
export function routeSummary(route: Route): string {
  const parts = [`${Math.round(route.walkMetres)} m`, `≈ ${route.minutes} min`];
  if (route.transitions.length > 0) {
    const t = route.transitions[0];
    parts.push(t.kind === 'elevator' ? '1 lift ride' : `${t.floors} flight${t.floors > 1 ? 's' : ''} of stairs`);
  }
  return parts.join(' · ');
}
