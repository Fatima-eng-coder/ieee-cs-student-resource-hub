import type { HierarchyRole, HierarchyTerm } from '@/types';

/**
 * The society logo stands in until real photographs are supplied. Kept as one constant so
 * swapping in per-member images later is a data change, never a code change.
 */
export const PLACEHOLDER_PHOTO = '/brand-logo.png';

/**
 * The role catalogue — the shape of the org chart, independent of who currently fills it.
 *
 * `tier` is depth in the tree; `rank` orders siblings inside a tier. Both are plain numbers
 * with gaps left between them, so a role can be inserted between two others without
 * renumbering the rest.
 */
export const hierarchyRoles: HierarchyRole[] = [
  { slug: 'faculty-advisor', title: 'Faculty Advisor', tier: 0, rank: 10, multiple: false },
  { slug: 'chairperson', title: 'Chairperson', tier: 1, rank: 10, multiple: false },
  { slug: 'vice-chairperson', title: 'Vice Chairperson', tier: 2, rank: 10, multiple: false },
  { slug: 'general-secretary', title: 'General Secretary', tier: 3, rank: 10, multiple: false },
  { slug: 'operations-manager', title: 'Operations Manager', tier: 4, rank: 10, multiple: false },
  { slug: 'web-master', title: 'Web Master', tier: 4, rank: 20, multiple: false },
  { slug: 'treasurer', title: 'Treasurer', tier: 4, rank: 30, multiple: false },
  { slug: 'graphic-designer', title: 'Graphic Designer', tier: 4, rank: 40, multiple: false },
  { slug: 'joint-secretary', title: 'Joint Secretary', tier: 5, rank: 10, multiple: true },
];

export const roleBySlug = new Map(hierarchyRoles.map((role) => [role.slug, role]));

/** Title for a slug, falling back to the raw slug so an unknown role still renders. */
export const roleTitle = (slug: string) => roleBySlug.get(slug)?.title ?? slug;

const member = (id: string, name: string, roleSlug: string, seat?: number) => ({
  id,
  name,
  roleSlug,
  seat,
  photo: PLACEHOLDER_PHOTO,
});

export const hierarchyTerms: HierarchyTerm[] = [
  {
    term: 'FA26',
    label: 'Fall 2026',
    isCurrent: true,
    members: [
      member('fa26-advisor', 'Sir Muhammad Haris', 'faculty-advisor'),
      member('fa26-chair', 'Hadiya Murad Hadi', 'chairperson'),
      member('fa26-vice', 'Wadeea Imran', 'vice-chairperson'),
      member('fa26-gensec', 'Hammad Khaliq', 'general-secretary'),
      member('fa26-ops', 'Muhammad Ahsan', 'operations-manager'),
      member('fa26-web', 'Shaharyar Zia', 'web-master'),
      member('fa26-treasurer', 'Fatima Azaz', 'treasurer'),
      member('fa26-design', 'Areeba Sajjal', 'graphic-designer'),
      member('fa26-js-1', 'Arfa Zia', 'joint-secretary', 1),
      member('fa26-js-2', 'Muhammad Talha', 'joint-secretary', 2),
      member('fa26-js-3', 'Rania Malik', 'joint-secretary', 3),
      member('fa26-js-4', 'Muhammad Asad Ali', 'joint-secretary', 4),
      member('fa26-js-5', 'Muhammad Tayyab Alqan', 'joint-secretary', 5),
      member('fa26-js-6', 'Hania Zaki', 'joint-secretary', 6),
      member('fa26-js-7', 'Mohammad Hashaam Sargaana', 'joint-secretary', 7),
    ],
  },
];

/** The serving council. Never assume index 0 — the current term is a flag, not a position. */
export const currentHierarchy = hierarchyTerms.find((t) => t.isCurrent) ?? hierarchyTerms[0];
