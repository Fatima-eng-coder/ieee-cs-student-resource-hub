import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import FormShell from '@/components/ui/FormShell';
import { FormField, TextInput, TextArea } from '@/components/ui/FormField';
import SuccessState from '@/components/ui/SuccessState';
import CourseSearchSelect from '@/components/ui/CourseSearchSelect';
import { useCourses } from '@/hooks/useCourses';
import { appendToStorage, makeId } from '@/utils/storage';
import type { Submission } from '@/types';

export default function RequestPaperPage() {
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ course: '', details: '', name: '' });

  useEffect(() => {
    if (!form.course && courses.length > 0) {
      setForm((current) => ({ ...current, course: courses[0].id }));
    }
  }, [courses, form.course]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.course) return;
    const submission: Submission = {
      id: makeId('sub'),
      type: 'paper-request',
      submittedBy: form.name || 'Anonymous',
      submittedAt: new Date().toISOString().slice(0, 10),
      status: 'pending',
      data: { course: form.course, details: form.details },
    };
    appendToStorage<Submission>('ieeecs_submissions', [], submission);
    setSubmitted(true);
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
            title="Request received!"
            description="We'll try to source this paper from other students and publish it once verified."
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
          <FormShell onSubmit={handleSubmit} submitLabel="Send Request">
            {coursesError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {coursesError}
              </div>
            )}
            <FormField label="Your Name (optional)">
              <TextInput
                placeholder="Anonymous"
                value={form.name}
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
            <FormField
              label="Additional Details"
              hint="Term, exam type, instructor — anything that helps us find it"
            >
              <TextArea
                required
                value={form.details}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
                placeholder="e.g. Spring 2025 Final, Dr. Imran Sheikh"
              />
            </FormField>
          </FormShell>
        )}
      </PageSection>
    </div>
  );
}
