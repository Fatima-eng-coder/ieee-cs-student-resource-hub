/**
 * Floor switcher.
 *
 * The important job here is not switching floors — it is telling you, before you tap
 * anything, *which* floors your route touches and in what order. A route that crosses
 * three floors is the case people get lost in, so each floor button carries its leg
 * number, and the connectors between buttons show where the stairs or lift are used.
 */

import { motion } from 'framer-motion';
import { ChevronsUpDown, Accessibility } from 'lucide-react';
import { floorsDescending } from '@/lib/navigation/data';
import type { Route } from '@/lib/navigation/pathfinding';

interface FloorRailProps {
  activeFloorId: string;
  onChange: (floorId: string) => void;
  route: Route | null;
  /** Horizontal pill row for mobile, vertical rail for desktop. */
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export default function FloorRail({
  activeFloorId,
  onChange,
  route,
  orientation = 'vertical',
  className = '',
}: FloorRailProps) {
  const legIndexByFloor = new Map(route?.legs.map((leg, i) => [leg.floorId, i + 1]) ?? []);

  /** The transition that *leaves* a floor, so it can be drawn under that floor's button. */
  const transitionFrom = new Map(route?.transitions.map((t) => [t.fromFloorId, t]) ?? []);

  const vertical = orientation === 'vertical';

  return (
    <div
      className={`flex ${vertical ? 'flex-col' : 'flex-row-reverse'} items-center gap-0.5 rounded-2xl bg-white/90 p-1 shadow-sm ring-1 ring-black/5 backdrop-blur sm:gap-1 sm:p-1.5 ${className}`}
      role="tablist"
      aria-label="Building floors"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
    >
      {floorsDescending.map((floor, i) => {
        const active = floor.id === activeFloorId;
        const legNumber = legIndexByFloor.get(floor.id);
        const onRoute = legNumber !== undefined;
        // In a top-down rail, the connector below a button leads to the floor beneath it.
        const below = floorsDescending[i + 1];
        const connector = below ? (transitionFrom.get(floor.id) ?? transitionFrom.get(below.id)) : undefined;

        return (
          <div key={floor.id} className={`flex ${vertical ? 'flex-col' : 'flex-row-reverse'} items-center`}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(floor.id)}
              title={`${floor.label}${onRoute ? ` — stop ${legNumber} on your route` : ''}`}
              className={`relative flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition sm:h-10 sm:w-10 sm:rounded-xl sm:text-sm ${
                active
                  ? 'bg-ieee-orange text-white shadow-sm'
                  : onRoute
                    ? 'bg-ieee-orange/10 text-ieee-orange hover:bg-ieee-orange/20'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="floor-rail-active"
                  className="absolute inset-0 rounded-lg bg-ieee-orange sm:rounded-xl"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10">{floor.badge}</span>

              {onRoute && (
                <span
                  className={`absolute -top-1 -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ring-2 ring-white ${
                    active ? 'bg-white text-ieee-orange' : 'bg-ieee-orange text-white'
                  }`}
                >
                  {legNumber}
                </span>
              )}
              <span className="sr-only">{floor.label}</span>
            </button>

            {below && (
              <span
                className={`flex h-3 w-3 items-center justify-center sm:h-4 sm:w-4 ${
                  connector ? 'text-ieee-orange' : 'text-slate-200'
                }`}
                aria-hidden="true"
              >
                {connector ? (
                  connector.kind === 'elevator' ? (
                    <Accessibility className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  ) : (
                    <ChevronsUpDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  )
                ) : (
                  <span className={vertical ? 'h-3 w-px bg-current' : 'h-px w-3 bg-current'} />
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
