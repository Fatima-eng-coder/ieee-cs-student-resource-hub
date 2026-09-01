import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  GraduationCap,
  Trophy,
  Users2,
  Building2,
  Clock3,
  Globe2,
} from 'lucide-react';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import SectionHeading from '@/components/layout/SectionHeading';
import Magnetic from '@/components/effects/Magnetic';
import { PLACEHOLDER_PHOTO } from '@/data/hierarchy';
import {
  hierarchyService,
  indexRoles,
  sortMembers,
  titleForRole,
  type HierarchyCouncil,
} from '@/services/hierarchyService';

const pillars = [
  {
    icon: CalendarDays,
    title: 'Events & Workshops',
    body: 'Hands-on workshops, seminars and our flagship hackathons every semester — free for members.',
  },
  {
    icon: GraduationCap,
    title: 'Technical Resources',
    body: 'A verified archive of past papers, course description forms and lab manuals, maintained by students.',
  },
  {
    icon: Users2,
    title: 'Mentorship',
    body: 'Senior members and alumni guide juniors through courses, internships and open-source contributions.',
  },
  {
    icon: Trophy,
    title: 'Competitions',
    body: 'We field teams for national programming contests and run the annual student Projects Expo.',
  },
];

const stats = [
  { value: '2020', label: 'Founded' },
  { value: '500+', label: 'Active Members' },
  { value: '40+', label: 'Events / Year' },
  { value: '120+', label: 'Projects Shipped' },
];

export default function AboutPage() {
  /*
   * The serving council, read from the database rather than from the static roster this page
   * used to import. `loadCurrentCouncil` finds the term by its is_current flag; the previous
   * code took terms[0], which is the newest row and stops being the serving one the moment a
   * term is promoted back out of the archive.
   */
  const [council, setCouncil] = useState<HierarchyCouncil | null>(null);
  const [councilFailed, setCouncilFailed] = useState(false);

  useEffect(() => {
    let ignore = false;

    hierarchyService
      .loadCurrentCouncil()
      .then((loaded) => {
        if (!ignore) setCouncil(loaded);
      })
      .catch((error) => {
        console.error('Could not load the council', error);
        if (!ignore) setCouncilFailed(true);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const roleIndex = useMemo(() => indexRoles(council?.roles ?? []), [council]);
  const councilMembers = useMemo(
    () => sortMembers(council?.members ?? [], roleIndex),
    [council, roleIndex]
  );

  return (
    <div className="relative">
      <PageHero
        eyebrow="Who We Are"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'About' }]}
        title={
          <>
            IEEE Computer Society
            <br />
            <span className="text-ieee-orange">Islamabad Branch Chapter</span>
          </>
        }
        subtitle="The world's leading membership organization for computing professionals — brought to campus. We run the mentorship, events and technical resources behind everything on this hub."
        meta={stats}
      >
        <Magnetic>
          <Link
            to="/events"
            data-cursor="link"
            className="group flex items-center gap-2 rounded-xl bg-ieee-orange px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.32)] transition hover:bg-ieee-orange-dark"
          >
            Explore Events
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Magnetic>
        <Magnetic>
          <Link
            to="/contribute"
            data-cursor="link"
            className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur transition hover:border-ieee-orange/50 hover:text-ieee-orange"
          >
            Get Involved
          </Link>
        </Magnetic>
      </PageHero>

      {/* Mission */}
      <PageSection tone="cream" top>
        <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <SectionHeading
            flourish
            eyebrow="Our Mission"
            title="Bringing IEEE CS's global network to campus."
            description="IEEE Computer Society is the world's leading membership organization dedicated to computer science and technology — technical resources, conferences, publications and career development for computing professionals worldwide. Our student chapter brings all of that directly to students on campus, run entirely by student volunteers."
          />
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="glass-panel relative overflow-hidden rounded-3xl border-black/5 p-8 shadow-[0_8px_30px_rgba(10,10,12,0.08)]"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ieee-orange/10 blur-[80px]" />
            <Globe2 className="h-9 w-9 text-ieee-orange" strokeWidth={1.5} />
            <p className="mt-4 font-display text-lg font-semibold text-slate-900">
              A global society, a local home.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              We organize workshops, hackathons, seminars and a project showcase every semester, while
              maintaining this resource hub for past papers, course material and campus navigation —
              built and maintained by students, for students.
            </p>
          </motion.div>
        </div>
      </PageSection>

      {/* Pillars */}
      <PageSection tone="white">
        <SectionHeading
          align="center"
          eyebrow="What We Do"
          title="Four pillars, one community."
          description="Everything we run ladders up to helping CS students learn faster and go further together."
        />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {pillars.map((p) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } }}
                className="group relative overflow-hidden rounded-2xl border border-black/5 bg-cream p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-ieee-orange/30 hover:shadow-lg"
              >
                <Icon
                  className="pointer-events-none absolute -bottom-5 -right-5 h-24 w-24 text-ieee-orange/[0.05] transition-transform duration-500 group-hover:scale-110"
                  strokeWidth={1}
                />
                <span className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-ieee-orange/10 text-ieee-orange">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <h3 className="relative mt-5 font-display text-lg font-semibold text-slate-900">{p.title}</h3>
                <p className="relative mt-2 text-sm text-slate-600">{p.body}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </PageSection>

      {/* Council preview */}
      <PageSection tone="cream">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            eyebrow={`Executive Council${council?.term ? ` · ${council.term.term}` : ''}`}
            title="The students steering the chapter."
          />
          <Magnetic>
            <Link
              to="/about/hierarchy"
              data-cursor="link"
              className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-ieee-orange/40 hover:text-ieee-orange"
            >
              Full hierarchy <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Magnetic>
        </div>
        {councilMembers.length === 0 ? (
          <p className="mt-12 text-sm text-slate-500">
            {councilFailed
              ? 'The council roster could not be loaded right now.'
              : council
                ? 'The council roster has not been published yet.'
                : 'Loading the council…'}
          </p>
        ) : (
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
            className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6"
          >
            {councilMembers.map((m) => (
              <motion.div
                key={m.id}
                variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                className="group flex flex-col items-center rounded-2xl border border-black/5 bg-white p-5 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-ieee-orange/20 blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <img
                    src={m.photo || PLACEHOLDER_PHOTO}
                    alt={m.name}
                    loading="lazy"
                    className="relative h-16 w-16 rounded-full object-cover ring-2 ring-white"
                  />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">{m.name}</p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-ieee-orange">
                  {titleForRole(roleIndex, m.roleSlug)}
                </p>
              </motion.div>
            ))}
          </motion.div>
        )}
      </PageSection>

      {/* Explore more */}
      <PageSection tone="white">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              to: '/about/hierarchy',
              icon: Building2,
              title: 'Leadership Hierarchy',
              body: 'Meet the current and previous executive councils, term by term.',
            },
            {
              to: '/about/timeline',
              icon: Clock3,
              title: 'Chapter Timeline',
              body: 'A history of our chapter, from founding to today’s milestones.',
            },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.to}
                to={c.to}
                data-cursor="link"
                className="group relative flex items-center gap-5 overflow-hidden rounded-3xl border border-black/5 bg-cream p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-ieee-orange/30 hover:shadow-lg"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ieee-orange/10 text-ieee-orange">
                  <Icon className="h-7 w-7" strokeWidth={1.5} />
                </span>
                <div>
                  <h3 className="flex items-center gap-1.5 font-display text-lg font-semibold text-slate-900">
                    {c.title}
                    <ArrowUpRight className="h-4 w-4 text-slate-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ieee-orange" />
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">{c.body}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </PageSection>
    </div>
  );
}
