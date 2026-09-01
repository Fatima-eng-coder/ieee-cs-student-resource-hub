/**
 * Loads the building dataset once and derives every index the navigation UI needs:
 * floors, per-floor geometry, the routing adjacency list and the searchable place list.
 *
 * Everything here is computed at module load — the dataset is static, so there is no
 * reason to recompute per render. The whole module is only pulled in by the lazily
 * loaded navigation route, so it never lands in the main bundle.
 */

import raw from '@/data/navigation/building.json';
import type {
  BuildingData,
  BuildingFloor,
  Corridor,
  EdgeType,
  GraphEdge,
  GraphNode,
  Landmark,
  Place,
  PlaceKind,
  Point,
  Room,
  RoomCategory,
  VerticalCore,
} from './types';

/** The whole dataset. `dataset.building` is the building envelope itself. */
export const dataset = raw as unknown as BuildingData;

/** Building envelope — footprint, extents, floor height. */
export const buildingInfo = dataset.building;

/**
 * The dataset ships with the placeholder name "My Building"; the UI should never
 * show that, so give it the real one here.
 */
export const BUILDING_NAME = 'CS Department Block';

export const METRES_PER_UNIT = dataset.units.metresPerUnit;

/** Average walking pace used for the "≈ N min" estimate, in metres per second. */
const WALK_SPEED_MPS = 1.25;
/** Flat penalty added per floor change, roughly the time to climb/wait, in seconds. */
const STAIR_SECONDS_PER_FLOOR = 22;
const ELEVATOR_SECONDS_PER_FLOOR = 30;

export const unitsToMetres = (units: number) => units * METRES_PER_UNIT;

/* ------------------------------------------------------------------ */
/* Floors                                                              */
/* ------------------------------------------------------------------ */

/**
 * The dataset labels the upper floors "Floor 2" / "Floor 3" while the lower two are
 * "Ground Floor" / "First Floor". Normalise so the UI reads consistently.
 */
const FLOOR_DISPLAY_NAMES: Record<string, string> = {
  GF: 'Ground Floor',
  F1: 'First Floor',
  F2: 'Second Floor',
  F3: 'Third Floor',
};

export interface Floor extends BuildingFloor {
  /** Normalised display name. */
  label: string;
  /** One or two characters for the floor rail: G, 1, 2, 3. */
  badge: string;
}

export const floors: Floor[] = [...dataset.floors]
  .sort((a, b) => a.level - b.level)
  .map((f) => ({
    ...f,
    label: FLOOR_DISPLAY_NAMES[f.id] ?? f.name,
    badge: f.shortName,
  }));

/** Floors top-down, which is how a vertical floor rail should read. */
export const floorsDescending: Floor[] = [...floors].reverse();

export const floorById = new Map(floors.map((f) => [f.id, f]));

export const floorName = (floorId: string) => floorById.get(floorId)?.label ?? floorId;
export const floorLevel = (floorId: string) => floorById.get(floorId)?.level ?? 0;
export const defaultFloorId = floors[0]?.id ?? 'GF';

/* ------------------------------------------------------------------ */
/* Per-floor geometry                                                  */
/* ------------------------------------------------------------------ */

export interface FloorGeometry {
  floor: Floor;
  rooms: Room[];
  corridors: Corridor[];
  /** Openings to punch out of the slab — the atrium exists above the ground floor only. */
  voids: BuildingData['voids'];
  stairs: VerticalCore[];
  elevators: VerticalCore[];
  entrances: BuildingData['entrances'];
  landmarks: Landmark[];
}

const onFloor = (floorId: string) => (c: { floorId: string }) => c.floorId === floorId || c.floorId === '*';

export const geometryByFloor = new Map<string, FloorGeometry>(
  floors.map((floor) => [
    floor.id,
    {
      floor,
      rooms: dataset.rooms.filter((r) => r.floorId === floor.id),
      corridors: dataset.corridors.filter(onFloor(floor.id)),
      // The atrium is open from the first floor up; on the ground floor it is solid slab.
      voids: floor.level > 0 ? dataset.voids : [],
      stairs: dataset.stairs.filter((s) => s.floorIds.includes(floor.id)),
      elevators: dataset.elevators.filter((s) => s.floorIds.includes(floor.id)),
      entrances: dataset.entrances.filter((e) => e.floorId === floor.id),
      landmarks: dataset.landmarks.filter((l) => l.floorId === floor.id),
    },
  ])
);

export const getFloorGeometry = (floorId: string): FloorGeometry =>
  geometryByFloor.get(floorId) ?? geometryByFloor.get(defaultFloorId)!;

