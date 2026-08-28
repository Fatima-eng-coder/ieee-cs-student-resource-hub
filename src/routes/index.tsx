import { createBrowserRouter, Navigate } from 'react-router-dom';
import PublicLayout from '@/components/layout/PublicLayout';
import AdminLayout from '@/components/layout/AdminLayout';
import RequireAdmin from '@/components/admin/RequireAdmin';

import HomePage from '@/pages/public/HomePage';
import AboutPage from '@/pages/public/AboutPage';
import HierarchyPage from '@/pages/public/HierarchyPage';
import TimelinePage from '@/pages/public/TimelinePage';
import PastPapersPage from '@/pages/public/PastPapersPage';
import PaperDetailPage from '@/pages/public/PaperDetailPage';
import ContributePaperPage from '@/pages/public/ContributePaperPage';
import RequestPaperPage from '@/pages/public/RequestPaperPage';
import CoursesPage from '@/pages/public/CoursesPage';
import CourseDetailPage from '@/pages/public/CourseDetailPage';
import TeachersPage from '@/pages/public/TeachersPage';
import SuggestCorrectionPage from '@/pages/public/SuggestCorrectionPage';
import SuggestTeacherPage from '@/pages/public/SuggestTeacherPage';
import EventsPage from '@/pages/public/EventsPage';
import EventDetailPage from '@/pages/public/EventDetailPage';
import EventRegisterPage from '@/pages/public/EventRegisterPage';
import NavigationPage from '@/pages/public/NavigationPage';
import NavigationReportPage from '@/pages/public/NavigationReportPage';
import ProjectsExpoPage from '@/pages/public/ProjectsExpoPage';
import ProjectDetailPage from '@/pages/public/ProjectDetailPage';
import SubmitProjectPage from '@/pages/public/SubmitProjectPage';
import QuickLinksPage from '@/pages/public/QuickLinksPage';
import AnnouncementsPage from '@/pages/public/AnnouncementsPage';
import AnnouncementDetailPage from '@/pages/public/AnnouncementDetailPage';
import GalleryPage from '@/pages/public/GalleryPage';
import GalleryAlbumPage from '@/pages/public/GalleryAlbumPage';
import ContributePage from '@/pages/public/ContributePage';
import FaqContactPage from '@/pages/public/FaqContactPage';
import SearchPage from '@/pages/public/SearchPage';
import PrivacyDisclaimerPage from '@/pages/public/PrivacyDisclaimerPage';
import DevelopersPage from '@/pages/public/DevelopersPage';
import FormsPage from '@/pages/public/FormsPage';
import FormFillPage from '@/pages/public/FormFillPage';
import DateSheetsPage from '@/pages/public/DateSheetsPage';
import NotFoundPage from '@/pages/public/NotFoundPage';

import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';


