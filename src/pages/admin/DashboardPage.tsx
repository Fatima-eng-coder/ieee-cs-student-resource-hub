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
  CalendarDays,
  Megaphone,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminMetricCard from '@/components/admin/AdminMetricCard';
import VerificationBadge from '@/components/ui/VerificationBadge';
import type { IconName } from '@/components/ui/Icon';
import { adminAuthService } from '@/services/adminAuthService';
import { useCourses } from '@/hooks/useCourses';
import { announcementsService, subscribeAnnouncementsChanged } from '@/services/announcementsService';
import { eventsService, subscribeEventsChanged } from '@/services/eventsService';
import { galleryService } from '@/services/galleryService';
import { papersService, subscribeMaterialsChanged } from '@/services/papersService';
import type { Paper } from '@/types';

const quickActions = [
  { label: 'New Event', to: '/portal/events', icon: CalendarPlus },
  { label: 'Add Material', to: '/portal/papers', icon: FileUp },
  { label: 'Build a Form', to: '/portal/forms/new', icon: ClipboardList },
  { label: 'Review Submissions', to: '/portal/submissions', icon: Inbox },
];

type MetricStatus = 'loading' | 'ready' | 'unavailable';

interface MetricSource<T> {
  items: T[];
  status: MetricStatus;
}

const loadPapers = () => papersService.list();
const loadEvents = () => eventsService.listAdmin();
const loadAnnouncements = () => announcementsService.list();
const loadGalleryAlbumCount = () => galleryService.count();

/**
 * Loads one dashboard number and keeps hold of whether the read actually succeeded. A
 * failed read stays 'unavailable' rather than settling on the empty list it started
 * with: rendered as 0, a broken connection is indistinguishable from an empty table, and
 * the admin acts on the wrong one.
 */
