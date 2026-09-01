import type { RouteEntrance, RouteInfo } from '@/types';

export const entrances: RouteEntrance[] = [
  { id: 'ent-1', name: 'Entrance 1', description: 'Main gate facing the parking lot' },
  { id: 'ent-2', name: 'Entrance 2', description: 'Side gate near the cafeteria' },
  { id: 'ent-3', name: 'Entrance 3', description: 'Back gate near the sports ground' },
  { id: 'ent-4', name: 'Entrance 4', description: 'Faculty block connecting corridor' },
];

// Keyed by `${entranceId}__${destinationId}` for lookups.
export const routeInfos: Record<string, RouteInfo> = {
  'ent-2__dest-lab3': {
    id: 'route-1',
    entranceId: 'ent-2',
    destinationId: 'dest-lab3',
    estimatedTimeMinutes: 4,
    steps: [
      { order: 1, instruction: 'Enter from Entrance 2' },
      { order: 2, instruction: 'Move straight through the corridor' },
      { order: 3, instruction: 'Turn left near the notice board' },
      { order: 4, instruction: 'Take the stairs to the first floor' },
      { order: 5, instruction: 'Lab 3 will be on your right' },
    ],
  },
};

export const defaultRoute: RouteInfo = routeInfos['ent-2__dest-lab3'];