import AdminTeachersPage from '@/pages/admin/AdminTeachersPage';
import AdminLoginPage from '@/pages/admin/AdminLoginPage';
import DashboardPage from '@/pages/admin/DashboardPage';
import AdminEventsPage from '@/pages/admin/AdminEventsPage';
import AdminBannersPage from '@/pages/admin/AdminBannersPage';
import AdminPapersPage from '@/pages/admin/AdminPapersPage';
import AdminCoursesPage from '@/pages/admin/AdminCoursesPage';
import AdminProjectsPage from '@/pages/admin/AdminProjectsPage';
import AdminNavigationPage from '@/pages/admin/AdminNavigationPage';
import AdminHierarchyPage from '@/pages/admin/AdminHierarchyPage';
import AdminSubmissionsPage from '@/pages/admin/AdminSubmissionsPage';
import AdminQuickLinksPage from '@/pages/admin/AdminQuickLinksPage';
import AdminAnnouncementsPage from '@/pages/admin/AdminAnnouncementsPage';
import AdminGalleryPage from '@/pages/admin/AdminGalleryPage';
import AdminFaqPage from '@/pages/admin/AdminFaqPage';
import AdminUsersPage from '@/pages/admin/AdminUsersPage';
import AdminSettingsPage from '@/pages/admin/AdminSettingsPage';
import AdminDevelopersPage from '@/pages/admin/AdminDevelopersPage';
import AdminFormsPage from '@/pages/admin/AdminFormsPage';
import FormBuilderPage from '@/pages/admin/FormBuilderPage';
import FormResponsesPage from '@/pages/admin/FormResponsesPage';
import AdminDateSheetsPage from '@/pages/admin/AdminDateSheetsPage';
import AdminNavbarPage from '@/pages/admin/AdminNavbarPage';
import AdminFooterPage from '@/pages/admin/AdminFooterPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'about/hierarchy', element: <HierarchyPage /> },
      { path: 'about/timeline', element: <TimelinePage /> },
      { path: 'past-papers', element: <PastPapersPage /> },
      { path: 'past-papers/contribute', element: <ContributePaperPage /> },
      { path: 'past-papers/request', element: <RequestPaperPage /> },
      { path: 'past-papers/:id', element: <PaperDetailPage /> },
      { path: 'courses', element: <CoursesPage /> },
      { path: 'courses/teachers', element: <TeachersPage /> },
      { path: 'courses/suggest-teacher', element: <SuggestTeacherPage /> },
      { path: 'courses/suggest-correction', element: <SuggestCorrectionPage /> },
      { path: 'courses/:id', element: <CourseDetailPage /> },
      { path: 'events', element: <EventsPage /> },
      { path: 'events/:id', element: <EventDetailPage /> },
      { path: 'events/:id/register', element: <EventRegisterPage /> },
      { path: 'navigation', element: <NavigationPage /> },
      { path: 'navigation/report', element: <NavigationReportPage /> },
      { path: 'projects-expo', element: <ProjectsExpoPage /> },
      { path: 'projects-expo/submit', element: <SubmitProjectPage /> },
      { path: 'projects-expo/:id', element: <ProjectDetailPage /> },
      { path: 'quick-links', element: <QuickLinksPage /> },
      { path: 'announcements', element: <AnnouncementsPage /> },
      { path: 'announcements/:id', element: <AnnouncementDetailPage /> },
      { path: 'gallery', element: <GalleryPage /> },
      { path: 'gallery/:id', element: <GalleryAlbumPage /> },
      { path: 'contribute', element: <ContributePage /> },
      { path: 'faq-contact', element: <FaqContactPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'privacy-disclaimer', element: <PrivacyDisclaimerPage /> },
      { path: 'developers', element: <DevelopersPage /> },
      { path: 'forms', element: <FormsPage /> },
      { path: 'forms/:id', element: <FormFillPage /> },
      { path: 'date-sheets', element: <DateSheetsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/signup',
    element: <SignupPage />,
  },
  {
    // Private team portal — unlisted, never linked from the public hub.
    path: '/portal/login',
    element: <AdminLoginPage />,
  },
  {
    path: '/portal',
    element: (
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    ),
    children: [
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'events', element: <AdminEventsPage /> },
      { path: 'banners', element: <AdminBannersPage /> },
      { path: 'papers', element: <AdminPapersPage /> },
      { path: 'teachers', element: <AdminTeachersPage /> },   //newwwwwwwwwwwww
      { path: 'courses', element: <AdminCoursesPage /> },
      { path: 'projects', element: <AdminProjectsPage /> },
      { path: 'navigation', element: <AdminNavigationPage /> },
      { path: 'hierarchy', element: <AdminHierarchyPage /> },
      { path: 'submissions', element: <AdminSubmissionsPage /> },
      { path: 'quick-links', element: <AdminQuickLinksPage /> },
      { path: 'announcements', element: <AdminAnnouncementsPage /> },
      { path: 'gallery', element: <AdminGalleryPage /> },
      { path: 'faq', element: <AdminFaqPage /> },
      { path: 'forms', element: <AdminFormsPage /> },
      { path: 'forms/new', element: <FormBuilderPage /> },
      { path: 'forms/:id/edit', element: <FormBuilderPage /> },
      { path: 'forms/:id/responses', element: <FormResponsesPage /> },
      { path: 'date-sheets', element: <AdminDateSheetsPage /> },
      { path: 'navbar', element: <AdminNavbarPage /> },
      { path: 'footer', element: <AdminFooterPage /> },
      { path: 'users', element: <AdminUsersPage /> },
      { path: 'developers', element: <AdminDevelopersPage /> },
      { path: 'settings', element: <AdminSettingsPage /> },
    ],
  },
  {
    // Retire the old public /admin path — send any leftover bookmarks to the portal login.
    path: '/admin/*',
    element: <Navigate to="/portal/login" replace />,
  },
]);
