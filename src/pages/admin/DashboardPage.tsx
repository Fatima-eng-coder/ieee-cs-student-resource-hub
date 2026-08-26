import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CalendarPlus,
  FileUp,
  ClipboardList,
  Inbox,
  ArrowUpRight,
  ShieldCheck,
  FileText,
  BookOpen,
  CalendarClock,
  Layers,
  Megaphone,
  Image as ImageIcon,
  CheckCircle2,
} from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminMetricCard from '@/components/admin/AdminMetricCard';
import VerificationBadge from '@/components/ui/VerificationBadge';
import { adminAuthService } from '@/services/adminAuthService';
import { useCollection } from '@/hooks/useCollection';
import { useCourses } from '@/hooks/useCourses';
import { events as eventsSeed } from '@/data/events';
import { projectSeed } from '@/data/projectSeed';
import { dateSheets as dateSheetsSeed } from '@/data/dateSheets';
import { galleryAlbums as gallerySeed } from '@/data/gallery';
import { announcementsService, subscribeAnnouncementsChanged } from '@/services/announcementsService';
import { papersService, subscribeMaterialsChanged } from '@/services/papersService';
import type { Paper, EventItem, ProjectPost, DateSheet, Announcement, GalleryAlbum } from '@/types';

const quickActions = [
  { label: 'New Event', to: '/portal/events', icon: CalendarPlus },
  { label: 'Add Material', to: '/portal/papers', icon: FileUp },
  { label: 'Build a Form', to: '/portal/forms/new', icon: ClipboardList },
  { label: 'Review Submissions', to: '/portal/submissions', icon: Inbox },
];

export default function DashboardPage() {
  const admin = adminAuthService.getCurrentAdmin();
  const [papers, setPapers] = useState<Paper[]>([]);
  const { courses } = useCourses();
  const { items: events } = useCollection<EventItem>('events', eventsSeed);
  const { items: projects } = useCollection<ProjectPost>('projectPosts', projectSeed);
  const { items: dateSheets } = useCollection<DateSheet>('dateSheets', dateSheetsSeed);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const { items: gallery } = useCollection<GalleryAlbum>('gallery', gallerySeed);

  useEffect(() => {
    let ignore = false;

    const load = () => announcementsService
      .list()
      .then((items) => {
        if (!ignore) setAnnouncements(items);
      })
      .catch((error) => {
        console.error('Failed to load announcement metrics', error);
      });
    const unsubscribe = subscribeAnnouncementsChanged(load);

    void load();

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    const load = () => papersService
      .list()
      .then((items) => {
        if (!ignore) setPapers(items);
      })
      .catch((error) => {
        console.error('Failed to load paper metrics', error);
      });
    const unsubscribe = subscribeMaterialsChanged(load);

    void load();

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, []);

  const papersToVerify = papers.filter((p) => p.verification !== 'verified').length;
  const upcoming = events.filter((e) => e.timing === 'upcoming').length;
  const recentSubmissions = papers.filter((p) => p.verification !== 'verified').slice(0, 5);

  const attention = [
    {
      label: 'Materials awaiting verification',
      count: papersToVerify,
      to: '/portal/submissions',
      cta: 'Review submissions',
    },
    {
      label: 'Course material library',
      count: papers.length,
      to: '/portal/papers',
      cta: 'Manage materials',
    },
  ];

  const library = [
    { label: 'Course Materials', value: papers.length, icon: FileText, to: '/portal/papers' },
    { label: 'Courses', value: courses.length, icon: BookOpen, to: '/portal/courses' },
    { label: 'Date Sheets', value: dateSheets.length, icon: CalendarClock, to: '/portal/date-sheets' },
    { label: 'Projects', value: projects.length, icon: Layers, to: '/portal/projects' },
    { label: 'Announcements', value: announcements.length, icon: Megaphone, to: '/portal/announcements' },
    { label: 'Gallery Albums', value: gallery.length, icon: ImageIcon, to: '/portal/gallery' },
  ];

  return (
    <div>
      <AdminTopbar title="Dashboard" subtitle={admin ? `Welcome back, ${admin.name.split(' ')[0]}` : undefined} />
      <div className="p-4 sm:p-6">
        {/* Needs attention — the first thing an admin should act on */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {attention.map((a, i) => {
            const clear = a.count === 0;
            return (
              <motion.div
                key={a.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <Link
                  to={a.to}
                  className={`flex items-center gap-4 rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${
                    clear ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70'
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                      clear ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {clear ? <CheckCircle2 className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-2xl font-bold text-slate-900">{a.count}</p>
                    <p className="truncate text-sm text-slate-600">{a.label}</p>
                  </div>
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-slate-500 sm:flex">
                    {clear ? 'All clear' : a.cta} <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Metrics — compact 2-up on phones so they don't dominate */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          <AdminMetricCard label="Total Papers" value={papers.length} icon="file" accent="orange" delay={0} />
          <AdminMetricCard label="Active Courses" value={courses.length} icon="book" accent="blue" delay={0.05} />
          <AdminMetricCard label="Upcoming Events" value={upcoming} icon="calendar" accent="emerald" delay={0.1} />
          <AdminMetricCard label="Projects" value={projects.length} icon="layers" accent="amber" delay={0.15} />
        </div>

        {/* Quick actions */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {quickActions.map((a, i) => {
            const Icon = a.icon;
            return (
              <motion.div
                key={a.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
              >
                <Link
                  to={a.to}
                  className="group flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-ieee-orange/30 hover:shadow-md sm:p-4"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ieee-orange/10 text-ieee-orange">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold text-slate-800">{a.label}</span>
                  <ArrowUpRight className="ml-auto hidden h-4 w-4 text-slate-300 transition group-hover:text-ieee-orange sm:block" />
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Recent course material submissions */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Recent Course Material Submissions</h3>
              <Link to="/portal/submissions" className="text-xs font-semibold text-ieee-orange hover:underline">
                View all
              </Link>
            </div>
            <ul className="mt-4 flex flex-col gap-1">
              {recentSubmissions.map((paper) => (
                <li key={paper.id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 transition hover:bg-cream/60">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{paper.title}</p>
                    <p className="truncate text-xs text-slate-400">
                      {paper.uploadedBy} · {paper.courseName} · {paper.uploadedDate}
                    </p>
                  </div>
                  <VerificationBadge status={paper.verification} size="sm" />
                </li>
              ))}
              {recentSubmissions.length === 0 && (
                <li className="px-2 py-6 text-center text-sm text-slate-400">No course material submissions are waiting for review.</li>
              )}
            </ul>
          </motion.div>

          {/* Library at a glance */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6"
          >
            <h3 className="font-display text-base font-bold text-slate-900">Content Library</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {library.map((l) => {
                const Icon = l.icon;
                return (
                  <Link
                    key={l.label}
                    to={l.to}
                    className="flex flex-col gap-1 rounded-xl border border-black/5 bg-cream/50 p-3 transition hover:border-ieee-orange/30 hover:bg-cream"
                  >
                    <Icon className="h-4 w-4 text-ieee-orange" />
                    <span className="font-display text-xl font-bold text-slate-900">{l.value}</span>
                    <span className="text-[11px] text-slate-500">{l.label}</span>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
