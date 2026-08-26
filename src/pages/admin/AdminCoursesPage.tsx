import { useMemo, useRef, useState } from 'react';
import { ExternalLink, FileCheck2, Loader2, Pencil, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect, AdminTextarea } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import { useCourses } from '@/hooks/useCourses';
import { useFaculty } from '@/hooks/useFaculty';
import { adminAuthService } from '@/services/adminAuthService';
import { coursesService } from '@/services/coursesService';
import type { Course, Teacher } from '@/types';

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';

const emptyCourse = (): Course => ({
  id: '',
  code: '',
  name: '',
  creditHours: 3,
  labHours: 0,
  prerequisites: [],
  department: 'Computer Science',
  description: '',
  outcomes: [],
  cdfUrl: '',
  cdfPath: null,
  labManualUrl: '',
  labManualPath: null,
  teacherIds: [],
  usefulLinks: [],
  tips: [],
});

const parseLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const parseLinks = (value: string): Course['usefulLinks'] =>
  parseLines(value)
    .map((line) => {
      const [label, ...urlParts] = line.split('|').map((part) => part.trim());
      const url = urlParts.join('|');
      return label && url ? { label, url } : null;
    })
    .filter((link): link is Course['usefulLinks'][number] => !!link);

const formatLinks = (links: Course['usefulLinks']) => links.map((link) => `${link.label} | ${link.url}`).join('\n');

function CourseFacultyPicker({
  teachers,
  selectedIds,
  onChange,
}: {
  teachers: Teacher[];
  selectedIds: string[];
  onChange: (teacherIds: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const selectedTeachers = teachers.filter((teacher) => selectedIds.includes(teacher.id));
  const availableTeachers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    return teachers
      .filter((teacher) => !selectedIds.includes(teacher.id))
      .filter((teacher) =>
        `${teacher.name} ${teacher.email} ${teacher.designation}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, 6);
  }, [query, selectedIds, teachers]);

  const addTeacher = (teacherId: string) => {
    onChange([...selectedIds, teacherId]);
    setQuery('');
  };

  const removeTeacher = (teacherId: string) => {
    onChange(selectedIds.filter((id) => id !== teacherId));
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <AdminInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search faculty by name or email"
          className="pl-9"
        />
        {query.trim() && (
          <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-black/10 bg-white p-1.5 shadow-xl">
            {availableTeachers.length > 0 ? (
              availableTeachers.map((teacher) => (
                <button
                  key={teacher.id}
                  type="button"
                  onClick={() => addTeacher(teacher.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-cream"
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{teacher.name}</span>
                    <span className="block text-xs text-slate-500">{teacher.email}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-slate-400">{teacher.designation}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-slate-400">No matching faculty found.</p>
            )}
          </div>
        )}
      </div>

      {selectedTeachers.length > 0 ? (
        <div className="flex flex-col gap-2">
          {selectedTeachers.map((teacher) => (
            <div
              key={teacher.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-cream px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{teacher.name}</span>
                <span className="block truncate text-xs text-slate-500">{teacher.email}</span>
              </span>
              <button
                type="button"
                onClick={() => removeTeacher(teacher.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-slate-400 transition hover:border-rose-300 hover:text-rose-600"
                aria-label={`Remove ${teacher.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">No faculty assigned yet.</p>
      )}
    </div>
  );
}

function CoursePrerequisitePicker({
  courses,
  currentCode,
  selectedCodes,
  onChange,
}: {
  courses: Course[];
  currentCode: string;
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const normalizedCurrentCode = currentCode.trim().toUpperCase();
  const selectedCourses = selectedCodes
    .map((code) => courses.find((course) => course.code === code))
    .filter((course): course is Course => !!course);
  const availableCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    return courses
      .filter((course) => course.code !== normalizedCurrentCode)
      .filter((course) => !selectedCodes.includes(course.code))
      .filter((course) => `${course.code} ${course.name}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 8);
  }, [courses, normalizedCurrentCode, query, selectedCodes]);

  const addCourse = (courseCode: string) => {
    onChange([...selectedCodes, courseCode].sort((a, b) => a.localeCompare(b)));
    setQuery('');
  };

  const removeCourse = (courseCode: string) => {
    onChange(selectedCodes.filter((code) => code !== courseCode));
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <AdminInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by course code or name"
          className="pl-9"
        />
        {query.trim() && (
          <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-black/10 bg-white p-1.5 shadow-xl">
            {availableCourses.length > 0 ? (
              availableCourses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => addCourse(course.code)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-cream"
                >
                  <span>
                    <span className="block font-mono text-xs font-semibold text-ieee-orange">{course.code}</span>
                    <span className="block text-sm font-semibold text-slate-800">{course.name}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-slate-400">{course.creditHours} CH</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-slate-400">No matching course found.</p>
            )}
          </div>
        )}
      </div>

      {selectedCourses.length > 0 ? (
        <div className="flex flex-col gap-2">
          {selectedCourses.map((course) => (
            <div
              key={course.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-cream px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block font-mono text-xs font-semibold text-ieee-orange">{course.code}</span>
                <span className="block truncate text-sm font-semibold text-slate-800">{course.name}</span>
              </span>
              <button
                type="button"
                onClick={() => removeCourse(course.code)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-slate-400 transition hover:border-rose-300 hover:text-rose-600"
                aria-label={`Remove ${course.code}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">No prerequisites assigned.</p>
      )}
    </div>
  );
}

