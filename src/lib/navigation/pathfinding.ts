/**
 * Shortest-path routing over the building graph.
 *
 * Dijkstra with a binary heap. The graph is small (271 nodes / 283 edges) so this runs
 * in well under a millisecond — no need for A*, and no heuristic to get wrong.
 *
 * The result is not just a node list: it is split into one *leg per floor* with the
 * vertical transition that joins them, which is what the multi-floor UI is built around.
 */

import {
  adjacency,
  coreIdFromNode,
  estimateMinutes,
  floorLevel,
  floorName,
  nodeById,
  placeById,
  roomById,
  unitsToMetres,
  verticalCoreById,
} from './data';
import type { GraphNode, Place, Point } from './types';

export interface RouteTransition {
  kind: 'stairs' | 'elevator';
  /** Shaft id shared across floors, e.g. "S2" or "L1". */
  coreId: string;
  coreName: string;
  fromFloorId: string;
  toFloorId: string;
  fromFloorName: string;
  toFloorName: string;
  direction: 'up' | 'down';
  /** Number of floors travelled, always ≥ 1. */
  floors: number;
}

export interface RouteLeg {
  floorId: string;
  floorName: string;
  /** The walk on this floor, in order. Always ≥ 1 node. */
  nodes: GraphNode[];
  /** Horizontal distance walked on this floor, in world units. */
  distanceUnits: number;
  /** How you arrived on this floor — null for the first leg. */
  arriveVia: RouteTransition | null;
  /** How you leave this floor — null for the last leg. */
  departVia: RouteTransition | null;
}

export interface Route {
  from: Place;
  to: Place;
  /** Every node on the path, across all floors. */
  nodes: GraphNode[];
  legs: RouteLeg[];
  transitions: RouteTransition[];
  /** Horizontal walking distance only — vertical edge weights are penalties, not metres. */
  walkUnits: number;
  walkMetres: number;
  minutes: number;
  mode: TravelMode;
  /** Floors the route passes through, in travel order. */
  floorIds: string[];
}

/* ------------------------------------------------------------------ */
/* Binary min-heap keyed by cost                                       */
/* ------------------------------------------------------------------ */

class MinHeap {
  private ids: string[] = [];
  private costs: number[] = [];

  get size() {
    return this.ids.length;
  }

  push(id: string, cost: number) {
    this.ids.push(id);
    this.costs.push(cost);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent] <= this.costs[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): string | undefined {
    if (this.ids.length === 0) return undefined;
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastCost = this.costs.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.costs[0] = lastCost;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.costs.length && this.costs[left] < this.costs[smallest]) smallest = left;
        if (right < this.costs.length && this.costs[right] < this.costs[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]];
  }
}

/* ------------------------------------------------------------------ */
/* Core search                                                         */
/* ------------------------------------------------------------------ */

/**
 * How the walker changes floors.
 *
 * There is deliberately no "let the router decide" mode. With the realistic cost model in
 * data.ts, stairs beat the lift on every room-to-room journey in this four-storey block
 * (measured: the lift only ever wins when the lift *is* the destination), so an automatic
 * mode would be indistinguishable from `stairs` while pretending to be smarter. Both
 * options here are hard constraints instead, because "I'd rather not wait for the lift"
 * and "I can't use stairs" are both real and neither should be overrulable.
 */
export type TravelMode = 'stairs' | 'lift';

export const DEFAULT_TRAVEL_MODE: TravelMode = 'stairs';

export interface RouteOptions {
  mode?: TravelMode;
}

/** Edge type this mode refuses to use. */
const blockedType = (mode: TravelMode) => (mode === 'lift' ? 'stairs' : 'elevator');

