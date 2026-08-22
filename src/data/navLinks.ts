import type { NavLinkItem } from '@/types';

/**
 * Which links appear in the public navbar, and in what order. Managed live from
 * the admin "Navbar" module — toggle links on/off and reorder them (e.g. surface
 * "Date Sheets" near exams, or an event registration when one is running).
 */
export const navLinks: NavLinkItem[] = [
  { id: 'nl-home', label: 'Home', to: '/', enabled: true },
  { id: 'nl-about', label: 'About', to: '/about', enabled: true },
  { id: 'nl-papers', label: 'Past Papers', to: '/past-papers', enabled: true },
  { id: 'nl-courses', label: 'Courses', to: '/courses', enabled: true },
  { id: 'nl-events', label: 'Events', to: '/events', enabled: true },
  { id: 'nl-navigation', label: 'Navigation', to: '/navigation', enabled: true },
  { id: 'nl-projects', label: 'Projects', to: '/projects-expo', enabled: true },
  { id: 'nl-forms', label: 'Forms', to: '/forms', enabled: true },
  // Available but hidden by default — switch on when they're timely.
  { id: 'nl-datesheets', label: 'Date Sheets', to: '/date-sheets', enabled: false },
  { id: 'nl-contribute', label: 'Contribute', to: '/contribute', enabled: false },
  { id: 'nl-gallery', label: 'Gallery', to: '/gallery', enabled: false },
  { id: 'nl-announcements', label: 'Announcements', to: '/announcements', enabled: true },
];
