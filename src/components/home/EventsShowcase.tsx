import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, MapPin, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { EventItem } from '@/types';

const categoryLabel: Record<EventItem['category'], string> = {
  workshop: 'Workshop',
  competition: 'Competition',
  seminar: 'Seminar',
  session: 'Session',
  hackathon: 'Hackathon',
  other: 'Other',
};

interface EventsShowcaseProps {
  events: EventItem[];
}

const slide = {
  enter: (dir: number) => ({ x: dir > 0 ? 90 : -90, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -90 : 90, opacity: 0 }),
};

export default function EventsShowcase({ events }: EventsShowcaseProps) {
  const [[index, dir], setIndex] = useState<[number, number]>([0, 0]);
  const [paused, setPaused] = useState(false);
  const count = events.length;

  const go = (d: number) => setIndex(([i]) => [(i + d + count) % count, d]);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = setInterval(() => setIndex(([i]) => [(i + 1) % count, 1]), 5500);
    return () => clearInterval(t);
  }, [count, paused]);

  if (count === 0) return null;
  const event = events[index % count];

  return (
    <section id="events" className="relative overflow-hidden bg-ieee-ink py-20 text-white sm:py-28">
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-ieee-orange/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-ieee-yellow/10 blur-[120px]" />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="font-mono text-xs font-medium uppercase tracking-widest text-ieee-orange">
              Don&apos;t Miss Out
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Flagship Events</h2>
          </div>
          <Link
            to="/events"
            data-cursor="link"
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-ieee-orange hover:text-ieee-orange sm:flex"
          >
            View all / Upcoming events <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div
          className="relative mt-10"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={event.id}
                custom={dir}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="grid gap-0 md:grid-cols-2"
              >
                <div className="relative h-56 overflow-hidden md:h-full md:min-h-[340px]">
                  <img src={event.image} alt={event.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ieee-ink/70 via-transparent to-transparent md:bg-gradient-to-r" />
                  <span className="absolute left-4 top-4 rounded-full bg-white/90 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-ieee-ink">
                    {categoryLabel[event.category]}
                  </span>
                </div>

                <div className="flex flex-col justify-center gap-4 p-7 sm:p-9">
                  <h3 className="font-display text-2xl font-bold leading-tight text-white sm:text-3xl">
                    {event.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-white/60">{event.description}</p>
                  <div className="flex flex-col gap-1.5 font-mono text-xs text-white/50">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" /> {event.date} · {event.time}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> {event.venue}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <Link
                      to={`/events/${event.id}`}
                      data-cursor="link"
                      className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.32)] transition hover:bg-ieee-orange-dark"
                    >
                      View details <ArrowRight className="h-4 w-4" />
                    </Link>
                    {event.registrationOpen && (
                      <Link
                        to={`/events/${event.id}/register`}
                        data-cursor="link"
                        className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:border-ieee-orange/50 hover:text-ieee-orange"
                      >
                        Register
                      </Link>
                    )}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                data-cursor="link"
                aria-label="Previous event"
                className="absolute -left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-ieee-ink/80 text-white backdrop-blur transition hover:border-ieee-orange hover:text-ieee-orange sm:-left-5"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                data-cursor="link"
                aria-label="Next event"
                className="absolute -right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-ieee-ink/80 text-white backdrop-blur transition hover:border-ieee-orange hover:text-ieee-orange sm:-right-5"
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              <div className="mt-6 flex items-center justify-center gap-2">
                {events.map((e, i) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setIndex([i, i > index ? 1 : -1])}
                    aria-label={`Go to event ${i + 1}`}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i === index ? 'w-6 bg-ieee-orange' : 'w-2 bg-white/25 hover:bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
