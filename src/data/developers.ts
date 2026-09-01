import type { DeveloperProfile } from '@/types';

/**
 * THE DEVELOPER ROSTER — edit this file to change who appears on /developers.
 *
 * Names, roles, photos and write-ups are deliberately authored here rather than in the
 * database: the list changes once a year at most, and an admin panel that can add or remove
 * people is a way to lose them by accident. The admin panel edits only the contact links,
 * which are the part that actually goes stale.
 *
 * `id` is the join key to the developer_links table. Adding someone here also needs a row
 * there — see supabase/migrations/20260901000400_hierarchy_and_content.sql, which is where
 * those rows are created, because the table has no INSERT policy for the app.
 */
export const developerProfiles: DeveloperProfile[] = [
  {
    id: 'dev-1',
    name: 'Hamza Ahsan',
    role: 'Lead Developer & Project Maintainer',
    photo: 'https://i.pravatar.cc/300?img=68',
    contribution: 'Architected the resource hub, built the public site and admin panel, and led the overall product design.',
    bio: 'Full-stack developer focused on building clean, fast, and accessible tools for student communities.',
    skills: ['React', 'TypeScript', 'Tailwind CSS', 'Product Design'],
  },
  {
    id: 'dev-2',
    name: 'Zainab Iqbal',
    role: 'Frontend Developer',
    photo: 'https://i.pravatar.cc/300?img=48',
    contribution: 'Built the Past Papers and Courses modules, including search, filters, and detail pages.',
    bio: 'Enjoys crafting smooth UI interactions and making data-heavy pages easy to browse.',
    skills: ['React', 'Framer Motion', 'UI/UX'],
  },
  {
    id: 'dev-3',
    name: 'Bilal Ahmed',
    role: 'UI/UX Designer',
    photo: 'https://i.pravatar.cc/300?img=13',
    contribution: 'Designed the visual system, color palette, and component library used across the hub.',
    bio: 'Designer with a soft spot for clean academic-tech interfaces and accessible color systems.',
    skills: ['Figma', 'Design Systems', 'Accessibility'],
  },
  {
    id: 'dev-4',
    name: 'Usman Riaz',
    role: 'Backend & Data Developer',
    photo: 'https://i.pravatar.cc/300?img=14',
    contribution: 'Structured the dummy data layer and defined the shapes that will map to the future API.',
    bio: 'Interested in backend architecture, data modeling, and developer tooling.',
    skills: ['Node.js', 'PostgreSQL', 'API Design'],
  },
  {
    id: 'dev-5',
    name: 'Sara Malik',
    role: 'QA & Content Coordinator',
    photo: 'https://i.pravatar.cc/300?img=44',
    contribution: 'Tested every form and flow across the site and coordinated the dummy content for events and papers.',
    bio: 'Detail-oriented tester who loves catching edge cases before users do.',
    skills: ['QA Testing', 'Content Strategy'],
  },
];
