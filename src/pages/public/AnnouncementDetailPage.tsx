import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { announcementsService, subscribeAnnouncementsChanged } from '@/services/announcementsService';
import type { Announcement } from '@/types';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import EmptyState from '@/components/ui/EmptyState';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function AnnouncementDetailPage() {
  const { id } = useParams();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const load = () => announcementsService
      .list()
      .then((items) => {
        if (!ignore) setAnnouncements(items);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load announcement.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    const unsubscribe = subscribeAnnouncementsChanged(load);

    void load();

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, []);

  const announcement = announcements.find((a) => a.id === id);

  if (loading || error || !announcement) {
    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="News"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Announcements', to: '/announcements' }, { label: 'Not found' }]}
          title={loading ? 'Loading announcement' : error ? 'Announcements unavailable' : 'Announcement not found'}
          subtitle={loading ? 'Fetching the latest post from the society database.' : error ?? 'This post may have been removed or the link is incorrect.'}
        />
        <PageSection tone="cream" top>
          <EmptyState title={loading ? 'Loading' : error ? 'Unable to load' : 'Nothing here'} description={loading ? undefined : error ?? undefined} action={
            <Link to="/announcements" className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark">
              Back to Announcements
            </Link>
          } />
        </PageSection>
      </div>
    );
  }

  const others = announcements.filter((a) => a.id !== announcement.id).slice(0, 3);

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow={announcement.category}
        breadcrumb={[
          { label: 'Home', to: '/' },
          { label: 'Announcements', to: '/announcements' },
          { label: announcement.title },
        ]}
        title={announcement.title}
        subtitle={formatDate(announcement.date)}
      />

      <PageSection tone="cream" top width="narrow">
        <Link
          to="/announcements"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-ieee-orange"
        >
          <ArrowLeft className="h-4 w-4" /> All announcements
        </Link>

        <article className="mt-6 overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
          <div className="p-8 sm:p-10">
            <p className="leading-relaxed text-slate-700">{announcement.body}</p>
          </div>
        </article>

        {others.length > 0 && (
          <div className="mt-12">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-ieee-orange">
              More announcements
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {others.map((a) => (
                <Link
                  key={a.id}
                  to={`/announcements/${a.id}`}
                  data-cursor="link"
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ieee-orange/30 hover:shadow-md"
                >
                  <span className="text-sm font-semibold text-slate-800">{a.title}</span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ieee-orange" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </PageSection>
    </div>
  );
}
