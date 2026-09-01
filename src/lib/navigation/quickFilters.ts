/**
 * "Take me to the nearest…" shortcuts.
 *
 * These are the things people actually open a building map for — a washroom between
 * classes, the canteen, the lift when they cannot take stairs. Each one is resolved by
 * walking distance from wherever the user says they are, not by straight-line proximity.
 */

import type { Place } from './types';

export interface QuickFilter {
  id: string;
  label: string;
  matches: (place: Place) => boolean;
}

export const QUICK_FILTERS: QuickFilter[] = [
  {
    id: 'washroom',
    label: 'Washroom',
    matches: (p) => p.category === 'male-washroom' || p.category === 'female-washroom',
  },
  { id: 'canteen', label: 'Canteen', matches: (p) => p.category === 'canteen' },
  { id: 'lift', label: 'Lift', matches: (p) => p.kind === 'elevator' },
  { id: 'stairs', label: 'Stairs', matches: (p) => p.kind === 'stairs' },
  { id: 'exit', label: 'Exit', matches: (p) => p.kind === 'entrance' },
  { id: 'print', label: 'Print shop', matches: (p) => p.category === 'print-shop' },
  { id: 'prayer', label: 'Prayer room', matches: (p) => p.category === 'female-prayer-room' },
];