/* ------------------------------------------------------------------ */
/* Routing graph                                                       */
/* ------------------------------------------------------------------ */

export const nodeById = new Map<string, GraphNode>(dataset.graph.nodes.map((n) => [n.id, n]));

export interface AdjacentEdge {
  to: string;
  /**
   * Search cost in *walk-equivalent units* (1 unit ≈ 0.4 s at 1.25 m/s). This is NOT a
   * distance — see the cost model below. Real distances are always measured from node
   * geometry, never from this number.
   */
  cost: number;
  type: EdgeType;
  accessible: boolean;
  edgeId: string;
}

/* ---- Vertical cost model -------------------------------------------------
 *
 * The dataset weights a lift floor at 4 and a stair flight at 12–21, so the shortest
 * path is *always* the lift — which is wrong for a four-storey block where waiting for
 * one lift takes longer than walking up two flights.
 *
 * These costs are in walk-equivalent units, so they are directly comparable to corridor
 * distances. The lift's call-and-wait cost is charged on the corridor edge that enters
 * the lift node (each lift node has exactly one corridor neighbour, so entering it always
 * means riding), which bills the wait once per ride rather than once per floor.
 *
 * The result, per journey:
 *   1 floor  — stairs 42 vs lift 88   → stairs
 *   2 floors — stairs 84 vs lift 106  → stairs
 *   3 floors — stairs 126 vs lift 124 → lift
 */

/** One flight of stairs, ≈17 s. */
const STAIRS_FLOOR_COST = 42;
/** One floor of lift travel once you are inside, ≈7 s. */
const ELEVATOR_FLOOR_COST = 18;
/** Pressing the button and waiting for the doors, ≈28 s. Charged once per ride. */
const ELEVATOR_CALL_COST = 70;

function edgeCost(edge: GraphEdge): number {
  if (edge.type === 'stairs') return STAIRS_FLOOR_COST;
  if (edge.type === 'elevator') return ELEVATOR_FLOOR_COST;

  // Corridor edge. Approaching a lift means committing to the wait.
  const entersLift = nodeKindOf(edge.to) === 'elevator' || nodeKindOf(edge.from) === 'elevator';
  return entersLift ? edge.distance + ELEVATOR_CALL_COST : edge.distance;
}

const nodeKindLookup = new Map(dataset.graph.nodes.map((n) => [n.id, n.kind]));
function nodeKindOf(id: string) {
  return nodeKindLookup.get(id);
}

/** Undirected adjacency list; disabled edges are dropped, one-way edges kept one-way. */
export const adjacency = (() => {
  const map = new Map<string, AdjacentEdge[]>(dataset.graph.nodes.map((n) => [n.id, []]));
  const link = (from: string, edge: AdjacentEdge) => map.get(from)?.push(edge);

  for (const e of dataset.graph.edges as GraphEdge[]) {
    if (e.enabled === false) continue;
    const cost = edgeCost(e);
    link(e.from, { to: e.to, cost, type: e.type, accessible: e.accessible, edgeId: e.id });
    if (e.bidirectional !== false) {
      link(e.to, { to: e.from, cost, type: e.type, accessible: e.accessible, edgeId: e.id });
    }
  }
  return map;
})();

/* ------------------------------------------------------------------ */
/* Vertical cores (stairs + elevators), keyed by the shared shaft id    */
/* ------------------------------------------------------------------ */

export const verticalCores: VerticalCore[] = [...dataset.stairs, ...dataset.elevators];
export const verticalCoreById = new Map(verticalCores.map((c) => [c.id, c]));

/** "GF-STAIR-S2" → "S2", "F1-LIFT-L1" → "L1". Used to name a transition in directions. */
export function coreIdFromNode(nodeId: string): string | null {
  const match = /^(?:GF|F\d)-(?:STAIR|LIFT)-(.+)$/.exec(nodeId);
  return match ? match[1] : null;
}

/* ------------------------------------------------------------------ */
/* Categories — labels, icons and map colours                          */
/* ------------------------------------------------------------------ */

