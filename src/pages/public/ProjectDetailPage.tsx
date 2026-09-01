import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Check, Code2, ExternalLink, Share2, Users2, X } from 'lucide-react';
import { projectsService, subscribeProjectsChanged, type Project } from '@/services/projectsService';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import EmptyState from '@/components/ui/EmptyState';
import Avatar from '@/components/ui/Avatar';
import Magnetic from '@/components/effects/Magnetic';
import { timeAgo } from '@/utils/time';

const backToProjects = (
  <Link
    to="/projects-expo"
    className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
  >
    Back to Projects
  </Link>
);

/**
 * One approved project.
 *
 * There is no separate coming-soon screen here, and there does not need to be one: the read
 * asks for an approved row by id, so while the showcase has nothing approved this page has
 * nothing to show and says so. It lights up for exactly the projects the expo page lists, at
 * the same moment, for the same reason.
 *
 * A student's own pending submission is deliberately not shown here either. They can read it
 * back — the policy allows it — but a detail page is the public view of a project, and dressing
 * an unreviewed submission up as one would misrepresent what has been published. It is listed,
 * with its status, on the submit page instead.
 */
export default function ProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(() => {
    projectsService
      .getApproved(id)
      .then((found) => {
        setProject(found);
        setError('');
      })
      .catch((cause: unknown) => {
        setProject(null);
        setError(cause instanceof Error ? cause.message : 'This project could not be loaded.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
    const unsubscribe = subscribeProjectsChanged(load);
    return unsubscribe;
  }, [load]);

  const runShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: project?.title ?? 'Project', url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* dismissed */
    }
  };

  if (loading) {
    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Project"
          title="Loading…"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Projects', to: '/projects-expo' }, { label: '…' }]}
        />
        <PageSection tone="cream" top>
          <div className="h-96 animate-pulse rounded-3xl border border-black/5 bg-white" />
        </PageSection>
      </div>
    );
  }

  // Kept apart from "not found" on purpose: one says this project is not published, the other
  // says we do not know. Collapsing them would tell a visitor a project had been removed when
  // the only thing that actually happened was a failed request.
  if (error) {
    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Project"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Projects', to: '/projects-expo' }, { label: 'Error' }]}
          title="This project could not be loaded"
          subtitle="This is a fault on our side. The project may well still be there."
        />
        <PageSection tone="cream" top width="narrow">
          <div
            role="alert"
            className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-medium text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
          <div className="mt-6 text-center">{backToProjects}</div>
        </PageSection>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Projects"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Projects', to: '/projects-expo' }, { label: 'Not found' }]}
          title="Project not found"
          subtitle="This project may not be published yet, or the link is incorrect."
        />
        <PageSection tone="cream" top>
          <EmptyState title="Nothing here" action={backToProjects} />
        </PageSection>
      </div>
    );
  }

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow={project.category ?? 'Project'}
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Projects', to: '/projects-expo' }, { label: project.title }]}
        title={project.title}
        subtitle={project.tagline}
      />

      <PageSection tone="cream" top width="wide">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Avatar name={project.authorName || 'IEEE CS'} size="lg" />
              <div>
                <p className="font-semibold text-slate-900">{project.authorName || 'IEEE CS'}</p>
                <p className="text-xs text-slate-500">Posted {timeAgo(project.createdAt)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void runShare()}
              data-cursor="link"
              className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-slate-500 transition-colors hover:text-ieee-orange"
            >
              {copied ? <Check className="h-[18px] w-[18px] text-emerald-600" /> : <Share2 className="h-[18px] w-[18px]" />}
              {copied ? 'Link copied' : 'Share'}
            </button>
          </div>

          {project.screenshots.length > 0 && (
            <div className={`mt-6 grid gap-3 ${project.screenshots.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {project.screenshots.map((screenshot, index) => (
                <motion.button
                  key={screenshot}
                  type="button"
                  onClick={() => setLightbox(screenshot)}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                  className={`group overflow-hidden rounded-2xl border border-black/5 shadow-sm ${
                    project.screenshots.length === 3 && index === 0 ? 'col-span-2' : ''
                  }`}
                >
                  <img
                    src={screenshot}
                    alt={`${project.title} screenshot ${index + 1}`}
                    loading="lazy"
                    className="h-full max-h-80 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </motion.button>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-3xl border border-black/5 bg-white p-7 shadow-sm sm:p-8">
            <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{project.description}</p>

            {project.techStack.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {project.techStack.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-full border border-ieee-orange/20 bg-ieee-orange/10 px-3 py-1.5 font-mono text-xs text-ieee-orange"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center gap-2 border-t border-black/5 pt-5 text-sm text-slate-600">
              <Users2 className="h-4 w-4 text-ieee-orange" />
              <span className="font-medium text-slate-800">Built by</span>{' '}
              {project.creators.join(', ') || project.authorName}
            </div>

            {(project.githubUrl || project.demoUrl) && (
              <div className="mt-5 flex flex-wrap gap-3">
                {project.demoUrl && (
                  <Magnetic>
                    <a
                      href={project.demoUrl}
                      target="_blank"
                      rel="noreferrer"
                      data-cursor="link"
                      className="flex items-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.3)] transition hover:bg-ieee-orange-dark"
                    >
                      <ExternalLink className="h-4 w-4" /> Live Demo
                    </a>
                  </Magnetic>
                )}
                {project.githubUrl && (
                  <Magnetic>
                    <a
                      href={project.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      data-cursor="link"
                      className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
                    >
                      <Code2 className="h-4 w-4" /> View Code
                    </a>
                  </Magnetic>
                )}
              </div>
            )}
          </div>
        </div>
      </PageSection>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-ieee-ink/85 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <motion.img
              key={lightbox}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              src={lightbox}
              alt="Screenshot"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