function CourseDocumentField({
  label,
  value,
  path,
  courseCode,
  folder,
  onChange,
  onError,
}: {
  label: string;
  value?: string;
  path?: string | null;
  courseCode: string;
  folder: 'cdf' | 'lab-manuals';
  onChange: (file: { url: string; path: string | null }) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const hasFile = Boolean(value);

  const uploadFile = async (file: File) => {
    setUploading(true);
    onError('');
    try {
      const upload = await coursesService.uploadCourseDocument(file, courseCode, folder);
      if (path) void coursesService.removeCourseDocument(path);
      onChange(upload);
    } catch (err) {
      onError(err instanceof Error ? err.message : `Failed to upload ${label.toLowerCase()}.`);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = () => {
    if (path) void coursesService.removeCourseDocument(path);
    onChange({ url: '', path: null });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`flex min-h-12 flex-1 items-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-left text-sm transition disabled:opacity-70 ${
          hasFile
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : 'border-slate-300 bg-white text-slate-500 hover:border-ieee-orange/60 hover:text-ieee-orange'
        }`}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : hasFile ? (
          <FileCheck2 className="h-4 w-4" />
        ) : (
          <UploadCloud className="h-4 w-4" />
        )}
        <span className="font-semibold">
          {uploading ? 'Uploading...' : hasFile ? `${label} attached` : `Upload ${label}`}
        </span>
      </button>
      {hasFile && (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
          aria-label={`Open ${label}`}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
      {hasFile && (
        <button
          type="button"
          onClick={removeFile}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-slate-400 transition hover:border-rose-300 hover:text-rose-600"
          aria-label={`Remove ${label}`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export default function AdminCoursesPage() {
  const { courses, loading, error, setCourses } = useCourses();
  const { teachers } = useFaculty();
  const [formError, setFormError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Course | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleting, setDeleting] = useState<Course | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const columns: AdminTableColumn<Course>[] = [
    {
      key: 'code',
      header: 'Code',
      sortValue: (course) => course.code,
      render: (course) => <span className="font-mono text-xs font-semibold text-ieee-orange">{course.code}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      sortValue: (course) => course.name,
      render: (course) => <span className="font-medium text-slate-900">{course.name}</span>,
    },
    {
      key: 'department',
      header: 'Department',
      sortValue: (course) => course.department,
      render: (course) => course.department,
    },
    {
      key: 'creditHours',
      header: 'Credits',
      sortValue: (course) => course.creditHours,
      render: (course) => course.creditHours,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (course) =>
        canManage ? (
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                setDraft(course);
                setIsNew(false);
                setFormError(null);
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button type="button" className={dangerBtn} onClick={() => setDeleting(course)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Read only</span>
        ),
    },
  ];

  const save = async () => {
    if (!draft) return;
    if (!draft.code.trim() || !draft.name.trim()) {
      setFormError('Course code and course name are required.');
      return;
    }
    if (!Number.isInteger(Number(draft.creditHours)) || draft.creditHours < 0 || draft.creditHours > 6) {
      setFormError('Credit hours must be a number from 0 to 6.');
      return;
    }
    if (!Number.isInteger(Number(draft.labHours ?? 0)) || (draft.labHours ?? 0) < 0 || (draft.labHours ?? 0) > draft.creditHours) {
      setFormError('Lab hours must be a number from 0 up to the total credit hours.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const courseToSave =
        (draft.labHours ?? 0) > 0
          ? draft
          : {
              ...draft,
              labManualUrl: '',
              labManualPath: null,
            };

      if (isNew) {
        const created = await coursesService.create(courseToSave);
        setCourses((items) => [...items, created].sort((a, b) => a.code.localeCompare(b.code)));
      } else {
        const updated = await coursesService.update(draft.id, courseToSave);
        setCourses((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      }
      if ((draft.labHours ?? 0) === 0 && draft.labManualPath) void coursesService.removeCourseDocument(draft.labManualPath);
      setDraft(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save course.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setFormError(null);
    try {
      await coursesService.remove(deleting.id);
      setCourses((items) => items.filter((item) => item.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete course.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <AdminTopbar
        title="Courses"
        subtitle="Course outlines shown on the Courses page"
        action={
          canManage ? (
            <button
              onClick={() => {
                setDraft(emptyCourse());
                setIsNew(true);
                setFormError(null);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> Add Course
            </button>
          ) : undefined
        }
      />

      <div className="p-4 sm:p-6">
        {(error || formError) && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {formError ?? error}
          </div>
        )}
        {loading ? (
          <EmptyState title="Loading courses" description="Fetching the latest course catalog." />
        ) : (
          <AdminTable
            columns={columns}
            rows={courses}
            rowKey={(course) => course.id}
            searchable={(course) => `${course.code} ${course.name} ${course.department}`}
            emptyMessage="No courses have been added yet."
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'Add Course' : 'Edit Course'}
        subtitle="Saved changes appear on the public Courses page."
        onClose={() => setDraft(null)}
        footer={
          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-70"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Course code" required>
                <AdminInput
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  placeholder="CS-301"
                />
              </AdminField>
              <AdminField label="Credits" hint="0-6">
                <AdminInput
                  type="number"
                  min={0}
                  max={6}
                  value={draft.creditHours}
                  onChange={(e) => setDraft({ ...draft, creditHours: Number(e.target.value) })}
                />
              </AdminField>
            </div>
            <AdminField label="Lab hours" hint="Choose 0 for courses without a lab component.">
              <AdminSelect
                value={draft.labHours ?? 0}
                onChange={(e) => {
                  const labHours = Number(e.target.value);
                  setDraft({
                    ...draft,
                    labHours,
                  });
                }}
              >
                {Array.from({ length: Math.max(7, draft.creditHours + 1) }, (_, value) => value)
                  .filter((value) => value <= draft.creditHours)
                  .map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? 'No lab' : `${value} lab hour${value > 1 ? 's' : ''}`}
                    </option>
                  ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Course name" required>
              <AdminInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </AdminField>
            <AdminField label="Department">
              <AdminInput value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
            </AdminField>
            <AdminField label="Prerequisites" hint="Search by course code or course name.">
              <CoursePrerequisitePicker
                courses={courses}
                currentCode={draft.code}
                selectedCodes={draft.prerequisites ?? []}
                onChange={(prerequisites) => setDraft({ ...draft, prerequisites })}
              />
            </AdminField>
            <AdminField label="Description">
              <AdminTextarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </AdminField>
            <AdminField label="Faculty" hint="Search and assign one or more faculty members.">
              <CourseFacultyPicker
                teachers={teachers}
                selectedIds={draft.teacherIds ?? []}
                onChange={(teacherIds) => setDraft({ ...draft, teacherIds })}
              />
            </AdminField>
            <AdminField label="Outcomes" hint="One per line">
              <AdminTextarea
                value={draft.outcomes.join('\n')}
                onChange={(e) => setDraft({ ...draft, outcomes: parseLines(e.target.value) })}
              />
            </AdminField>
            <AdminField label="Study tips" hint="One per line">
              <AdminTextarea
                value={draft.tips.join('\n')}
                onChange={(e) => setDraft({ ...draft, tips: parseLines(e.target.value) })}
              />
            </AdminField>
            <AdminField label="Useful links" hint="One per line: Label | https://example.com">
              <AdminTextarea
                value={formatLinks(draft.usefulLinks)}
                onChange={(e) => setDraft({ ...draft, usefulLinks: parseLinks(e.target.value) })}
              />
            </AdminField>
            <AdminField label="CDF" hint="Optional PDF document.">
              <CourseDocumentField
                label="CDF"
                value={draft.cdfUrl}
                path={draft.cdfPath}
                courseCode={draft.code}
                folder="cdf"
                onChange={({ url, path }) => setDraft({ ...draft, cdfUrl: url, cdfPath: path })}
                onError={(message) => setFormError(message || null)}
              />
            </AdminField>
            {(draft.labHours ?? 0) > 0 ? (
              <AdminField label="Lab manual" hint="Optional PDF document.">
                <CourseDocumentField
                  label="Lab manual"
                  value={draft.labManualUrl}
                  path={draft.labManualPath}
                  courseCode={draft.code}
                  folder="lab-manuals"
                  onChange={({ url, path }) => setDraft({ ...draft, labManualUrl: url, labManualPath: path })}
                  onError={(message) => setFormError(message || null)}
                />
              </AdminField>
            ) : (
              <div className="rounded-xl border border-black/5 bg-cream px-4 py-3 text-sm font-medium text-slate-500">
                This course does not include a lab component, so no lab manual is required.
              </div>
            )}
          </div>
        )}
      </AdminEditDrawer>

      <ConfirmModal
        open={!!deleting}
        title="Delete this course?"
        description="This course will no longer appear on the public Courses page."
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
