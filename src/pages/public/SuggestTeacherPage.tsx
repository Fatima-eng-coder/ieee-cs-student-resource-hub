import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import FormShell from '@/components/ui/FormShell';
import { FormField, TextArea, TextInput } from '@/components/ui/FormField';
import SuccessState from '@/components/ui/SuccessState';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useCourses } from '@/hooks/useCourses';
import { facultySuggestionService, type FacultySuggestionCourse, type FacultySuggestionType } from '@/services/facultySuggestionService';
import { useAuth } from '@/context/AuthContext';
import type { Course } from '@/types';

const suggestionLabels: Record<FacultySuggestionType, string> = {
  new_teacher: 'New teacher suggestion',
  email_update: 'Email update',
  office_update: 'Office/location update',
  profile_update: 'Profile update',
  course_assignment: 'Course assignment',
};

const validSuggestionTypes = new Set<FacultySuggestionType>([
  'new_teacher',
  'email_update',
  'office_update',
  'profile_update',
  'course_assignment',
]);

const getSuggestionType = (value: string | null): FacultySuggestionType =>
  value && validSuggestionTypes.has(value as FacultySuggestionType) ? (value as FacultySuggestionType) : 'new_teacher';

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

interface AssignedCoursePickerProps {
  courses: Course[];
  selectedIds: string[];
  onChange: (courseIds: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
  autoFocus?: boolean;
}

function AssignedCoursePicker({
  courses,
  selectedIds,
  onChange,
  disabled = false,
  loading = false,
  autoFocus = false,
}: AssignedCoursePickerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedCourses = selectedIds
    .map((courseId) => courses.find((course) => course.id === courseId))
    .filter((course): course is Course => Boolean(course));

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!autoFocus || loading || disabled) return;

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      setOpen(true);
    }, 100);

    return () => window.clearTimeout(timer);
  }, [autoFocus, disabled, loading]);

  const filteredCourses = useMemo(() => {
    const selected = new Set(selectedIds);
    const available = courses.filter((course) => !selected.has(course.id));
    const trimmed = query.trim();

    if (!trimmed) return available.slice(0, 40);

    const normalizedQuery = normalize(trimmed);
    const lowerQuery = trimmed.toLowerCase();

    return available
      .filter((course) => {
        const label = `${course.code} ${course.name} ${course.department}`;
        return label.toLowerCase().includes(lowerQuery) || normalize(label).includes(normalizedQuery);
      })
      .slice(0, 40);
  }, [courses, query, selectedIds]);

  const addCourse = (courseId: string) => {
    onChange([...selectedIds, courseId]);
    setQuery('');
    setOpen(false);
  };

  const removeCourse = (courseId: string) => {
    onChange(selectedIds.filter((selectedId) => selectedId !== courseId));
  };

  return (
    <div ref={wrapperRef} className="relative">
      {selectedCourses.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selectedCourses.map((course) => (
            <span
              key={course.id}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-ieee-orange/15 bg-ieee-orange/10 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              <span className="truncate">
                <span className="font-mono text-ieee-orange">{course.code}</span> - {course.name}
              </span>
              <button
                type="button"
                onClick={() => removeCourse(course.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-700"
                aria-label={`Remove ${course.code}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled || loading}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          placeholder={loading ? 'Loading courses...' : 'Search by course code or name'}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-ieee-orange focus:ring-2 focus:ring-ieee-orange/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => setOpen((value) => !value)}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-black/5 hover:text-slate-700 disabled:cursor-not-allowed"
          aria-label="Toggle course list"
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && !disabled && !loading && (
        <div className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-black/10 bg-white p-1.5 shadow-xl">
          {filteredCourses.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400">No matching courses found.</p>
          ) : (
            filteredCourses.map((course) => (
              <button
                key={course.id}
                type="button"
                data-cursor="link"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addCourse(course.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-cream"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    <span className="font-mono text-ieee-orange">{course.code}</span> - {course.name}
                  </span>
                  <span className="block truncate text-xs text-slate-400">{course.department}</span>
                </span>
                <Check className="h-4 w-4 shrink-0 text-ieee-orange opacity-0" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function SuggestTeacherPage() {
  const [searchParams] = useSearchParams();
  const { courses, loading: coursesLoading } = useCourses();
  const { user } = useAuth();
  const suggestionType = useMemo(() => getSuggestionType(searchParams.get('suggestionType')), [searchParams]);
  const focusTarget = searchParams.get('focus');
  const emailRef = useRef<HTMLInputElement>(null);
  const officeRef = useRef<HTMLInputElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    facultyId: searchParams.get('facultyId') ?? '',
    name: searchParams.get('teacherName') ?? searchParams.get('name') ?? '',
    email: searchParams.get('email') ?? '',
    department: searchParams.get('department') ?? '',
    designation: searchParams.get('designation') ?? '',
    office: searchParams.get('office') ?? '',
    notes: '',
  }));
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);

  useEffect(() => {
    if (courses.length === 0 || selectedCourseIds.length > 0) return;

    const queryCourseIds = [
      ...searchParams.getAll('courseId'),
      ...(searchParams.get('courseIds') ?? '').split(','),
    ].map((value) => value.trim()).filter(Boolean);
    const queryCourseCodes = [
      ...searchParams.getAll('courseCode'),
      ...(searchParams.get('courseCodes') ?? '').split(','),
    ].map((value) => value.trim().toLowerCase()).filter(Boolean);

    if (queryCourseIds.length === 0 && queryCourseCodes.length === 0) return;

    const matchedIds = courses
      .filter(
        (course) =>
          queryCourseIds.includes(course.id) ||
          queryCourseCodes.includes(course.code.toLowerCase())
      )
      .map((course) => course.id);

    if (matchedIds.length > 0) setSelectedCourseIds([...new Set(matchedIds)]);
  }, [courses, searchParams, selectedCourseIds.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (focusTarget === 'email') emailRef.current?.focus();
      if (focusTarget === 'office') officeRef.current?.focus();
    }, 80);

    return () => window.clearTimeout(timer);
  }, [focusTarget]);

  const emailRequired = suggestionType === 'email_update';
  const officeRequired = suggestionType === 'office_update';
  const courseRequired = suggestionType === 'course_assignment';

  const guidance =
    suggestionType === 'email_update'
      ? 'Please add the missing email address for this listed teacher.'
      : suggestionType === 'office_update'
        ? 'Please add the missing office or location for this listed teacher.'
        : suggestionType === 'course_assignment' || focusTarget === 'course'
          ? 'Please add or correct the course this teacher is currently teaching.'
          : 'Suggest a teacher who is not currently listed in the directory.';

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const suggestion = {
      facultyId: form.facultyId,
      teacherName: form.name.trim(),
      email: form.email.trim(),
      department: form.department.trim(),
      designation: form.designation.trim(),
      office: form.office.trim(),
      assignedCourses: selectedCourseIds
        .map((courseId) => courses.find((course) => course.id === courseId))
        .filter((course): course is Course => Boolean(course))
        .map<FacultySuggestionCourse>((course) => ({
          course_id: course.id,
          course_code: course.code,
          course_name: course.name,
        })),
      suggestionType,
      notes: form.notes.trim(),
    };

    try {
      await facultySuggestionService.submit({
        ...suggestion,
        requesterName: user?.name ?? null,
        requesterEmail: user?.email ?? null,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit teacher information.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Faculty"
        breadcrumb={[
          { label: 'Home', to: '/' },
          { label: 'Courses', to: '/courses' },
          { label: 'Teachers', to: '/courses/teachers' },
          { label: 'Suggest Teacher Info' },
        ]}
        title="Suggest Teacher Info"
        subtitle="Help us keep the faculty directory accurate. Submitted details are reviewed before anything is published."
      />

      <PageSection tone="cream" top>
        {submitted ? (
          <SuccessState
            title="Teacher info submitted!"
            description="Thank you. Our team will review this suggestion before updating the public directory."
            action={
              <Link
                to="/courses/teachers"
                className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
              >
                Back to Teacher Directory
              </Link>
            }
          />
        ) : (
          <FormShell onSubmit={(event) => void handleSubmit(event)} submitLabel={saving ? 'Submitting...' : 'Submit Teacher Info'}>
            <div className="rounded-xl border border-ieee-orange/15 bg-ieee-orange/5 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-ieee-orange">
                {suggestionLabels[suggestionType]}
              </p>
              <p className="mt-1 text-sm text-slate-600">{guidance}</p>
            </div>
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}
            <FormField label="Teacher Name" required>
              <TextInput
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Dr. Ayesha Khan"
              />
            </FormField>
            <FormField label="Email" required={emailRequired}>
              <TextInput
                ref={emailRef}
                required={emailRequired}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@university.edu.pk"
              />
            </FormField>
            <FormField label="Department" required>
              <TextInput
                required
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="Computer Science"
              />
            </FormField>
            <FormField label="Designation (optional)">
              <TextInput
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                placeholder="Assistant Professor"
              />
            </FormField>
            <FormField label="Office / Location" required={officeRequired}>
              <TextInput
                ref={officeRef}
                required={officeRequired}
                value={form.office}
                onChange={(e) => setForm({ ...form, office: e.target.value })}
                placeholder="Faculty Block, Room F-12"
              />
            </FormField>
            <FormField
              label="Current Course Assignment"
              required={courseRequired}
              hint="Optional. Select one or more courses this teacher is teaching."
            >
              <AssignedCoursePicker
                courses={courses}
                selectedIds={selectedCourseIds}
                onChange={setSelectedCourseIds}
                disabled={saving}
                loading={coursesLoading}
                autoFocus={focusTarget === 'course'}
              />
            </FormField>
            <FormField label="Notes / Source (optional)" hint="Mention where this information came from, if available.">
              <TextArea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Example: department notice board, official timetable, course outline..."
              />
            </FormField>
          </FormShell>
        )}
      </PageSection>
    </div>
  );
}
