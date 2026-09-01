/**
 * An exploded axonometric preview of the building, drawn from the same dataset the 2D
 * map uses — so the picture on the 3D-app card is the real building, not a stock image.
 *
 * Projection: a shallow isometric (x - z) / (x + z) with each floor lifted by a fixed
 * gap, which is the "stacked slabs" view the 3D app opens on. A real route is drawn
 * through the stack so the picture shows what the app is *for*, not just what it looks
 * like.
 */

import { useMemo } from 'react';
import { buildingInfo, floors, geometryByFloor } from '@/lib/navigation/data';
import { findRoute } from '@/lib/navigation/pathfinding';
import type { Bounds, Point } from '@/lib/navigation/types';

/** Shallow angle keeps the stack landscape-shaped rather than a tall tower. */
const ANGLE = (19 * Math.PI) / 180;
const COS = Math.cos(ANGLE);
const SIN = Math.sin(ANGLE);
/** Vertical separation between floor slabs, in projected units. */
const FLOOR_GAP = 15;
/** Apparent slab thickness. */
const THICKNESS = 1.5;

/** The route drawn through the preview — entrance E1 up to a lab on the second floor. */
const PREVIEW_ROUTE = { from: 'LM-ENT-E1', to: 'F2-R18' };

interface Projected {
  x: number;
  y: number;
}

const project = (x: number, z: number, level: number): Projected => ({
  x: (x - z) * COS,
  y: (x + z) * SIN - level * FLOOR_GAP,
});

const toPoints = (list: Projected[]) => list.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

/** A world-space rectangle becomes a parallelogram once projected. */
function rectPolygon(bounds: Bounds, level: number): string {
  return toPoints(
    (
      [
        [bounds.minX, bounds.minZ],
        [bounds.maxX, bounds.minZ],
        [bounds.maxX, bounds.maxZ],
        [bounds.minX, bounds.maxZ],
      ] as [number, number][]
    ).map(([x, z]) => project(x, z, level))
  );
}

const footprintProjected = (level: number, dy = 0) =>
  buildingInfo.footprint.map(([x, z]) => {
    const p = project(x, z, level);
    return { x: p.x, y: p.y + dy };
  });

/** Warm neutrals matched to the 3D app's own palette. */
const PALETTE = {
  slabTop: '#FBF6EC',
  slabEdge: '#8E7C60',
  slabLine: '#AD9C82',
  room: '#FFFFFF',
  roomLine: '#C2B49B',
  core: '#D8C7AA',
  route: '#FF6C0C',
  badge: '#6F5F45',
};

export default function BuildingIsometric({ className = '' }: { className?: string }) {
  const { viewBox, layers } = useMemo(() => {
    const ordered = [...floors].sort((a, b) => a.level - b.level);
    const route = findRoute(PREVIEW_ROUTE.from, PREVIEW_ROUTE.to);

    /** Extents accumulate as we build, so nothing can end up cropped. */
    const xs: number[] = [];
    const ys: number[] = [];
    const track = (p: Projected) => {
      xs.push(p.x);
      ys.push(p.y);
    };

    const layers = ordered.map((floor) => {
      const geometry = geometryByFloor.get(floor.id)!;
      const top = footprintProjected(floor.level);
      const under = footprintProjected(floor.level, THICKNESS);
      top.forEach(track);
      under.forEach(track);

      // The badge sits off the west corner of each slab.
      const badge = project(buildingInfo.footprint[0][0] - 2, buildingInfo.footprint[0][1] + 16, floor.level);
      track({ x: badge.x - 4, y: badge.y });

      const leg = route?.legs.find((l) => l.floorId === floor.id);
      const routePath = leg
        ? `M ${leg.nodes
            .map((n: Point) => {
              const p = project(n.x, n.z, floor.level);
              return `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
            })
            .join(' L ')}`
        : null;

      const endpoint =
        route && route.to.floorId === floor.id ? project(route.to.position.x, route.to.position.z, floor.level) : null;

      return {
        floor,
        top: toPoints(top),
        under: toPoints(under),
        rooms: geometry.rooms.map((room) => ({ id: room.id, points: rectPolygon(room.bounds, floor.level) })),
        cores: [...geometry.stairs, ...geometry.elevators].map((core) => ({
          id: `${floor.id}-${core.id}`,
          points: rectPolygon(core.bounds, floor.level),
        })),
        badge,
        routePath,
        endpoint,
      };
    });

    const pad = 7;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;

    return {
      viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
      // Draw the top floor first so lower slabs overlap it correctly, front to back.
      layers: layers.reverse(),
    };
  }, []);

  return (
    <svg
      viewBox={viewBox}
      className={className}
      role="img"
      aria-label="Exploded 3D view of the CS department block, all four floors stacked, with a route running from the entrance up to a second-floor lab"
    >
      <defs>
        <filter id="iso-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="2.4" stdDeviation="2" floodColor="#5A4A32" floodOpacity="0.22" />
        </filter>
      </defs>

      {layers.map(({ floor, top, under, rooms, cores, badge, routePath, endpoint }) => (
        <g key={floor.id}>
          {/* Slab thickness, then the top face. */}
          <polygon points={under} fill={PALETTE.slabEdge} filter="url(#iso-shadow)" />
          <polygon points={top} fill={PALETTE.slabTop} stroke={PALETTE.slabLine} strokeWidth="0.45" />

          {rooms.map((room) => (
            <polygon key={room.id} points={room.points} fill={PALETTE.room} stroke={PALETTE.roomLine} strokeWidth="0.35" />
          ))}
          {cores.map((core) => (
            <polygon key={core.id} points={core.points} fill={PALETTE.core} stroke={PALETTE.slabLine} strokeWidth="0.35" />
          ))}

          {routePath && (
            <>
              <path d={routePath} fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <path
                d={routePath}
                fill="none"
                stroke={PALETTE.route}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
          {endpoint && (
            <>
              <circle cx={endpoint.x} cy={endpoint.y} r="3.4" fill={PALETTE.route} opacity="0.2" />
              <circle cx={endpoint.x} cy={endpoint.y} r="1.7" fill="#FFFFFF" stroke={PALETTE.route} strokeWidth="1.1" />
            </>
          )}

          <text
            x={badge.x - 4}
            y={badge.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="5"
            fill={PALETTE.badge}
            className="font-mono font-bold"
          >
            {floor.badge}
          </text>
        </g>
      ))}
    </svg>
  );
}
