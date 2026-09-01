import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowUpRight, CalendarDays, Compass, FileText, LayoutGrid, Users2 } from 'lucide-react';
import ComingSoon, { type MeanwhileLink } from '@/components/layout/ComingSoon';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import { projectsService, subscribeProjectsChanged, type Project } from '@/services/projectsService';

const meanwhile: MeanwhileLink[] = [
  {
    label: 'Events',
    description: 'Workshops, hackathons and seminars running this semester.',
    to: '/events',
    icon: CalendarDays,
  },
  {
    label: 'Past Papers',
    description: 'Verified midterms, finals and quizzes across every course.',
    to: '/past-papers',
    icon: FileText,
  },
  {
    label: 'CS Block Navigation',
    description: 'Step-by-step indoor routes to any room or lab.',
    to: '/navigation',
    icon: Compass,
  },
];

/**
 * The showcase, still parked — but parked on the data rather than on a hard-coded screen.
 *
 * public.projects is live and collecting; nothing has been approved yet, so this renders the
 * same coming-soon page it always did. The moment a content manager approves the first project
 * the grid below takes over on its own, with no code change and no deploy. That is the whole
 * point of wiring it this way: "the page is off" and "there is nothing approved to show" are the
 * same state, and the second one ends by itself.
 *
 * A failed read is deliberately NOT folded into that. An error rendered as coming-soon would
 * tell a visitor the showcase is parked when in fact nobody knows what is in it.
 */
export default function ProjectsExpoPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    projectsService
      .listApproved()
      .then((items) => {
        setProjects(items);
        setError('');
      })
      .catch((cause: unknown) => {
        setProjects([]);
        setError(cause instanceof Error ? cause.message : 'The project showcase could not be loaded.');
      });
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = subscribeProjectsChanged(load);
    return unsubscribe;
  }, [load]);

  if (error) {
    return (
      <div className="relative">
        <PageHero
          compact
          align="center"
          eyebrow="Projects"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Projects' }]}
          title="The showcase could not be loaded"
          subtitle="This is a fault on our side, not an empty showcase. Please try again in a moment."
        />
        <PageSection tone="cream" top width="narrow">
          <div
            role="alert"
            className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-medium text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        </PageSection>
      </div>
    );
  }

  // Nothing has come back yet. Rendering the parked screen here would flash it on every visit
  // once projects exist, so the page holds a quiet placeholder until the read answers.
  if (projects === null) {
    return (
      <div className="relative">
        <PageHero
          compact
          align="center"
          eyebrow="Projects"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Projects' }]}
          title="Projects"
          subtitle="Loading the student project showcase…"
        />
        <PageSection tone="cream" top>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-72 animate-pulse rounded-2xl border border-black/5 bg-white" />
            ))}
          </div>
        </PageSection>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <ComingSoon
        eyebrow="Projects"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Projects' }]}
        title="The projects showcase is being rebuilt."
        description="We're reworking how student projects are submitted, credited and discovered, so the showcase is offline while that lands. Submissions reopen with it."
        icon={LayoutGrid}
        meanwhile={meanwhile}
      />
    );
  }

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Projects"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Projects' }]}
        title="Student Projects"
        subtitle="Everything here was built by CUI Computer Science students and checked by the IEEE CS team."
        meta={[{ value: `${projects.length}`, label: projects.length === 1 ? 'Project' : 'Projects' }]}
      >
        <Link
          to="/projects-expo/submit"
          data-cursor="link"
          className="inline-flex items-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.3)] transition hover:bg-ieee-orange-dark"
        >
          Share your project
        </Link>
      </PageHero>

      <PageSection tone="cream" top>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, index) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.35, delay: (index % 3) * 0.05 }}
            >
              <Link
                to={`/projects-expo/${project.id}`}
                data-cursor="link"
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-ieee-orange/30 hover:shadow-lg"
              >
                {project.screenshots[0] ? (
                  <img
                    src={project.screenshots[0]}
                    alt={project.title}
                    loading="lazy"
                    className="h-44 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-44 w-full items-center justify-center bg-cream text-ieee-orange/40">
                    <LayoutGrid className="h-10 w-10" strokeWidth={1.25} />
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-2 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-lg font-bold text-slate-900">{project.title}</h2>
                    <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ieee-orange" />
                  </div>
                  <p className="text-sm text-slate-600">{project.tagline}</p>

                  {project.techStack.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {project.techStack.slice(0, 4).map((tech) => (
                        <span
                          key={tech}
                          className="rounded-full bg-cream px-2.5 py-1 font-mono text-[11px] text-slate-600"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-slate-500">
                    <Users2 className="h-3.5 w-3.5 text-ieee-orange" />
                    {project.creators.join(', ') || project.authorName}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
