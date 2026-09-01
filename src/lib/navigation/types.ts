/**
 * Types for the `cs-navigator-2d` building dataset (src/data/navigation/building.json).
 *
 * Coordinate system (straight from the dataset):
 *   x — west → east
 *   z — south → north
 *   origin at the building's south-west corner, 1 unit = `units.metresPerUnit` metres.
 *
 * SVG has y growing downward, so every renderer flips z (see `lib/navigation/geometry.ts`)
 * to keep north at the top of the map.
 */

export interface Point {
  x: number;
  z: number;
}

export interface Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  width: number;
  depth: number;
}

export interface BuildingFloor {
  id: string;
  name: string;
  shortName: string;
  level: number;
}

export interface Building {
  id: string;
  name: string;
  width: number;
  depth: number;
  /** Outline polygon as [x, z] pairs, shared by every floor. */
  footprint: [number, number][];
  floorHeight: number;
}

/** A rectangular walkable slab. `floorId: '*'` means "present on every floor". */
export interface Corridor {
  floorId: string;
  bounds: Bounds;
}

/** An opening cut through the upper floors (e.g. the atrium above the ground floor). */
export interface BuildingVoid {
  label: string;
  bounds: Bounds;
}

export type RoomCategory =
  | 'classroom'
  | 'laboratory'
  | 'administration'
  | 'canteen'
  | 'print-shop'
  | 'male-washroom'
  | 'female-washroom'
  | 'female-prayer-room'
  | 'unclassified';

export interface Room {
  id: string;
  name: string;
  shortName: string;
  category: RoomCategory;
  floorId: string;
  bounds: Bounds;
  centre: Point;
  /** Point on the room boundary where the door sits. */
  door: Point;
  /** Unit vector pointing out of the room, into the corridor. */
  doorNormal: Point;
  /** Graph node to route to/from for this room. */
  nodeId: string;
  aliases: string[];
  isPublic: boolean;
}

export interface Entrance {
  id: string;
  name: string;
  floorId: string;
  wall: 'north' | 'south' | 'east' | 'west';
  doorCentre: Point;
  outsidePosition: Point;
  insidePosition: Point;
}

/** A staircase or elevator shaft; occupies the same footprint on every floor it serves. */
export interface VerticalCore {
  id: string;
  name: string;
  kind: 'stairs' | 'elevator';
  floorIds: string[];
  bounds: Bounds;
}

export type LandmarkCategory = 'entrance' | 'stairs' | 'elevator';

export interface Landmark {
  id: string;
  name: string;
  category: LandmarkCategory;
  floorId: string;
  position: Point;
  nearestNodeId: string;
  aliases: string[];
}

export type NodeKind = 'corridor' | 'door' | 'stair' | 'elevator' | 'entrance';

export interface GraphNode {
  id: string;
  floorId: string;
  x: number;
  z: number;
  kind: NodeKind;
  label: string | null;
}

export type EdgeType = 'corridor' | 'stairs' | 'elevator';

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  bidirectional: boolean;
  /** Edge weight, in the same units as node coordinates. */
  distance: number;
  type: EdgeType;
  enabled: boolean;
  accessible: boolean;
}

export interface BuildingData {
  format: string;
  version: number;
  units: { metresPerUnit: number; note: string };
  building: Building;
  floors: BuildingFloor[];
  corridors: Corridor[];
  voids: BuildingVoid[];
  rooms: Room[];
  entrances: Entrance[];
  stairs: VerticalCore[];
  elevators: VerticalCore[];
  landmarks: Landmark[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
}

/* ------------------------------------------------------------------ */
/* Derived types used across the navigation UI                         */
/* ------------------------------------------------------------------ */

/** Anything a user can pick as a start or destination. */
export type PlaceKind = 'room' | 'entrance' | 'stairs' | 'elevator';

export interface Place {
  /** Stable id used in URLs — room id, entrance id or landmark id. */
  id: string;
  name: string;
  kind: PlaceKind;
  /** Room category, or the landmark kind for non-rooms. */
  category: RoomCategory | LandmarkCategory;
  floorId: string;
  floorName: string;
  /** Graph node used for routing. */
  nodeId: string;
  /** Where to drop the marker on the map. */
  position: Point;
  /** Extra strings the search should match on (room codes, "S2", "lift", …). */
  keywords: string[];
  /** Short human descriptor, e.g. "Lab · Second Floor". */
  subtitle: string;
  /**
   * The dataset has nine rooms called "Studio" on the third floor and a pair of
   * washrooms per floor. When `ambiguous` is set the UI must show `code` and `zone`
   * alongside the name, or the two are impossible to tell apart in a list.
   */
  ambiguous: boolean;
  /** Unique room/landmark identifier, e.g. "F3-R03". */
  code: string;
  /** Coarse position hint, e.g. "North-west corner". */
  zone: string;
}
