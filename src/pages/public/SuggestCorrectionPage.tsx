import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import FormShell from '@/components/ui/FormShell';
import { FormField, TextInput, TextArea, Select } from '@/components/ui/FormField';
import FileUploadBox from '@/components/ui/FileUploadBox';
import SuccessState from '@/components/ui/SuccessState';
import CourseSearchSelect from '@/components/ui/CourseSearchSelect';
import { useAuth } from '@/context/AuthContext';
import { useCourses } from '@/hooks/useCourses';
import {
  courseResourceSubmissionsService,
  type CourseResourceType,
} from '@/services/courseResourceSubmissionsService';

const resourceTypeOptions: { label: string; value: CourseResourceType }[] = [
  { label: 'CDF', value: 'cdf' },
  { label: 'Lab Manual', value: 'lab_manual' },
  { label: 'Useful Link', value: 'useful_link' },
  { label: 'Prerequisite', value: 'prerequisite' },
  { label: 'Description', value: 'description' },
  { label: 'Teacher Assignment', value: 'teacher_assignment' },
  { label: 'Other', value: 'other' },
];

const initialForm = {
  course: '',
  resourceType: 'description' as CourseResourceType,
  suggestedTitle: '',
  suggestedValue: '',
  notes: '',
};

const fileResourceTypes: CourseResourceType[] = ['cdf', 'lab_manual'];
const detailResourceTypes: CourseResourceType[] = ['prerequisite', 'description', 'teacher_assignment', 'other'];

function isFileResource(resourceType: CourseResourceType): boolean {
  return fileResourceTypes.includes(resourceType);
}

function isDetailResource(resourceType: CourseResourceType): boolean {
  return detailResourceTypes.includes(resourceType);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function SuggestCorrectionPage() {
  const { user } = useAuth();
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState(
    'Submission received. Our team will review it before updating the course page.'
  );
  const [form, setForm] = useState(initialForm);
  const [attachment, setAttachment] = useState<File | null>(null);

  const selectedCourse = courses.find((course) => course.id === form.course) ?? null;
  const selectedCourseHasLab = (selectedCourse?.labHours ?? 0) > 0;
  const availableResourceTypeOptions = resourceTypeOptions.filter(
    (option) => option.value !== 'lab_manual' || selectedCourseHasLab
  );

  useEffect(() => {
    if (form.resourceType !== 'lab_manual' || selectedCourseHasLab) return;

    setForm((current) => ({
      ...current,
      resourceType: 'description',
      suggestedTitle: '',
      suggestedValue: '',
      notes: '',
    }));
    setAttachment(null);
  }, [form.resourceType, selectedCourseHasLab]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;

    if (!selectedCourse) {
      setError('Please select a valid course from the list before submitting.');
      return;
    }
    if (form.resourceType === 'lab_manual' && !selectedCourseHasLab) {
      setError('This course does not include a lab component, so a lab manual cannot be submitted for it.');
      return;
    }

    if (form.resourceType === 'useful_link') {
      if (!form.suggestedTitle.trim()) {
        setError('Please enter a clear title for the useful link.');
        return;
      }

      if (!isValidHttpUrl(form.suggestedValue.trim())) {
        setError('Please enter a valid useful link URL starting with http:// or https://.');
        return;
      }
    }

    if (isDetailResource(form.resourceType) && !form.suggestedValue.trim()) {
      setError('Please describe the suggested update before submitting.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await courseResourceSubmissionsService.create({
        courseCode: selectedCourse.code,
        courseName: selectedCourse.name,
        resourceType: form.resourceType,
        suggestedTitle: form.resourceType === 'useful_link' ? form.suggestedTitle : null,
        suggestedValue: form.resourceType === 'useful_link' || isDetailResource(form.resourceType)
          ? form.suggestedValue
          : null,
        notes: form.notes,
        requesterName: user?.name.trim() ?? null,
        requesterEmail: user?.email.trim() ?? null,
        file: isFileResource(form.resourceType) ? attachment : null,
      });

      setSuccessMessage('Submission received. Our team will review it before updating the course page.');
      setForm(initialForm);
      setAttachment(null);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your submission could not be saved right now. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const selectedResourceLabel =
    availableResourceTypeOptions.find((option) => option.value === form.resourceType)?.label ?? 'resource';

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
            title="Submission received."
            description={successMessage}
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
          <FormShell onSubmit={(event) => void handleSubmit(event)} submitLabel={saving ? 'Submitting...' : 'Submit Correction'}>
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
            <FormField label="Resource Type" required>
              <Select
                required
                value={form.resourceType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    resourceType: e.target.value as CourseResourceType,
                    suggestedTitle: '',
                    suggestedValue: '',
                    notes: '',
                  })
                }
              >
                {availableResourceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              {selectedCourse && !selectedCourseHasLab && (
                <p className="mt-1 text-xs text-slate-400">
                  Lab manual suggestions are only available for courses with a lab component.
                </p>
              )}
            </FormField>

            {isFileResource(form.resourceType) && (
              <>
                <FormField
                  label={`${selectedResourceLabel} Notes (optional)`}
                  hint="Add context that helps the team review this resource."
                >
                  <TextArea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder={`Describe the ${selectedResourceLabel.toLowerCase()} you are suggesting...`}
                  />
                </FormField>
                <FormField
                  label={`${selectedResourceLabel} File (optional)`}
                  hint="Attach a PDF if you already have the file."
                >
                  <FileUploadBox
                    label={`Upload ${selectedResourceLabel.toLowerCase()} file`}
                    accept="application/pdf,.pdf"
                    onFileSelect={setAttachment}
                  />
                </FormField>
              </>
            )}

            {form.resourceType === 'useful_link' && (
              <>
                <FormField label="Link Title" required>
                  <TextInput
                    required
                    value={form.suggestedTitle}
                    onChange={(e) => setForm({ ...form, suggestedTitle: e.target.value })}
                    placeholder="e.g. Official course playlist"
                  />
                </FormField>
                <FormField label="URL" required>
                  <TextInput
                    required
                    type="url"
                    value={form.suggestedValue}
                    onChange={(e) => setForm({ ...form, suggestedValue: e.target.value })}
                    placeholder="https://example.com"
                  />
                </FormField>
                <FormField label="Notes (optional)">
                  <TextArea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Add any extra context for the review team..."
                  />
                </FormField>
              </>
            )}

            {isDetailResource(form.resourceType) && (
              <FormField label="Details" required>
                <TextArea
                  required
                  value={form.suggestedValue}
                  onChange={(e) => setForm({ ...form, suggestedValue: e.target.value })}
                  placeholder="Describe what should be added or corrected..."
                />
              </FormField>
            )}
          </FormShell>
        )}
      </PageSection>
    </div>
  );
}
