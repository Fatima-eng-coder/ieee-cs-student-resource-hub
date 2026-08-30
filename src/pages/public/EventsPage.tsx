import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { eventsService, subscribeEventsChanged } from '@/services/eventsService';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import EventCard from '@/components/cards/EventCard';
import EmptyState from '@/components/ui/EmptyState';
import type { EventCategory, EventItem, EventTiming } from '@/types';

type TabKey = EventTiming | 'featured' | EventCategory;

const tabs: { key: TabKey; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'previous', label: 'Previous' },
  { key: 'featured', label: 'Featured' },
  { key: 'workshop', label: 'Workshops' },
  { key: 'competition', label: 'Competitions' },
  { key: 'seminar', label: 'Seminars' },
  { key: 'session', label: 'Sessions' },
  { key: 'hackathon', label: 'Hackathons' },
  { key: 'other', label: 'Other' },
];

const getCleanEventsError = (err: unknown) => {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  if (message.includes('permission') || message.includes('row-level security')) {
    return 'Events could not be loaded because public event access is currently restricted.';
  }
  if (message.includes('does not exist') || message.includes('schema cache')) {
    return 'Events are not ready yet. Please check the events table and Data API settings.';
  }
  return 'Events could not be loaded right now. Please try again later.';
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('upcoming');

  useEffect(() => {
    let ignore = false;

    const load = () =>
      eventsService
        .listPublic()
        .then((items) => {
          if (!ignore) {
            setEvents(items);
            setError(null);
          }
        })
        .catch((err) => {
          if (!ignore) setError(getCleanEventsError(err));
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });

    const unsubscribe = subscribeEventsChanged(load);
    void load();

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, []);

  const filtered = useMemo(() => {
    if (tab === 'upcoming' || tab === 'previous') return events.filter((e) => e.timing === tab);
    if (tab === 'featured') return events.filter((e) => e.featured);
    return events.filter((e) => e.category === tab);
  }, [events, tab]);

  const upcomingCount = events.filter((e) => e.timing === 'upcoming').length;

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="What's On"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Events' }]}
        title="Events & Workshops"
        subtitle="Workshops, competitions, seminars and hackathons run by IEEE CS — learn something new, build something real, meet your people."
        meta={[
          { value: `${upcomingCount}`, label: 'Upcoming' },
          { value: `${events.length}`, label: 'Total This Year' },
        ]}
      />

      <PageSection tone="cream" top>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              data-cursor="link"
              className={`relative rounded-full px-4 py-2 text-sm font-semibold transition ${
                tab === t.key
                  ? 'text-white'
                  : 'border border-black/10 bg-white text-slate-600 hover:border-ieee-orange/50 hover:text-ieee-orange'
              }`}
            >
              {tab === t.key && (
                <motion.span
                  layoutId="event-tab-bg"
                  className="absolute inset-0 rounded-full bg-ieee-orange shadow-[0_6px_20px_rgba(255,108,12,0.3)]"
                  transition={{ duration: 0.25 }}
                />
              )}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-8">
          {loading ? (
            <EmptyState title="Loading events" description="Fetching the latest events from the society database." />
          ) : error ? (
            <EmptyState title="Events unavailable" description={error} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No events in this category" description="Check back soon for updates." />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((event, idx) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                >
                  <EventCard event={event} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </PageSection>
    </div>
  );
}
