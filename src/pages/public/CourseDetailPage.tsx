import { Link, useParams } from 'react-router-dom';
import {
  BookOpen,
  FlaskConical,
  ExternalLink,
  Target,
  Lightbulb,
  CheckCircle2,
  PencilLine,
  GitBranch,
  ArrowRight,
  ClipboardList,
} from 'lucide-react';
import { useCourses } from '@/hooks/useCourses';
import { useFaculty } from '@/hooks/useFaculty';
import type { Course } from '@/types';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import SectionHeading from '@/components/layout/SectionHeading';
import DownloadButton from '@/components/ui/DownloadButton';
import EmptyState from '@/components/ui/EmptyState';
import Magnetic from '@/components/effects/Magnetic';

export default function CourseDetailPage() {
  const { id } = useParams();
  const { courses, loading, error } = useCourses();
  const { teachers } = useFaculty();
  const course = courses.find((c) => c.id === id);

  if (loading) {
    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Academics"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Courses', to: '/courses' }, { label: 'Loading' }]}
          title="Loading course"
          subtitle="Fetching the latest course details."
        />
        <PageSection tone="cream" top>
          <EmptyState title="Loading course" description="Please wait a moment." />
        </PageSection>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="relative">
        <PageHero
          compact
          eyebrow="Academics"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Courses', to: '/courses' }, { label: 'Not found' }]}
          title={error ? 'Could not load course' : 'Course not found'}
          subtitle={error ?? 'This course may have been removed or the link is incorrect.'}
        />
        <PageSection tone="cream" top>
          <EmptyState
            title="Nothing here"
            action={
              <Link to="/courses" className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark">
                Back to Courses
              </Link>
            }
          />
        </PageSection>
      </div>
    );
  }

  const courseTeachers = teachers.filter((t) => course.teacherIds.includes(t.id));
  const hasLab = (course.labHours ?? 0) > 0;
  const prereqCourses = (course.prerequisites ?? [])
    .map((code) => courses.find((c) => c.code === code))
    .filter((c): c is Course => !!c);
  const requiredFor = courses.filter((c) => (c.prerequisites ?? []).includes(course.code));

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow={course.code}
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Courses', to: '/courses' }, { label: course.name }]}
        title={course.name}
        subtitle={course.description}
        meta={[
          { value: `${course.creditHours}`, label: 'Credit Hours' },
        ]}
      />

      <PageSection tone="cream" top>
        {/* 1 — Course Materials */}
        <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-sm">
          <div className="flex items-center gap-2 text-ieee-orange">
            <BookOpen className="h-5 w-5" />
            <h2 className="font-display text-lg font-bold text-slate-900">Course Materials</h2>
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <DownloadButton
              url={course.cdfUrl}
              filename={`${course.code}-CDF`}
              label="Download CDF"
              icon={<BookOpen className="h-4 w-4 text-ieee-orange" />}
              className="flex items-center gap-2 rounded-xl border border-black/5 bg-cream px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
            />
            {hasLab ? (
              <DownloadButton
                url={course.labManualUrl}
                filename={`${course.code}-Lab-Manual`}
                label="Download Lab Manual"
                icon={<FlaskConical className="h-4 w-4 text-ieee-orange" />}
                className="flex items-center gap-2 rounded-xl border border-black/5 bg-cream px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
              />
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-black/5 bg-cream px-4 py-3 text-sm font-medium text-slate-500">
                <FlaskConical className="h-4 w-4 text-slate-400" />
                This course does not include a lab component.
              </div>
            )}
          </div>
        </div>

        {/* 2 & 3 — Learning Outcomes + Study Tips */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-sm">
            <div className="flex items-center gap-2 text-ieee-orange">
              <Target className="h-5 w-5" />
              <h2 className="font-display text-lg font-bold text-slate-900">Learning Outcomes</h2>
            </div>
            <ul className="mt-4 space-y-3">
              {course.outcomes.map((o) => (
                <li key={o} className="flex gap-3 text-sm text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ieee-orange" />
                  {o}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-sm">
            <div className="flex items-center gap-2 text-ieee-orange">
              <Lightbulb className="h-5 w-5" />
              <h2 className="font-display text-lg font-bold text-slate-900">Study Tips</h2>
            </div>
            <ul className="mt-4 space-y-3">
              {course.tips.map((tip) => (
                <li key={tip} className="flex gap-3 text-sm text-slate-600">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ieee-orange" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 4 — Useful Links */}
        <div className="mt-6 rounded-3xl border border-black/5 bg-white p-7 shadow-sm">
          <div className="flex items-center gap-2 text-ieee-orange">
            <ExternalLink className="h-5 w-5" />
            <h2 className="font-display text-lg font-bold text-slate-900">Useful Links</h2>
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {course.usefulLinks.length === 0 && <p className="text-sm text-slate-500">No links added yet.</p>}
            {course.usefulLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                data-cursor="link"
                className="flex items-center gap-2 rounded-xl border border-black/5 bg-cream px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
              >
                <ExternalLink className="h-4 w-4 text-ieee-orange" /> {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* 5 — Prerequisites & pathway */}
        <div className="mt-6 rounded-3xl border border-black/5 bg-white p-7 shadow-sm">
          <div className="flex items-center gap-2 text-ieee-orange">
            <GitBranch className="h-5 w-5" />
            <h2 className="font-display text-lg font-bold text-slate-900">Prerequisites &amp; Pathway</h2>
          </div>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-slate-400">Prerequisites</p>
              {prereqCourses.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {prereqCourses.map((c) => (
                    <Link
                      key={c.id}
                      to={`/courses/${c.id}`}
                      data-cursor="link"
                      className="flex items-center gap-1.5 rounded-full border border-black/10 bg-cream px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
                    >
                      <span className="font-mono text-ieee-orange">{c.code}</span> {c.name}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No prerequisites — you can take this anytime.</p>
              )}
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-slate-400">Required for</p>
              {requiredFor.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {requiredFor.map((c) => (
                    <Link
                      key={c.id}
                      to={`/courses/${c.id}`}
                      data-cursor="link"
                      className="flex items-center gap-1.5 rounded-full border border-black/10 bg-cream px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
                    >
                      <span className="font-mono text-ieee-orange">{c.code}</span> {c.name}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Not a prerequisite for any listed course.</p>
              )}
            </div>
          </div>
        </div>

        {/* 6 — Archive link */}
        <div className="mt-6 rounded-3xl border border-black/5 bg-white p-7 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-ieee-orange">
                <ClipboardList className="h-5 w-5" />
                <h2 className="font-display text-lg font-bold text-slate-900">Past Papers Archive</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
                Browse verified past papers, quizzes, and assignments for {course.code}.
              </p>
            </div>
            <Link
              to={`/past-papers?course=${encodeURIComponent(course.id)}`}
              data-cursor="link"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              Open Archive <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </PageSection>

      {/* Instructors + related */}
      <PageSection tone="cream">
        {courseTeachers.length > 0 && (
          <>
            <SectionHeading eyebrow="Faculty" title="Instructors" />
            <div className="mt-8 flex flex-wrap gap-4">
              {courseTeachers.map((t) => (
                <Link
                  key={t.id}
                  to="/courses/teachers"
                  data-cursor="link"
                  className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <img src={t.photo} alt={t.name} loading="lazy" className="h-12 w-12 rounded-full object-cover ring-2 ring-white" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.email}</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="mt-14 flex justify-center">
          <Magnetic>
            <Link
              to="/courses/suggest-correction"
              data-cursor="link"
              className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-ieee-orange/40 hover:text-ieee-orange"
            >
              <PencilLine className="h-4 w-4" /> Suggest a correction for this course
            </Link>
          </Magnetic>
        </div>
      </PageSection>
    </div>
  );
}