export interface CategoryMeta {
  label: string;
  /** Plural label used for filter chips. */
  plural: string;
  /** Key into the shared navigation icon set (components/navigation/NavIcon.tsx). */
  icon: string;
  /** Tailwind-ish hex pair for the map: fill and stroke/text. */
  fill: string;
  stroke: string;
  /** Text colour for the room label drawn on the map. */
  text: string;
  /** Tailwind classes for chips/list rows in the panel. */
  chip: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  classroom: {
    label: 'Classroom',
    plural: 'Classrooms',
    icon: 'classroom',
    fill: '#EEF2FF',
    stroke: '#C7D2FE',
    text: '#4338CA',
    chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  },
  laboratory: {
    label: 'Lab',
    plural: 'Labs',
    icon: 'lab',
    fill: '#FEF3E2',
    stroke: '#FBD9A5',
    text: '#B45309',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  administration: {
    label: 'Office',
    plural: 'Offices',
    icon: 'office',
    fill: '#F1F5F9',
    stroke: '#CBD5E1',
    text: '#475569',
    chip: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
  canteen: {
    label: 'Canteen',
    plural: 'Canteens',
    icon: 'canteen',
    fill: '#FEF2F2',
    stroke: '#FECACA',
    text: '#B91C1C',
    chip: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  'print-shop': {
    label: 'Print shop',
    plural: 'Print shops',
    icon: 'print',
    fill: '#F5F3FF',
    stroke: '#DDD6FE',
    text: '#6D28D9',
    chip: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  'male-washroom': {
    label: 'Male washroom',
    plural: 'Washrooms',
    icon: 'washroom-male',
    fill: '#ECFEFF',
    stroke: '#A5F3FC',
    text: '#0E7490',
    chip: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  },
  'female-washroom': {
    label: 'Female washroom',
    plural: 'Washrooms',
    icon: 'washroom-female',
    fill: '#FDF2F8',
    stroke: '#FBCFE8',
    text: '#BE185D',
    chip: 'bg-pink-50 text-pink-700 ring-pink-200',
  },
  'female-prayer-room': {
    label: 'Prayer room',
    plural: 'Prayer rooms',
    icon: 'prayer',
    fill: '#ECFDF5',
    stroke: '#A7F3D0',
    text: '#047857',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  unclassified: {
    label: 'Room',
    plural: 'Other rooms',
    icon: 'room',
    fill: '#F8FAFC',
    stroke: '#E2E8F0',
    text: '#64748B',
    chip: 'bg-slate-100 text-slate-600 ring-slate-200',
  },
  entrance: {
    label: 'Entrance',
    plural: 'Entrances',
    icon: 'entrance',
    fill: '#ECFDF5',
    stroke: '#6EE7B7',
    text: '#047857',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  stairs: {
    label: 'Staircase',
    plural: 'Staircases',
    icon: 'stairs',
    fill: '#F1F5F9',
    stroke: '#94A3B8',
    text: '#334155',
    chip: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
  elevator: {
    label: 'Elevator',
    plural: 'Elevators',
    icon: 'elevator',
    fill: '#F1F5F9',
    stroke: '#94A3B8',
    text: '#334155',
    chip: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
};

export const categoryMeta = (category: string): CategoryMeta =>
  CATEGORY_META[category] ?? CATEGORY_META.unclassified;

/* ------------------------------------------------------------------ */
/* Places — the unified searchable list                                */
/* ------------------------------------------------------------------ */

/**
 * Display names for the handful of rooms whose surveyed name reads badly on a map.
 *
 * The raw name is kept in the search keywords, so nothing becomes unfindable — this only
 * changes what is printed. "Unclassified" means the survey never recorded a use for the
 * room, and saying so plainly invites the correction the beta is asking for; a room code
 * would just look like a typo.
 */
const DISPLAY_NAMES: Record<string, string> = {
  'fyp lab': 'FYP Lab',
  'fyp-unclassified': 'FYP Lab',
  unclassified: 'Unnamed room',
  'female washrooms': 'Female Washrooms',
  'male washrooms': 'Male Washrooms',
  'female washroom': 'Female Washrooms',
  'male washroom': 'Male Washrooms',
  'print shop': 'Print Shop',
  'front office area': 'Front Office',
  'admin/conference room': 'Admin / Conference',
  'high end computing lab': 'High End Computing Lab',
};

/** The name to print. Falls back to the surveyed name unchanged. */
export const displayName = (raw: string) => DISPLAY_NAMES[raw.trim().toLowerCase()] ?? raw;

/**
 * Coarse "where in the building" hint. The plan is a long east-west block with a
 * north wing at the west end, so an x band plus a z band names any spot well enough
 * to tell two same-named rooms apart at a glance.
 */
function zoneOf(position: Point): string {
  const easting = position.x < 30 ? 'West' : position.x > 50 ? 'East' : 'Central';
  const northing = position.z > 26 ? 'north' : position.z < 12 ? 'south' : '';

  if (!northing) return easting === 'Central' ? 'Centre of the block' : `${easting} wing`;
  if (easting === 'Central') return `${northing === 'north' ? 'North' : 'South'} side`;
  return `${northing === 'north' ? 'North' : 'South'}-${easting.toLowerCase()} corner`;
}

/**
 * Names repeat within a floor (nine "Studio"s on F3), so flag those for the UI. Grouped
 * on the *display* name, since normalising "FYP-Unclassified" to "FYP Lab" creates a
 * collision with the FYP labs beside it that the UI then has to disambiguate.
 */
const duplicateNameKeys = (() => {
  const counts = new Map<string, number>();
  for (const room of dataset.rooms) {
    const key = `${room.floorId}|${displayName(room.name).toLowerCase()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([key]) => key));
})();

/** Floor aliases so "floor 2", "2nd floor" and "f2" all list that floor's places. */
function floorKeywords(floorId: string): string[] {
  const floor = floorById.get(floorId);
  if (!floor) return [];
  const level = floor.level;
  return [floorId, floor.label, `floor ${level}`, `${level}f`, level === 0 ? 'ground' : `${level}`];
}

function roomToPlace(room: Room): Place {
  const meta = categoryMeta(room.category);
  const label = displayName(room.name);
  const ambiguous = duplicateNameKeys.has(`${room.floorId}|${label.toLowerCase()}`);

  return {
    id: room.id,
    name: label,
    kind: 'room',
    category: room.category as RoomCategory,
    floorId: room.floorId,
    floorName: floorName(room.floorId),
    nodeId: room.nodeId,
    position: room.centre,
    keywords: [
      room.id,
      room.name,
      room.shortName,
      ...room.aliases,
      meta.label,
      meta.plural,
      ...floorKeywords(room.floorId),
    ],
    subtitle: `${meta.label} · ${floorName(room.floorId)}`,
    ambiguous,
    code: room.id,
    zone: zoneOf(room.centre),
  };
}

/**
 * The dataset files every non-entrance landmark under `category: 'stairs'`, including the
 * elevator. Recover the real kind from the node id so lifts get lift wording and icons.
 */
function landmarkKind(landmark: Landmark): Exclude<PlaceKind, 'room'> {
  if (landmark.category === 'entrance') return 'entrance';
  return landmark.nearestNodeId.includes('LIFT') ? 'elevator' : 'stairs';
}

function landmarkToPlace(landmark: Landmark): Place {
  const kind = landmarkKind(landmark);
  const meta = categoryMeta(kind);
  const core = coreIdFromNode(landmark.nearestNodeId);
  const extraKeywords =
    kind === 'elevator'
      ? ['lift', 'elevator', 'accessible', 'wheelchair', 'step free']
      : kind === 'stairs'
        ? ['stairs', 'staircase', 'steps']
        : ['entrance', 'door', 'gate', 'exit', 'way in'];

  return {
    // "Staircase S2 (Ground Floor)" → "Staircase S2"; the floor is shown in the subtitle.
    id: landmark.id,
    name: landmark.name.replace(/\s*\([^)]*\)\s*$/, ''),
    kind,
    category: kind,
    floorId: landmark.floorId,
    floorName: floorName(landmark.floorId),
    nodeId: landmark.nearestNodeId,
    position: landmark.position,
    keywords: [...landmark.aliases, ...(core ? [core] : []), ...extraKeywords, ...floorKeywords(landmark.floorId)],
    subtitle: kind === 'entrance' ? 'Building entrance' : `${meta.label} · ${floorName(landmark.floorId)}`,
    ambiguous: false,
    code: core ?? landmark.id,
    zone: zoneOf(landmark.position),
  };
}

export const places: Place[] = [
  ...dataset.rooms.map(roomToPlace),
  ...dataset.landmarks.map(landmarkToPlace),
];

export const placeById = new Map(places.map((p) => [p.id, p]));
export const placeByNodeId = new Map(places.map((p) => [p.nodeId, p]));

export const roomById = new Map(dataset.rooms.map((r) => [r.id, r]));

/** Places grouped by floor, sorted by name — powers the "browse this floor" list. */
export const placesByFloor = new Map<string, Place[]>(
  floors.map((f) => [
    f.id,
    places
      .filter((p) => p.floorId === f.id)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  ])
);

/* ------------------------------------------------------------------ */
/* Time estimate                                                       */
/* ------------------------------------------------------------------ */

export function estimateMinutes(walkUnits: number, floorChanges: number, viaElevator: boolean): number {
  const walkSeconds = unitsToMetres(walkUnits) / WALK_SPEED_MPS;
  const verticalSeconds =
    floorChanges * (viaElevator ? ELEVATOR_SECONDS_PER_FLOOR : STAIR_SECONDS_PER_FLOOR);
  return Math.max(1, Math.round((walkSeconds + verticalSeconds) / 60));
}
