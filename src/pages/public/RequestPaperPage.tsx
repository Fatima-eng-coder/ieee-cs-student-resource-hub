import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import FormShell from '@/components/ui/FormShell';
import { FormField, TextInput, TextArea, Select } from '@/components/ui/FormField';
import SuccessState from '@/components/ui/SuccessState';
import CourseSearchSelect from '@/components/ui/CourseSearchSelect';
import { useAuth } from '@/context/AuthContext';
import { useCourses } from '@/hooks/useCourses';
import {
  paperRequestsService,
  type PaperRequestMaterialType,
  type PaperRequestSession,
} from '@/services/paperRequestsService';

const materialTypeOptions: { label: string; value: PaperRequestMaterialType }[] = [
  { label: 'Midterm', value: 'midterm' },
  { label: 'Final', value: 'final' },
  { label: 'Quiz', value: 'quiz' },
  { label: 'Assignment', value: 'assignment' },
];

const sessionOptions: PaperRequestSession[] = ['Spring', 'Fall'];
const minYear = 2000;
const maxYear = Math.min(new Date().getFullYear(), 2099);

const initialForm = {
  course: '',
  materialType: 'midterm' as PaperRequestMaterialType,
  session: 'Fall' as PaperRequestSession,
  year: maxYear,
  notes: '',
};

export default function RequestPaperPage() {
  const { user } = useAuth();
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const selectedCourse = courses.find((course) => course.id === form.course) ?? null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;

    if (!selectedCourse) {
      setError('Please select a valid course from the list before submitting.');
      return;
    }

    if (!Number.isInteger(form.year) || form.year < minYear || form.year > maxYear) {
      setError(`Please enter a valid year from ${minYear} to ${maxYear}.`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await paperRequestsService.create({
        courseCode: selectedCourse.code,
        courseName: selectedCourse.name,
        materialType: form.materialType,
        session: form.session,
        year: form.year,
        requesterName: user?.name.trim() ?? null,
        requesterEmail: user?.email.trim() ?? null,
        notes: form.notes.trim(),
      });
      setForm(initialForm);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your request could not be submitted right now. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Can't find it?"
        breadcrumb={[
          { label: 'Home', to: '/' },
          { label: 'Past Papers', to: '/past-papers' },
          { label: 'Request' },
        ]}
        title="Request a Missing Paper"
        subtitle="Can't find a paper you need? Tell us what you're after and we'll try to track it down from other students."
      />

      <PageSection tone="cream" top>
        {submitted ? (
          <SuccessState
            title="Request submitted."
            description="Our team will review it and try to add the material."
            action={
              <Link
                to="/past-papers"
                className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
              >
                Back to Past Papers
              </Link>
            }
          />
        ) : (
          <FormShell onSubmit={(event) => void handleSubmit(event)} submitLabel={saving ? 'Submitting...' : 'Send Request'}>
            {(error || coursesError) && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error ?? coursesError}
              </div>
            )}
            <FormField label="Course" required>
              <CourseSearchSelect
                courses={courses}
                selectedId={form.course}
                onChange={(courseId) => setForm({ ...form, course: courseId })}
                disabled={coursesLoading || courses.length === 0}
                placeholder={coursesLoading ? 'Loading courses...' : 'Search by course code or name'}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Material Type" required>
                <Select
                  required
                  value={form.materialType}
                  onChange={(e) => setForm({ ...form, materialType: e.target.value as PaperRequestMaterialType })}
                >
                  {materialTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Session" required>
                <Select
                  required
                  value={form.session}
                  onChange={(e) => setForm({ ...form, session: e.target.value as PaperRequestSession })}
                >
                  {sessionOptions.map((session) => (
                    <option key={session} value={session}>
                      {session}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
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
            <FormField label="Notes / Details (optional)" hint="Instructor, section, or anything else that helps us find it.">
              <TextArea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Dr. Imran Sheikh, Section B, solved or unsolved version preferred..."
              />
            </FormField>
          </FormShell>
        )}
      </PageSection>
    </div>
  );
}