function useMetricSource<T>(
  label: string,
  load: () => Promise<T[]>,
  subscribe: (callback: () => void) => () => void
): MetricSource<T> {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<MetricStatus>('loading');

  useEffect(() => {
    let ignore = false;

    const run = () =>
      load()
        .then((next) => {
          if (ignore) return;
          setItems(next);
          setStatus('ready');
        })
        .catch((error) => {
          if (ignore) return;
          setStatus('unavailable');
          console.error(`Failed to load ${label} for the dashboard`, error);
        });

    const unsubscribe = subscribe(run);
    void run();

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, [label, load, subscribe]);

  return { items, status };
}

/**
 * The same machinery for a tile that only ever wanted the number.
 *
 * Papers and events are loaded in full because the dashboard filters them — unverified
 * uploads, upcoming events. The gallery is not filtered anywhere here, and reading every album
 * with every photo row attached to show one figure is a lot of rows for one digit.
 *
 * A null count is treated as unavailable rather than as zero, for the same reason a failed
 * load is: the tile's whole job is the number, and a wrong number is worse than none.
 */
function useMetricCount(label: string, load: () => Promise<number | null>): {
  count: number;
  status: MetricStatus;
} {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<MetricStatus>('loading');

  useEffect(() => {
    let ignore = false;

    load()
      .then((next) => {
        if (ignore) return;
        if (next === null) {
          setStatus('unavailable');
          return;
        }
        setCount(next);
        setStatus('ready');
      })
      .catch((error) => {
        if (ignore) return;
        setStatus('unavailable');
        console.error(`Failed to load ${label} for the dashboard`, error);
      });

    return () => {
      ignore = true;
    };
  }, [label, load]);

  return { count, status };
}

/**
 * Stands in for a metric card whose source has not been read. It shows no number at all,
 * because the whole point of the card is the number and a placeholder digit would be
 * read as one.
 */
function MetricPlaceholder({
  label,
  status,
  delay,
}: {
  label: string;
  status: Exclude<MetricStatus, 'ready'>;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="relative overflow-hidden rounded-2xl border border-black/5 bg-white p-5 shadow-[0_8px_30px_rgba(10,10,12,0.05)]"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
          {status === 'loading' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
        </span>
      </div>
      {status === 'loading' ? (
        <div className="mt-3 h-9 w-20 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <p className="mt-3 flex h-9 items-center font-display text-lg font-bold text-slate-400">Unavailable</p>
      )}
    </motion.div>
  );
}

export default function DashboardPage() {
  const admin = adminAuthService.getCurrentAdmin();
  const papers = useMetricSource<Paper>('course material', loadPapers, subscribeMaterialsChanged);
  const events = useMetricSource('events', loadEvents, subscribeEventsChanged);
  const announcements = useMetricSource('announcements', loadAnnouncements, subscribeAnnouncementsChanged);
  const gallery = useMetricCount('gallery albums', loadGalleryAlbumCount);
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();
  const coursesStatus: MetricStatus = coursesLoading ? 'loading' : coursesError ? 'unavailable' : 'ready';

  const unverified = papers.items.filter((paper) => paper.verification !== 'verified');
  // Drafts are counted too — this is the team's own calendar, and an unpublished event
  // that is nearly due is exactly the one somebody needs to be reminded of.
  const upcoming = events.items.filter((event) => event.timing === 'upcoming').length;
  const recentSubmissions = unverified.slice(0, 5);

  const attention = [
    {
      label: 'Materials awaiting verification',
      count: unverified.length,
      status: papers.status,
      to: '/portal/submissions',
      cta: 'Review submissions',
    },
    {
      label: 'Course material library',
      count: papers.items.length,
      status: papers.status,
      to: '/portal/papers',
      cta: 'Manage materials',
    },
  ];

  const metrics: {
    label: string;
    value: number;
    status: MetricStatus;
    icon: IconName;
    accent: 'orange' | 'blue' | 'emerald' | 'amber';
  }[] = [
    { label: 'Total Papers', value: papers.items.length, status: papers.status, icon: 'file', accent: 'orange' },
    { label: 'Active Courses', value: courses.length, status: coursesStatus, icon: 'book', accent: 'blue' },
    { label: 'Upcoming Events', value: upcoming, status: events.status, icon: 'calendar', accent: 'emerald' },
    {
      label: 'Announcements',
      value: announcements.items.length,
      status: announcements.status,
      icon: 'megaphone',
      accent: 'amber',
    },
  ];

  // Date sheets and the projects expo are switched off behind "coming soon" screens for
  // visitors. Both are database-backed now, so a count here would be real — it is left out
  // because a headline number for a section the public cannot reach invites the reading that
  // it is live, and the portal editors are one click away for anyone who wants the figure.
  const library = [
    {
      label: 'Course Material',
      value: papers.items.length,
      status: papers.status,
      icon: FileText,
      to: '/portal/papers',
    },
    { label: 'Courses', value: courses.length, status: coursesStatus, icon: BookOpen, to: '/portal/courses' },
    { label: 'Events', value: events.items.length, status: events.status, icon: CalendarDays, to: '/portal/events' },
    {
      label: 'Announcements',
      value: announcements.items.length,
      status: announcements.status,
      icon: Megaphone,
      to: '/portal/announcements',
    },
    {
      label: 'Gallery Albums',
      value: gallery.count,
      status: gallery.status,
      icon: ImageIcon,
      to: '/portal/gallery',
    },
  ];

  return (
    <div>
      <AdminTopbar title="Dashboard" subtitle={admin ? `Welcome back, ${admin.name.split(' ')[0]}` : undefined} />
      <div className="p-4 sm:p-6">
        {/* Needs attention — the first thing an admin should act on */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {attention.map((a, i) => {
            const clear = a.status === 'ready' && a.count === 0;
            const known = a.status === 'ready';
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
                    !known
                      ? 'border-black/5 bg-white'
                      : clear
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-amber-200 bg-amber-50/70'
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                      !known
                        ? 'bg-slate-100 text-slate-400'
                        : clear
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {a.status === 'loading' ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : a.status === 'unavailable' ? (
                      <AlertTriangle className="h-6 w-6" />
                    ) : clear ? (
                      <CheckCircle2 className="h-6 w-6" />
                    ) : (
                      <ShieldCheck className="h-6 w-6" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    {known ? (
                      <p className="font-display text-2xl font-bold text-slate-900">{a.count}</p>
                    ) : a.status === 'loading' ? (
                      <div className="h-8 w-14 animate-pulse rounded-lg bg-slate-100" />
                    ) : (
                      <p className="font-display text-2xl font-bold text-slate-300">&mdash;</p>
                    )}
                    <p className="truncate text-sm text-slate-600">{a.label}</p>
                  </div>
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-slate-500 sm:flex">
                    {a.status === 'unavailable' ? 'Count unavailable' : clear ? 'All clear' : a.cta}{' '}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Metrics — compact 2-up on phones so they don't dominate */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {metrics.map((metric, i) =>
            metric.status === 'ready' ? (
              <AdminMetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                icon={metric.icon}
                accent={metric.accent}
                delay={i * 0.05}
              />
            ) : (
              <MetricPlaceholder key={metric.label} label={metric.label} status={metric.status} delay={i * 0.05} />
            )
          )}
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
              {papers.status === 'loading' && (
                <li className="px-2 py-6 text-center text-sm text-slate-400">Loading submissions…</li>
              )}
              {papers.status === 'unavailable' && (
                <li className="px-2 py-6 text-center text-sm text-amber-700">
                  Course material could not be loaded, so this list is incomplete. Reload the page to try again.
                </li>
              )}
              {papers.status === 'ready' && recentSubmissions.length === 0 && (
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
                    {l.status === 'loading' ? (
                      <span className="my-1 h-5 w-10 animate-pulse rounded bg-black/5" />
                    ) : (
                      <span
                        className={`font-display text-xl font-bold ${
                          l.status === 'ready' ? 'text-slate-900' : 'text-slate-300'
                        }`}
                      >
                        {l.status === 'ready' ? l.value : '—'}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500">
                      {l.status === 'unavailable' ? `${l.label} · unavailable` : l.label}
                    </span>
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
