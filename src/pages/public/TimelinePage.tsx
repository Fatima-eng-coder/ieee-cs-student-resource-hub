import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Flag } from 'lucide-react';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import EmptyState from '@/components/ui/EmptyState';
import RichText from '@/components/ui/RichText';
import { timelineService } from '@/services/timelineService';
import type { TimelineEvent } from '@/types';

/**
 * The chapter's milestones, now read from the database instead of a checked-in array.
 *
 * The array this replaced was invented — a founding date, a first hackathon, a membership count,
 * an award — and nothing on the page distinguished it from a record of things that happened. It
 * is gone, and until the team records a real milestone in the portal this page says plainly that
 * there is nothing here yet rather than filling the rail with plausible-looking history.
 */

const breadcrumb = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/about' },
  { label: 'Timeline' },
];

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Formatted from the stored characters, not via a Date.
 *
 * `new Date('2020-09-01')` is parsed as UTC midnight, and toLocaleDateString then renders it in
 * the reader's zone — so anywhere west of Greenwich a milestone dated the 1st displays as the
 * previous month. The column holds a plain calendar date with no zone attached to it, and this
 * shows exactly that date to everyone.
 */
function formatDate(iso: string): string {
  const [year, month] = iso.split('-');
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${year}` : year;
}

export default function TimelinePage() {
  const [milestones, setMilestones] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    timelineService
      .list()
      .then((items) => {
        if (!ignore) setMilestones(items);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'The timeline could not be loaded.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  // The list is ordered oldest first, so the first entry is the earliest thing recorded. Stated
  // as "Earliest" rather than "Founded": the oldest milestone anybody has entered is not
  // necessarily the founding, and the old page asserted it was.
  const earliest = milestones[0]?.date.slice(0, 4);

  /**
   * Deliberately neutral while the read is in flight: it must not say the timeline is empty,
   * because nobody has looked yet, and it must not promise milestones that may not arrive.
   */
  const subtitle = loading
    ? 'Loading the milestones recorded so far…'
    : "Key moments in the chapter's journey, as recorded by the team.";

  return (
    <div className="relative">
      <PageHero
        eyebrow="Our Journey"
        breadcrumb={breadcrumb}
        title="Chapter Timeline"
        subtitle={subtitle}
        meta={
          milestones.length > 0
            ? [
                ...(earliest ? [{ value: earliest, label: 'Earliest' }] : []),
                { value: String(milestones.length), label: 'Milestones' },
              ]
            : undefined
        }
      />

      <PageSection tone="cream" top width="narrow">
        {loading && <div className="h-64 animate-pulse rounded-3xl border border-black/5 bg-white" />}

        {/* A failed read means "we do not know", which is not the same as "there is nothing" —
            telling a visitor the chapter has no history because a request timed out would be
            worse than saying the page is having trouble. */}
        {!loading && error && (
          <EmptyState
            icon="alert"
            title="The timeline could not be loaded"
            description={error}
          />
        )}

        {!loading && !error && milestones.length === 0 && (
          <EmptyState
            icon="clock"
            title="No milestones recorded yet"
            description="The team is putting the chapter's history together. Once milestones are added here, they will appear on this page."
          />
        )}

        {!loading && !error && milestones.length > 0 && (
          <div className="relative pl-10 sm:pl-14">
            {/* rail */}
            <div className="absolute left-[13px] top-2 h-[calc(100%-1rem)] w-px bg-gradient-to-b from-ieee-orange via-slate-300 to-transparent sm:left-[17px]" />

            {milestones.map((event, idx) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.45, delay: idx * 0.04 }}
                className="relative mb-8 last:mb-0"
              >
                {/* node */}
                <span className="absolute -left-10 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-ieee-orange text-white shadow-[0_4px_14px_rgba(255,108,12,0.4)] ring-4 ring-cream sm:-left-14">
                  <Flag className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>

                <div className="group rounded-2xl border border-black/5 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-ieee-orange/30 hover:shadow-lg">
                  <span className="font-mono text-xs font-semibold uppercase tracking-widest text-ieee-orange">
                    {formatDate(event.date)}
                  </span>
                  <h3 className="mt-1.5 font-display text-lg font-bold text-slate-900">{event.title}</h3>
                  {/* RichText rather than a bare <p>: the description is typed into a textarea, so
                      paragraphs and bullet lists survive instead of collapsing into one line. A
                      milestone with no description simply has no body — RichText renders nothing
                      for empty text, which is why there is no length check here. */}
                  <RichText
                    text={event.description}
                    className="mt-1.5 text-sm leading-relaxed text-slate-600"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