/** Raw shortest path between two graph nodes, or null when unreachable. */
export function findNodePath(
  startNodeId: string,
  goalNodeId: string,
  { mode = DEFAULT_TRAVEL_MODE }: RouteOptions = {}
): string[] | null {
  if (!nodeById.has(startNodeId) || !nodeById.has(goalNodeId)) return null;
  if (startNodeId === goalNodeId) return [startNodeId];

  const blocked = blockedType(mode);

  const dist = new Map<string, number>([[startNodeId, 0]]);
  const prev = new Map<string, string>();
  const settled = new Set<string>();
  const queue = new MinHeap();
  queue.push(startNodeId, 0);

  while (queue.size > 0) {
    const current = queue.pop()!;
    if (settled.has(current)) continue;
    settled.add(current);
    if (current === goalNodeId) break;

    const currentCost = dist.get(current)!;
    for (const edge of adjacency.get(current) ?? []) {
      if (edge.type === blocked) continue;
      const next = currentCost + edge.cost;
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        prev.set(edge.to, current);
        queue.push(edge.to, next);
      }
    }
  }

  if (!dist.has(goalNodeId)) return null;

  const path = [goalNodeId];
  while (prev.has(path[0])) path.unshift(prev.get(path[0])!);
  return path;
}

/* ------------------------------------------------------------------ */
/* Route assembly                                                      */
/* ------------------------------------------------------------------ */

function buildTransition(from: GraphNode, to: GraphNode): RouteTransition {
  const coreId = coreIdFromNode(from.id) ?? coreIdFromNode(to.id) ?? '?';
  const core = verticalCoreById.get(coreId);
  const kind: 'stairs' | 'elevator' = from.kind === 'elevator' ? 'elevator' : 'stairs';
  const fromLevel = floorLevel(from.floorId);
  const toLevel = floorLevel(to.floorId);

  return {
    kind,
    coreId,
    coreName: core?.name ?? (kind === 'elevator' ? `Elevator ${coreId}` : `Staircase ${coreId}`),
    fromFloorId: from.floorId,
    toFloorId: to.floorId,
    fromFloorName: floorName(from.floorId),
    toFloorName: floorName(to.floorId),
    direction: toLevel > fromLevel ? 'up' : 'down',
    floors: Math.abs(toLevel - fromLevel),
  };
}

/**
 * Consecutive rides in the same shaft (GF→F1→F2) are one user-facing action:
 * "take the lift to the Second Floor", not two separate steps.
 */
function mergeTransitions(list: RouteTransition[]): RouteTransition[] {
  const merged: RouteTransition[] = [];
  for (const t of list) {
    const last = merged[merged.length - 1];
    if (last && last.coreId === t.coreId && last.toFloorId === t.fromFloorId && last.direction === t.direction) {
      merged[merged.length - 1] = {
        ...last,
        toFloorId: t.toFloorId,
        toFloorName: t.toFloorName,
        floors: last.floors + t.floors,
      };
    } else {
      merged.push(t);
    }
  }
  return merged;
}

const horizontalDistance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.z - a.z);

/**
 * Turn a node path into legs. A leg ends whenever the next node sits on another floor;
 * the pair that straddles the change becomes the transition joining the two legs.
 */
function buildLegs(nodes: GraphNode[]): { legs: RouteLeg[]; transitions: RouteTransition[]; walkUnits: number } {
  const legs: RouteLeg[] = [];
  const rawTransitions: RouteTransition[] = [];
  let walkUnits = 0;

  let current: GraphNode[] = [nodes[0]];

  for (let i = 1; i < nodes.length; i += 1) {
    const prev = nodes[i - 1];
    const node = nodes[i];

    if (node.floorId === prev.floorId) {
      walkUnits += horizontalDistance(prev, node);
      current.push(node);
      continue;
    }

    // Floor change: close the current leg and open the next one.
    rawTransitions.push(buildTransition(prev, node));
    legs.push({
      floorId: prev.floorId,
      floorName: floorName(prev.floorId),
      nodes: current,
      distanceUnits: 0,
      arriveVia: null,
      departVia: null,
    });
    current = [node];
  }
  legs.push({
    floorId: current[0].floorId,
    floorName: floorName(current[0].floorId),
    nodes: current,
    distanceUnits: 0,
    arriveVia: null,
    departVia: null,
  });

  // A merged transition spans several raw floor hops, so re-attach after merging:
  // legs produced by intermediate hops (a lift passing a floor) carry no walking and
  // are folded away here.
  const transitions = mergeTransitions(rawTransitions);
  const keptLegs: RouteLeg[] = [];
  for (const leg of legs) {
    // A pass-through floor has a single node and no walking — drop it.
    if (leg.nodes.length === 1 && keptLegs.length > 0 && !transitions.some((t) => t.fromFloorId === leg.floorId)) {
      continue;
    }
    leg.distanceUnits = leg.nodes.reduce(
      (sum, node, i) => (i === 0 ? 0 : sum + horizontalDistance(leg.nodes[i - 1], node)),
      0
    );
    keptLegs.push(leg);
  }

  keptLegs.forEach((leg, i) => {
    leg.departVia = transitions.find((t) => t.fromFloorId === leg.floorId) ?? null;
    leg.arriveVia = i === 0 ? null : (transitions.find((t) => t.toFloorId === leg.floorId) ?? null);
  });

  return { legs: keptLegs, transitions, walkUnits };
}

