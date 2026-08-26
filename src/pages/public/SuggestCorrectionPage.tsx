import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import FormShell from '@/components/ui/FormShell';
import { FormField, TextInput, TextArea, Select } from '@/components/ui/FormField';
import FileUploadBox from '@/components/ui/FileUploadBox';
import SuccessState from '@/components/ui/SuccessState';
import CourseSearchSelect from '@/components/ui/CourseSearchSelect';
import { useCourses } from '@/hooks/useCourses';
import { appendToStorage, makeId } from '@/utils/storage';
import type { Submission } from '@/types';

export default function SuggestCorrectionPage() {
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ course: '', field: 'CDF Link', details: '', name: '' });
  const [attachment, setAttachment] = useState<File | null>(null);

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
      type: 'course-correction',
      submittedBy: form.name || 'Anonymous',
      submittedAt: new Date().toISOString().slice(0, 10),
      status: 'pending',
      data: {
        course: form.course,
        field: form.field,
        details: form.details,
        attachment: attachment?.name ?? '',
      },
    };
    appendToStorage<Submission>('ieeecs_submissions', [], submission);
    setSubmitted(true);
  };

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Keep it accurate"
        breadcrumb={[
          { label: 'Home', to: '/' },
          { label: 'Courses', to: '/courses' },
          { label: 'Suggest Correction' },
        ]}
        title="Suggest a Course Correction"
        subtitle="Spotted outdated or incorrect course information? Flag it and our team will review and update it."
      />

      <PageSection tone="cream" top>
        {submitted ? (
          <SuccessState
            title="Correction submitted!"
            description="Thanks for helping keep our course data accurate. Our team will review this shortly."
            action={
              <Link
                to="/courses"
                className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
              >
                Back to Courses
              </Link>
            }
          />
        ) : (
          <FormShell onSubmit={handleSubmit} submitLabel="Submit Correction">
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
            <FormField label="Field to Correct" required>
              <Select value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })}>
                <option>CDF Link</option>
                <option>Lab Manual Link</option>
                <option>Instructor Info</option>
                <option>Other</option>
              </Select>
            </FormField>
            <FormField label="Correction Details" required>
              <TextArea
                required
                value={form.details}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
                placeholder="Describe what needs to be corrected..."
              />
            </FormField>
            <FormField label="Supporting File (optional)" hint="Attach a PDF or image if it helps our team verify the correction.">
              <FileUploadBox
                label="Upload supporting file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onFileSelect={setAttachment}
              />
            </FormField>
          </FormShell>
        )}
      </PageSection>
    </div>
  );
}
