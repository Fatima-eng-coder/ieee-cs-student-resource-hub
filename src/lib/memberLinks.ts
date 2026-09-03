import type { HierarchyMember, MemberLink } from '@/types';

/**
 * The links to show for a member, newest shape first.
 *
 * `links` replaced the `email` and `linkedin` columns, and the migration folded existing values
 * into it — but only for rows that had them at the time. Anything written through an older
 * client, or restored from a backup taken before the migration, still carries the columns and
 * an empty array, and those members would silently lose their contact details on every surface.
 *
 * So: use `links` when it has anything, and fall back to the columns when it does not. Not a
 * merge — a member whose array is populated has been edited under the new shape, and the old
 * columns are then stale by definition; merging would resurrect an address they removed.
 */
export function memberLinks(member: Pick<HierarchyMember, 'links' | 'email' | 'linkedin'>): MemberLink[] {
  if (member.links.length > 0) return member.links;

  const legacy: MemberLink[] = [];
  const email = member.email?.trim();
  const linkedin = member.linkedin?.trim();
  if (email) legacy.push({ type: 'email', label: '', url: email });
  if (linkedin) legacy.push({ type: 'linkedin', label: '', url: linkedin });
  return legacy;
}
