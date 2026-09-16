import type { CreditPerson, CreditWork } from '@/types';

/**
 * THE CREDITS ROSTER — edit this file to change who appears on /developers, and for what.
 *
 * Names and credited work live here, in code, on purpose. They are the record: they change about
 * once a year, and an admin screen able to rewrite them is a way to lose somebody's work, or hand
 * it to someone else, with a single click. Everything that actually goes stale — a portrait, a
 * designation that changes when somebody graduates, a moved LinkedIn — is edited from the portal
 * and stored in public.developer_profiles, keyed by `id`.
 *
 * Adding a person is one edit: put them in PEOPLE and in whichever sections they belong to. Their
 * profile row is created the first time an admin saves them, so no migration is needed. Never
 * rename an existing `id` — it is the join key, and the database refuses to change it on its side.
 */

/** Everybody on the page, once. Sections below refer to these ids rather than repeating names. */
export const PEOPLE = {
  'syed-abbas-raza': { id: 'syed-abbas-raza', name: 'Syed Abbas Raza' },
  'muhammad-ahsan': { id: 'muhammad-ahsan', name: 'Muhammad Ahsan' },
  'fatima-azaz': { id: 'fatima-azaz', name: 'Fatima Azaz' },
  'shaharyar-zia': { id: 'shaharyar-zia', name: 'Shaharyar Zia' },
  'hammad-khaliq': { id: 'hammad-khaliq', name: 'Hammad Khaliq' },
  'areeba-sajjal': { id: 'areeba-sajjal', name: 'Areeba Sajjal' },
  'wadeea-imran': { id: 'wadeea-imran', name: 'Wadeea Imran' },
  'muhammad-asad-ali': { id: 'muhammad-asad-ali', name: 'Muhammad Asad Ali' },
  'hadiya-murad-hadi': { id: 'hadiya-murad-hadi', name: 'Hadiya Murad Hadi' },
} as const satisfies Record<string, CreditPerson>;

export type PersonId = keyof typeof PEOPLE;

// ---------------------------------------------------------------------------------------
// 1. The founder
// ---------------------------------------------------------------------------------------

/** One person, deliberately a single id rather than a list. */
export const FOUNDER: PersonId = 'syed-abbas-raza';

// ---------------------------------------------------------------------------------------
// 2. The developers
// ---------------------------------------------------------------------------------------

export interface DeveloperCredit {
  id: PersonId;
  work: CreditWork[];
}

/*
 * Each item below is traceable to the repositories' history rather than written from memory:
 *
 *   Muhammad-Ahsan-001/ieee-cs-student-resource-hub   the first repo (1 July), "frontend prototype"
 *   Shaharyar16/ieee-cs-student-resource-hub          imported it (10 July) and re-themed it
 *   Fatima-eng-coder/ieee-cs-student-resource-hub     forked from Shaharyar's (11 August)
 *
 * Testing is the one exception: it leaves no commits, and it is credited on the team's word.
 */
export const DEVELOPERS: DeveloperCredit[] = [
  {
    id: 'muhammad-ahsan',
    work: [
      {
        title: 'Built the first skeleton frontend',
        detail: 'What the site grew from, and its navigation.',
      },
      {
        title: 'Worked on the backend',
        detail:
          'Moved the rest of the site from browser storage onto Supabase, then worked on team roles and access, file storage, the committee roster, forms, and the review of submitted papers.',
      },
      { title: 'Worked on banners, announcements, the gallery, projects and date sheets' },
      {
        title: 'Built the 2D and 3D campus navigation apps',
        detail: 'The interactive floor plan on this site, and the separate 3D navigator.',
      },
    ],
  },
  {
    id: 'fatima-azaz',
    work: [
      { title: 'Set up the backend' },
      { title: 'Wired up sign-in' },
      {
        title: 'Connected the first backend to the frontend',
        detail: 'Which meant building on the frontend side as well.',
      },
      {
        title: 'Built the faculty, past papers and courses flows, and the events module',
        detail: 'Along with the faculty page in the admin portal.',
      },
    ],
  },
  {
    // Frontend only, by request: none of this card describes backend work.
    id: 'shaharyar-zia',
    work: [
      {
        title: 'Refined the look and feel of the frontend',
        detail: "Rebuilt the site's pages on the homepage's theme.",
      },
      {
        title: 'Made the site work well on phones',
        detail: 'A responsiveness pass across the pages.',
      },
      { title: 'Tested the site' },
    ],
  },
];

// ---------------------------------------------------------------------------------------
// 3. The brainstormers
// ---------------------------------------------------------------------------------------

/**
 * Everyone who shaped the idea: the five named for this section, followed by everyone credited
 * above. The second half is derived rather than listed again, so adding a developer can never
 * leave them out of the brainstormers by accident.
 */
const IDEA_CONTRIBUTORS: PersonId[] = [
  'hammad-khaliq',
  'areeba-sajjal',
  'wadeea-imran',
  'muhammad-asad-ali',
  'hadiya-murad-hadi',
];

export const BRAINSTORMERS: PersonId[] = [
  ...IDEA_CONTRIBUTORS,
  FOUNDER,
  ...DEVELOPERS.map((developer) => developer.id),
].filter((id, index, all) => all.indexOf(id) === index);

/**
 * Every person who appears anywhere on the page, once, in page order. The admin screen lists
 * exactly these — a person in PEOPLE but in no section is not on the site, so there is nothing
 * for an admin to edit on their behalf.
 */
export const CREDITED_IDS: PersonId[] = [FOUNDER, ...DEVELOPERS.map((d) => d.id), ...BRAINSTORMERS].filter(
  (id, index, all) => all.indexOf(id) === index
);

/** Which sections a person appears in, for labelling them in the admin screen. */
export function sectionsFor(id: PersonId): ('Founder' | 'Developer' | 'Brainstormer')[] {
  const sections: ('Founder' | 'Developer' | 'Brainstormer')[] = [];
  if (id === FOUNDER) sections.push('Founder');
  if (DEVELOPERS.some((developer) => developer.id === id)) sections.push('Developer');
  if (BRAINSTORMERS.includes(id)) sections.push('Brainstormer');
  return sections;
}