/**
 * Rooms are routed to via their door node, which sits *on* the room boundary. Extend the
 * drawn path a little way past the door into the room so the line visibly terminates
 * inside its destination rather than stopping at a wall.
 */
function roomStub(place: Place, doorNode: GraphNode): GraphNode | null {
  if (place.kind !== 'room') return null;
  const room = roomById.get(place.id);
  if (!room) return null;

  // Step 1.2 units along the inward normal, but never past the room centre.
  const inward = { x: -room.doorNormal.x, z: -room.doorNormal.z };
  const toCentre = horizontalDistance(room.door, room.centre);
  const step = Math.min(1.2, Math.max(0.4, toCentre * 0.55));

  return {
    id: `${place.id}-INSIDE`,
    floorId: place.floorId,
    x: doorNode.x + inward.x * step,
    z: doorNode.z + inward.z * step,
    kind: 'door',
    label: place.name,
  };
}

/** Full route between two places, or null when no path exists under the given options. */
export function findRoute(fromId: string, toId: string, options: RouteOptions = {}): Route | null {
  const from = placeById.get(fromId);
  const to = placeById.get(toId);
  if (!from || !to) return null;

  const nodeIds = findNodePath(from.nodeId, to.nodeId, options);
  if (!nodeIds || nodeIds.length === 0) return null;

  const nodes = nodeIds.map((id) => nodeById.get(id)!);

  // Draw the last few centimetres into the destination room.
  const stub = roomStub(to, nodes[nodes.length - 1]);
  if (stub) nodes.push(stub);

  const { legs, transitions, walkUnits } = buildLegs(nodes);
  const viaElevator = transitions.some((t) => t.kind === 'elevator');
  const floorChanges = transitions.reduce((sum, t) => sum + t.floors, 0);

  return {
    from,
    to,
    nodes,
    legs,
    transitions,
    walkUnits,
    walkMetres: unitsToMetres(walkUnits),
    minutes: estimateMinutes(walkUnits, floorChanges, viaElevator),
    mode: options.mode ?? DEFAULT_TRAVEL_MODE,
    floorIds: legs.map((l) => l.floorId),
  };
}

/**
 * Nearest place of a given category from a starting point, by actual walking distance
 * rather than straight-line — powers "nearest washroom / stairs / canteen".
 */
export function findNearest(
  fromId: string,
  matches: (place: Place) => boolean,
  options: RouteOptions = {}
): Route | null {
  const from = placeById.get(fromId);
  if (!from) return null;

  let best: Route | null = null;
  for (const candidate of placeById.values()) {
    if (candidate.id === from.id || !matches(candidate)) continue;
    const route = findRoute(from.id, candidate.id, options);
    if (!route) continue;
    // Compare on estimated time so a same-floor walk beats a shorter walk two floors up.
    if (!best || route.minutes < best.minutes || (route.minutes === best.minutes && route.walkUnits < best.walkUnits)) {
      best = route;
    }
  }
  return best;
}
