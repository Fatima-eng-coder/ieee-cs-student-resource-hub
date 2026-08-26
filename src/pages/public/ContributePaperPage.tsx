import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import FormShell from '@/components/ui/FormShell';
import { FormField, TextInput, Select } from '@/components/ui/FormField';
import FileUploadBox from '@/components/ui/FileUploadBox';
import SuccessState from '@/components/ui/SuccessState';
import CourseSearchSelect from '@/components/ui/CourseSearchSelect';
import { useCourses } from '@/hooks/useCourses';
import { papersService } from '@/services/papersService';
import { useAuth } from '@/context/AuthContext';
import type { Paper } from '@/types';

const sessionOptions = ['Spring', 'Fall'] as const;
const minYear = 2000;
const maxYear = Math.min(new Date().getFullYear(), 2099);

export default function ContributePaperPage() {
  const { user, ensureAuth } = useAuth();
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();
  const [created, setCreated] = useState<Paper | null>(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [duplicateReview, setDuplicateReview] = useState<{ duplicate: Paper | null; courseName: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    course: '',
    title: '',
    session: 'Fall',
    year: maxYear,
    examType: 'Final' as Paper['examType'],
    instructor: '',
    name: '',
  });

  useEffect(() => {
    if (!form.course && courses.length > 0) {
      setForm((current) => ({ ...current, course: courses[0].id }));
    }
  }, [courses, form.course]);

  const submitContribution = async (allowDuplicate = false) => {
    if (!ensureAuth(undefined, 'Log in before contributing course material.')) return;

    const course = courses.find((c) => c.id === form.course);
    if (!course) {
      setError('Please choose a valid course before submitting.');
      return;
    }
    if (!Number.isInteger(form.year) || form.year < minYear || form.year > maxYear) {
      setError(`Please enter a valid year from ${minYear} to ${maxYear}.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (!allowDuplicate) {
        const { duplicate, exists } = await papersService.findDuplicate(
          {
            courseId: course.id,
            session: form.session,
            year: form.year,
            examType: form.examType,
          },
          { includeHiddenRows: true }
        );

        if (exists) {
          setDuplicateReview({ duplicate, courseName: course.name });
          return;
        }
      }

      if (!file) {
        setError('Please attach the material file before submitting.');
        return;
      }

      const paper = await papersService.contribute({
        courseId: course.id,
        courseName: course.name,
        title: form.title.trim() || `${course.name} ${form.examType}`,
        session: form.session,
        year: form.year,
        examType: form.examType,
        instructor: form.instructor,
        contributorName: form.name || user?.name || '',
        tags: [],
        file,
      });
      setCreated(paper);
      setShowSuccessPopup(true);
      setDuplicateReview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit material.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submitContribution();
  };

  const keepContribution = async () => {
    setDuplicateReview(null);
    await submitContribution(true);
  };

  const stopContribution = () => {
    setDuplicateReview(null);
    setBusy(false);
  };

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Give Back"
        breadcrumb={[
          { label: 'Home', to: '/' },
          { label: 'Past Papers', to: '/past-papers' },
          { label: 'Contribute' },
        ]}
        title="Contribute Course Material"
        subtitle="Help your juniors by sharing a past paper, quiz, or assignment. Every submission is reviewed by our team before it appears publicly."
      />

      <PageSection tone="cream" top>
        {created ? (
          <SuccessState
            title="Material submitted for review!"
            description={`Thanks${
              created.uploadedBy && created.uploadedBy !== 'Anonymous' ? `, ${created.uploadedBy}` : ''
            }! It's now in the review queue. Once a content manager verifies it, it'll appear in the right course section.`}
            action={
              <Link
                to="/past-papers"
                className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
              >
                Browse Past Papers
              </Link>
            }
          />
        ) : (
          <FormShell onSubmit={handleSubmit} submitLabel={busy ? 'Submitting...' : 'Submit Material'}>
            {(error || coursesError) && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error ?? coursesError}
              </div>
            )}
            <FormField label="Your Name" hint="Optional — kept private, for our records only.">
              <TextInput
                placeholder="Your name (optional)"
                value={form.name || user?.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <FormField label="Course" required>
              <CourseSearchSelect
                courses={courses}
                selectedId={form.course}
                onChange={(courseId) => setForm({ ...form, course: courseId })}
                disabled={coursesLoading || courses.length === 0}
                placeholder={coursesLoading ? 'Loading courses...' : 'Search by course code or name'}
              />
            </FormField>
            <FormField label="Material Title" hint="Optional — we'll auto-name it from the course and material type">
              <TextInput
                placeholder="e.g. DSA Final Exam"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Session" required>
                <Select
                  required
                  value={form.session}
                  onChange={(e) => setForm({ ...form, session: e.target.value })}
                >
                  {sessionOptions.map((session) => (
                    <option key={session} value={session}>
                      {session}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Year" required hint={`Allowed range: ${minYear}-${maxYear}`}>
                <TextInput
                  required
                  type="number"
                  min={minYear}
                  max={maxYear}
                  step={1}
                  value={Number.isFinite(form.year) ? form.year : ''}
                  onChange={(e) => setForm({ ...form, year: e.target.value ? Number(e.target.value) : Number.NaN })}
                  placeholder={String(maxYear)}
                />
              </FormField>
            </div>
            <FormField label="Material Type" required>
              <Select
                value={form.examType}
                onChange={(e) => setForm({ ...form, examType: e.target.value as Paper['examType'] })}
              >
                <option>Midterm</option>
                <option>Final</option>
                <option>Quiz</option>
                <option>Assignment</option>
              </Select>
            </FormField>
            <FormField label="Instructor" hint="Optional">
              <TextInput
                placeholder="e.g. Dr. Imran Sheikh"
                value={form.instructor}
                onChange={(e) => setForm({ ...form, instructor: e.target.value })}
              />
            </FormField>
            <FormField label="Upload Material" required>
              <FileUploadBox accept="application/pdf,image/png,image/jpeg,image/webp" onFileSelect={setFile} />
            </FormField>
          </FormShell>
        )}
      </PageSection>

      {created && showSuccessPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ieee-ink/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-3xl border border-black/5 bg-white p-6 text-center shadow-2xl">
            <button
              type="button"
              data-cursor="link"
              onClick={() => setShowSuccessPopup(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-black/5 hover:text-slate-700"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <h2 className="mt-4 font-display text-xl font-bold text-slate-900">You have contributed material</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Thank you. Your submission is now pending review and will appear publicly after a content manager verifies it.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                data-cursor="link"
                onClick={() => setShowSuccessPopup(false)}
                className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
              >
                Stay here
              </button>
              <Link
                to="/past-papers"
                data-cursor="link"
                className="rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
              >
                Browse Past Papers
              </Link>
            </div>
          </div>
        </div>
      )}

      {duplicateReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ieee-ink/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-3xl border border-black/5 bg-white p-6 shadow-2xl">
            <button
              type="button"
              data-cursor="link"
              onClick={stopContribution}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-black/5 hover:text-slate-700"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-display text-xl font-bold text-slate-900">This material may already exist</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              We found an existing {form.examType.toLowerCase()} for {duplicateReview.courseName} from {form.session}{' '}
              {form.year}. You can still submit yours if it is a different version.
            </p>
            {duplicateReview.duplicate ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Existing material</p>
                <p className="mt-2 font-semibold text-slate-900">{duplicateReview.duplicate.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {duplicateReview.duplicate.examType} - {duplicateReview.duplicate.session}{' '}
                  {duplicateReview.duplicate.year}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                A matching submission already exists in the review system. Its details are kept private until the team
                verifies it.
              </div>
            )}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                data-cursor="link"
                onClick={stopContribution}
                disabled={busy}
                className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:cursor-not-allowed disabled:opacity-60"
              >
                Stop contribution
              </button>
              <button
                type="button"
                data-cursor="link"
                onClick={() => void keepContribution()}
                disabled={busy}
                className="rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Submitting...' : 'Keep contribution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
