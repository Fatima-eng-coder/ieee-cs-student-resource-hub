import type { IconName } from '@/components/ui/Icon';

export interface AdminNavItem {
  label: string;
  to: string;
  icon: IconName;
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

/** Shared admin navigation — used by the desktop sidebar and the mobile drawer. */
export const adminNavGroups: AdminNavGroup[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', to: '/portal/dashboard', icon: 'grid' }],
  },
  {
    title: 'Content',
    items: [
      { label: 'Navbar', to: '/portal/navbar', icon: 'menu' },
      { label: 'Footer', to: '/portal/footer', icon: 'link' },
      { label: 'Events', to: '/portal/events', icon: 'calendar' },
      { label: 'Banners', to: '/portal/banners', icon: 'image' },
      { label: 'Past Papers', to: '/portal/papers', icon: 'file' },
      { label: 'Teachers', to: '/portal/teachers', icon: 'faculty' }, 
      { label: 'Courses', to: '/portal/courses', icon: 'book' },
      { label: 'Date Sheets', to: '/portal/date-sheets', icon: 'calendar' },
      { label: 'Projects', to: '/portal/projects', icon: 'layers' },
      { label: 'Navigation', to: '/portal/navigation', icon: 'compass' },
      { label: 'Hierarchy', to: '/portal/hierarchy', icon: 'building' },
      { label: 'Quick Links', to: '/portal/quick-links', icon: 'link' },
      { label: 'Announcements', to: '/portal/announcements', icon: 'megaphone' },
      { label: 'Gallery', to: '/portal/gallery', icon: 'image' },
      { label: 'Forms', to: '/portal/forms', icon: 'inbox' },
      { label: 'FAQ', to: '/portal/faq', icon: 'question' },
      { label: 'Developers', to: '/portal/developers', icon: 'users' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Submissions', to: '/portal/submissions', icon: 'inbox' },
      { label: 'Users', to: '/portal/users', icon: 'user' },
      { label: 'Settings', to: '/portal/settings', icon: 'settings' },
    ],
  },
];
