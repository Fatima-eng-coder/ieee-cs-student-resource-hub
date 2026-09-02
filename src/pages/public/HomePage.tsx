import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import HeroSection from '@/components/layout/HeroSection';
import QuickLinkGrid from '@/components/layout/QuickLinkGrid';
import EventsShowcase from '@/components/home/EventsShowcase';
import HierarchyOrbit from '@/components/home/HierarchyOrbit';
import PromoBanners from '@/components/home/PromoBanners';
import ScrollProgress from '@/components/effects/ScrollProgress';
import Magnetic from '@/components/effects/Magnetic';
import { eventsService, subscribeEventsChanged } from '@/services/eventsService';
import type { EventItem } from '@/types';

export default function HomePage() {
  const [events, setEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    let ignore = false;

    const loadEvents = () =>
      eventsService
        .listPublic()
        .then((items) => {
          if (!ignore) setEvents(items);
        })
        .catch(() => {
          if (!ignore) setEvents([]);
        });

    const unsubscribe = subscribeEventsChanged(loadEvents);
    void loadEvents();

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, []);

  const flagship = useMemo(() => {
    const featured = events.filter((e) => e.featured);
    const upcoming = events.filter((e) => e.timing === 'upcoming');
    return (featured.length ? featured : upcoming.length ? upcoming : events).slice(0, 6);
  }, [events]);

  return (
    <div className="relative">
      <ScrollProgress />

      <HeroSection />

      {/* Below the hero on purpose. The banners arrive after first paint, and the hero's
          min-height keeps this insertion point past the fold, so nothing the reader can see at
          scroll 0 moves when they land. Moving this above the hero reintroduces that shift. */}
      <PromoBanners />

      <HierarchyOrbit />
      <QuickLinkGrid />
      <EventsShowcase events={flagship} />

      <motion.section
        id="about-cta"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-12"
      >
        <div className="relative overflow-hidden rounded-3xl border border-black/5 bg-white p-10 shadow-sm sm:p-14">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-ieee-orange/10 blur-[100px]" />
          <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div>
              <span className="font-mono text-xs font-medium uppercase tracking-widest text-ieee-orange">
                Who We Are
              </span>
              <h3 className="mt-3 max-w-xl font-display text-2xl font-bold text-slate-900 sm:text-3xl">
                IEEE Computer Society — Islamabad Branch Chapter
              </h3>
              <p className="mt-3 max-w-xl text-slate-600">
                The world&apos;s leading membership organization for computing professionals, brought
                to campus. We run the mentorship, events, and technical resources behind everything on
                this hub — designed and built by student volunteers.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row md:flex-col">
              <Magnetic>
                <Link
                  to="/about"
                  data-cursor="link"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-ieee-ink px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-black"
                >
                  Learn More <ArrowRight className="h-4 w-4" />
                </Link>
              </Magnetic>
              <Magnetic>
                <Link
                  to="/developers"
                  data-cursor="link"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
                >
                  Meet the Developers <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Magnetic>
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
