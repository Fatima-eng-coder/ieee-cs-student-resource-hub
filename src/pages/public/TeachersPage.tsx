import { useEffect, useState } from 'react';
import { Link, createSearchParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, UserPlus } from 'lucide-react';
import { useFaculty } from '@/hooks/useFaculty';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import SearchBar from '@/components/ui/SearchBar';
import TeacherCard from '@/components/cards/TeacherCard';
import EmptyState from '@/components/ui/EmptyState';
import Magnetic from '@/components/effects/Magnetic';
import Icon from '@/components/ui/Icon';
import type { Teacher } from '@/types';

type TeacherSuggestionTarget = 'email_update' | 'office_update' | 'profile_update' | 'course_assignment';

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'FA';

const suggestionPathFor = (teacher: Teacher, suggestionType: TeacherSuggestionTarget, focus?: 'email' | 'office' | 'course') => {
  const params: Record<string, string> = {
    facultyId: teacher.id,
    teacherName: teacher.name,
    department: teacher.department,
    designation: teacher.designation,
    suggestionType,
    focus: focus ?? (suggestionType === 'email_update' ? 'email' : 'office'),
  };

  if (teacher.email.trim()) params.email = teacher.email;
  if (teacher.office.trim()) params.office = teacher.office;
  if (teacher.courses.length > 0) params.courseCodes = teacher.courses.join(',');

  return `/courses/suggest-teacher?${createSearchParams(params).toString()}`;
};

interface TeacherDetailModalProps {
  teacher: Teacher | null;
  onClose: () => void;
}

function TeacherDetailModal({ teacher, onClose }: TeacherDetailModalProps) {
  const hasEmail = Boolean(teacher?.email.trim());
  const hasOffice = Boolean(teacher?.office.trim());

  return (
    <AnimatePresence>
      {teacher && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ieee-ink/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl border border-black/5 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {teacher.photo.trim() ? (
                  <img src={teacher.photo} alt={teacher.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-white" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ieee-orange/10 font-display text-xl font-bold text-ieee-orange">
                    {initialsFor(teacher.name)}
                  </div>
                )}
                <div>
                  <h3 className="font-display text-xl font-bold text-slate-900">{teacher.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{teacher.designation}</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-400">{teacher.department}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 transition hover:bg-black/5 hover:text-slate-700"
                aria-label="Close teacher details"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-black/5 bg-cream p-4 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <Icon name="mail" className="h-4 w-4 shrink-0 text-slate-400" />
                {hasEmail ? teacher.email : <span className="text-slate-400">Email not listed</span>}
              </p>
              <p className="mt-3 flex items-center gap-2">
                <Icon name="building" className="h-4 w-4 shrink-0 text-slate-400" />
                {hasOffice ? teacher.office : <span className="text-slate-400">Office not listed</span>}
              </p>
            </div>

            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Assigned Courses</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {teacher.courses.length > 0 ? (
                  teacher.courses.map((course) => (
                    <span
                      key={course}
                      className="rounded-full border border-ieee-orange/10 bg-cream px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-500"
                    >
                      {course}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-400">No assigned courses listed.</span>
                )}
                <Link
                  to={suggestionPathFor(teacher, 'course_assignment', 'course')}
                  data-cursor="link"
                  title="Suggest assigned course"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-ieee-orange/20 bg-ieee-orange/10 text-ieee-orange transition hover:bg-ieee-orange hover:text-white"
                  aria-label={`Suggest assigned course for ${teacher.name}`}
                >
                  <Plus className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {(!hasEmail || !hasOffice) && (
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                {!hasEmail && (
                  <Link
                    to={suggestionPathFor(teacher, 'email_update')}
                    className="inline-flex items-center justify-center rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
                  >
                    Suggest email
                  </Link>
                )}
                {!hasOffice && (
                  <Link
                    to={suggestionPathFor(teacher, 'office_update')}
                    className="inline-flex items-center justify-center rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-ieee-orange/40 hover:text-ieee-orange"
                  >
                    Suggest office/location
                  </Link>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function TeachersPage() {
  const [query, setQuery] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [highlightedTeacherId, setHighlightedTeacherId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const { teachers, loading, error } = useFaculty();
  const selectedTeacherId = searchParams.get('teacherId');
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = teachers.filter(
    (t) =>
      !normalizedQuery ||
      `${t.name} ${t.designation} ${t.department} ${t.email} ${t.office} ${t.courses.join(' ')}`
        .toLowerCase()
        .includes(normalizedQuery)
  );

  useEffect(() => {
    if (!selectedTeacherId || teachers.length === 0) return;

    const matchingTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId);
    if (!matchingTeacher) return;

    setHighlightedTeacherId(selectedTeacherId);

    window.requestAnimationFrame(() => {
      const element = document.getElementById(`teacher-${selectedTeacherId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (element instanceof HTMLElement) element.focus({ preventScroll: true });
    });

    const timer = window.setTimeout(() => setHighlightedTeacherId(null), 3500);
    return () => window.clearTimeout(timer);
  }, [selectedTeacherId, teachers]);

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Faculty"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Courses', to: '/courses' }, { label: 'Teachers' }]}
        title="Teacher Directory"
        subtitle="Contact information and assigned courses for faculty members. We keep this factual — no ratings or reviews are published here."
        meta={[{ value: `${teachers.length}`, label: 'Faculty Members' }]}
      >
        <Magnetic>
          <Link
            to="/courses/suggest-teacher"
            data-cursor="link"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ieee-orange px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.32)] transition hover:bg-ieee-orange-dark"
          >
            <UserPlus className="h-4 w-4" /> Suggest Teacher Info
          </Link>
        </Magnetic>
      </PageHero>

      <PageSection tone="cream" top>
        <SearchBar placeholder="Search by name, email, department or course..." onSearch={setQuery} size="lg" />
        {error && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
        {loading ? (
          <div className="mt-8">
            <EmptyState title="Loading faculty" description="Please wait a moment." />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="No teachers found" />
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <TeacherCard
                key={t.id}
                teacher={t}
                onSelect={setSelectedTeacher}
                highlighted={highlightedTeacherId === t.id}
              />
            ))}
          </div>
        )}

      </PageSection>

      <TeacherDetailModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} />
    </div>
  );
}
