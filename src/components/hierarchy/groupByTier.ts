import { UNFILED_TIER, sortMembers, type HierarchyMemberRecord } from '@/services/hierarchyService';
import type { HierarchyRole } from '@/types';

/** One level of the org chart: everyone the role catalogue puts at the same depth. */
export interface HierarchyTierGroup {
  /** The catalogue's `tier` number, kept so React can key on something stable. */
  tier: number;
  people: HierarchyMemberRecord[];
}

/**
 * Groups a roster into the levels of the chart.
 *
 * The shape of the chart comes entirely from the role catalogue's `tier`/`rank`, never from
 * the member order and never from a hardcoded list of slugs — so moving the General Secretary
 * up beside the Vice Chairperson, or running seven Joint Secretaries instead of three, is a
 * row in public.hierarchy_roles and no code change at all. The catalogue is the one in the
 * database, not the static list in src/data/hierarchy.ts: an admin can change the former and
 * only the former.
 *
 * Tier numbers are read as an ordering, not as a depth index: a catalogue numbered 0,1,2,4,5
 * draws five levels, not six with a hole. Roles missing from the catalogue land in a final
 * level rather than disappearing, which keeps an ad-hoc role visible until someone files it.
 */
export function groupByTier(
  members: HierarchyMemberRecord[],
  roleIndex: Map<string, HierarchyRole>
): HierarchyTierGroup[] {
  const levels = new Map<number, HierarchyMemberRecord[]>();

  for (const member of sortMembers(members, roleIndex)) {
    const tier = roleIndex.get(member.roleSlug)?.tier ?? UNFILED_TIER;
    levels.set(tier, [...(levels.get(tier) ?? []), member]);
  }

  return [...levels.entries()].sort(([a], [b]) => a - b).map(([tier, people]) => ({ tier, people }));
}
