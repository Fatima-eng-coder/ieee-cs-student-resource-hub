import type { FooterColumn, FooterLinkItem } from '@/types';

/** The footer's fixed columns, in display order. */
export const footerColumns: FooterColumn[] = ['Explore', 'Society', 'Support'];

/**
 * What the footer falls back to when it cannot read public.footer_links — nothing renders
 * from here while the database is reachable, and an admin's edits in the "Footer" module are
 * what visitors normally see.
 *
 * These are the same fifteen rows 20260901000400_hierarchy_and_content.sql seeded that table
 * with, ids included, so the fallback is the site's own navigation rather than a stale guess.
 * Changing one here changes only what an offline visitor sees; the live list is the table.
 */
export const footerLinks: FooterLinkItem[] = [
  // Explore
  { id: 'fl-papers', label: 'Past Papers', to: '/past-papers', column: 'Explore', enabled: true },
  { id: 'fl-courses', label: 'Courses', to: '/courses', column: 'Explore', enabled: true },
  { id: 'fl-datesheets', label: 'Date Sheets', to: '/date-sheets', column: 'Explore', enabled: true },
  { id: 'fl-events', label: 'Events', to: '/events', column: 'Explore', enabled: true },
  { id: 'fl-projects', label: 'Projects Expo', to: '/projects-expo', column: 'Explore', enabled: true },
  { id: 'fl-forms', label: 'Forms', to: '/forms', column: 'Explore', enabled: true },
  // Society
  { id: 'fl-about', label: 'About Us', to: '/about', column: 'Society', enabled: true },
  { id: 'fl-hierarchy', label: 'Hierarchy', to: '/about/hierarchy', column: 'Society', enabled: true },
  { id: 'fl-timeline', label: 'Timeline', to: '/about/timeline', column: 'Society', enabled: true },
  { id: 'fl-gallery', label: 'Gallery', to: '/gallery', column: 'Society', enabled: true },
  { id: 'fl-developers', label: 'Developers', to: '/developers', column: 'Society', enabled: true },
  // Support
  { id: 'fl-contribute', label: 'Contribute', to: '/contribute', column: 'Support', enabled: true },
  { id: 'fl-faq', label: 'FAQ & Contact', to: '/faq-contact', column: 'Support', enabled: true },
  { id: 'fl-quicklinks', label: 'Quick Links', to: '/quick-links', column: 'Support', enabled: true },
  { id: 'fl-privacy', label: 'Privacy & Disclaimer', to: '/privacy-disclaimer', column: 'Support', enabled: true },
];
