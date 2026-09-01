/**
 * Icon lookups for the wayfinding UI — one place to map a room category or a
 * turn-by-turn instruction onto a Lucide icon.
 */

import {
  Accessibility,
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronsUpDown,
  CircleDot,
  CornerUpLeft,
  CornerUpRight,
  DoorOpen,
  FlaskConical,
  Flag,
  GraduationCap,
  MapPin,
  MoonStar,
  Navigation,
  Printer,
  Repeat,
  ArrowUpRight,
  ArrowUpLeft,
  Users,
  Utensils,
  Toilet,
  type LucideIcon,
} from 'lucide-react';
import type { StepIcon } from '@/lib/navigation/directions';

/** Room category / place kind → icon. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  classroom: GraduationCap,
  laboratory: FlaskConical,
  administration: Users,
  canteen: Utensils,
  'print-shop': Printer,
  'male-washroom': Toilet,
  'female-washroom': Toilet,
  'female-prayer-room': MoonStar,
  unclassified: Building2,
  entrance: DoorOpen,
  stairs: ChevronsUpDown,
  elevator: Accessibility,
};

export const categoryIcon = (category: string): LucideIcon =>
  CATEGORY_ICONS[category] ?? CATEGORY_ICONS.unclassified;

/** Direction-step icon → arrow. */
const STEP_ICONS: Record<StepIcon, LucideIcon> = {
  start: CircleDot,
  straight: ArrowUp,
  left: CornerUpLeft,
  right: CornerUpRight,
  'slight-left': ArrowUpLeft,
  'slight-right': ArrowUpRight,
  'u-turn': Repeat,
  'stairs-up': ArrowUp,
  'stairs-down': ArrowDown,
  elevator: Accessibility,
  flag: Flag,
};

export const stepIcon = (icon: StepIcon): LucideIcon => STEP_ICONS[icon] ?? Navigation;

export { MapPin, Navigation };
