import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { PLACEHOLDER_PHOTO } from '@/data/hierarchy';
import {
  hierarchyService,
  indexRoles,
  sortMembers,
  titleForRole,
  type HierarchyCouncil,
} from '@/services/hierarchyService';

const roleBlurb: Record<string, string> = {
  'faculty-advisor': 'Guides the chapter and links it to the department.',
  chairperson: "Sets the chapter's direction and represents it to IEEE CS.",
  'vice-chairperson': 'Supports leadership and steps in wherever needed.',
  'general-secretary': 'Keeps records, minutes, and chapter operations on track.',
  'operations-manager': 'Runs events end to end, from logistics to delivery.',
  'web-master': "Builds and maintains the chapter's web presence.",
  treasurer: 'Manages chapter funds, sponsorships, and budgeting.',
  'graphic-designer': "Shapes the chapter's visual identity and campaign artwork.",
  'joint-secretary': 'Supports the secretariat across events and day-to-day operations.',
};
const fallbackBlurb = 'Active contributor to the IEEE CS student chapter.';



const groupVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.9 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: 'backOut' } },
};

export default function HierarchyOrbit() {
  /*
   * The council is fetched, not imported. This previously read a localStorage store seeded
   * from src/data/hierarchy.ts, so the homepage showed whatever that browser happened to have
   * cached and never saw an admin's edit at all.
   *
   * The fetch is deliberately not awaited anywhere up the tree: the homepage paints without
   * it, and this section appears when the roster arrives. Nothing is drawn while it is in
   * flight — a half-drawn board of missing faces would be worse than no section.
   *
   * A read that fails is not the same as a council nobody has published, so it does not
   * silently vanish: the heading stays and says the roster could not be loaded, matching what
   * AboutPage and HierarchyPage say about the same outage.
   */
  const [council, setCouncil] = useState<HierarchyCouncil | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ignore = false;

    hierarchyService
      .loadCurrentCouncil()
      .then((loaded) => {
        if (!ignore) setCouncil(loaded);
      })
      .catch((error) => {
        console.error('Could not load the council for the homepage', error);
        if (!ignore) setFailed(true);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const roleIndex = useMemo(() => indexRoles(council?.roles ?? []), [council]);
  const members = useMemo(
    () => sortMembers(council?.members ?? [], roleIndex),
    [council, roleIndex]
  );

  if (members.length === 0 && !failed) return null;

  return (
    <section id="hierarchy" className="relative px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-xl text-center">
          <span className="font-mono text-xs font-medium uppercase tracking-widest text-ieee-orange">
            The People
          </span>
          <h2 className="mt-3 font-display text-3xl font-bold text-cream sm:text-4xl">
            Chapter Hierarchy
          </h2>
          <p className="mt-3 text-white/60">
            {failed
              ? 'The council roster could not be loaded right now.'
              : `The ${council?.term?.label ?? 'current'} team steering the chapter.`}
          </p>
          <Link
            to="/about/hierarchy"
            data-cursor="link"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ieee-orange hover:underline"
          >
            View full hierarchy <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {members.length > 0 && (
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            variants={groupVariants}
            className="mt-10 grid grid-cols-3 gap-x-4 gap-y-8 sm:mt-14 sm:grid-cols-4 sm:gap-y-10 md:grid-cols-6 lg:grid-cols-7"
          >
            {members.map((member, i) => {
              const blurb = roleBlurb[member.roleSlug] ?? fallbackBlurb;
              return (
                <motion.div
                  key={member.id}
                  variants={cardVariants}
                  data-cursor="link"
                  className="group relative flex flex-col items-center gap-2 text-center"
                >
                  <div
                    className="animate-float-y"
                    style={{ animationDelay: `${(i % 6) * 0.4}s`, animationDuration: `${5 + (i % 4)}s` }}
                  >
                    <div className="relative">
                      <img
                        src={member.photo || PLACEHOLDER_PHOTO}
                        alt={member.name}
                        className="h-16 w-16 rounded-full border-2 border-white/15 object-cover shadow-md transition-all duration-300 group-hover:scale-110 group-hover:border-ieee-orange/60 sm:h-20 sm:w-20"
                      />
                      <span className="absolute inset-0 rounded-full opacity-0 shadow-[0_0_0_6px_rgba(255,108,12,0.12)] transition-opacity duration-300 group-hover:opacity-100" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-cream sm:text-sm">{member.name}</p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-ieee-orange sm:text-[10px]">
                      {titleForRole(roleIndex, member.roleSlug)}
                    </p>
                  </div>

                  <div className="glass-panel-dark pointer-events-none absolute -top-3 left-1/2 z-30 w-40 -translate-x-1/2 -translate-y-full rounded-xl border-white/10 p-2.5 text-center opacity-0 shadow-2xl transition-opacity duration-200 group-hover:opacity-100">
                    <p className="text-[11px] leading-snug text-white/80">{blurb}</p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </section>
  );
}
