import { useEffect, useRef, useState } from 'react';
import { Check, Download, FileCheck2, FileText, Loader2, Paperclip, Pencil, RotateCcw, SearchCheck, Trash2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import VerificationBadge from '@/components/ui/VerificationBadge';
import CourseSearchSelect from '@/components/ui/CourseSearchSelect';
import { adminAuthService } from '@/services/adminAuthService';
import {
  DuplicateMaterialError,
  papersService,
  subscribeMaterialsChanged,
  type MaterialChange,
} from '@/services/papersService';
import { useCourses } from '@/hooks/useCourses';
import { getSafeDownloadAttribute, hasFile, isImage, isPdf } from '@/utils/files';
import type { Course } from '@/types';
import type { Paper } from '@/types';

const materialTypes: Paper['examType'][] = ['Midterm', 'Final', 'Quiz', 'Assignment'];
const sessionOptions = ['Spring', 'Fall'] as const;
const minYear = 2000;
const maxYear = Math.min(new Date().getFullYear(), 2099);

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';

const isPaper = (paper: Paper | null): paper is Paper => Boolean(paper);

const emptyPaper = (course: Course): Paper => ({
  id: '',
  courseId: course.id,
  courseName: course.name,
  title: '',
  session: 'Fall',
  year: new Date().getFullYear(),
  examType: 'Final',
  instructor: '',
  fileUrl: '',
  uploadedBy: 'IEEE CS',
  uploadedDate: new Date().toISOString().slice(0, 10),
  verification: 'verified',
  tags: [],
  downloads: 0,
});

function normalizePaperDraft(draft: Paper): Paper {
  return {
    ...draft,
    title: draft.title.trim(),
    session: sessionOptions.includes(draft.session as (typeof sessionOptions)[number]) ? draft.session : 'Fall',
    year: draft.year,
  };
}

function MaterialFileField({
  value,
  file,
  onFileChange,
}: {
  value: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const label = file?.name ?? (hasFile(value) ? 'File attached - click to replace' : 'Upload file');

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`flex flex-1 items-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-sm transition ${
          file || hasFile(value)
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : 'border-slate-300 text-slate-500 hover:border-ieee-orange/60'
        }`}
      >
        {file || hasFile(value) ? <FileCheck2 className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
        {label}
      </button>
      {file && (
        <button
          type="button"
          onClick={() => onFileChange(null)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/10 text-slate-400 hover:text-rose-600"
          aria-label="Clear selected file"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          onFileChange(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function FilePreview({ paper }: { paper: Paper }) {
  if (hasFile(paper.fileUrl) && isPdf(paper.fileUrl)) {
    return <iframe title={paper.title} src={paper.fileUrl} className="h-96 w-full" />;
  }

  if (hasFile(paper.fileUrl) && isImage(paper.fileUrl)) {
    return <img src={paper.fileUrl} alt={paper.title} className="max-h-96 w-full object-contain" />;
  }

  return (
    <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-slate-400">
      <FileText className="h-10 w-10" />
      <p className="text-sm">No file uploaded</p>
    </div>
  );
}

export default function AdminPapersPage() {
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Paper | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [viewing, setViewing] = useState<Paper | null>(null);
  const [deleting, setDeleting] = useState<Paper | null>(null);
  const [duplicateReview, setDuplicateReview] = useState<{ pending: Paper; duplicate: Paper | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showApproved, setShowApproved] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      setPapers(await papersService.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load course material.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const applyMaterialChange = (change?: MaterialChange) => {
    if (!change) {
      void load(false);
      return;
    }

    if (change.type === 'delete') {
      setPapers((items) => items.filter((item) => item.id !== change.id));
      setViewing((current) => (current?.id === change.id ? null : current));
      return;
    }

    setPapers((items) => {
      const exists = items.some((item) => item.id === change.paper.id);
      if (change.type === 'insert' && !exists) return [change.paper, ...items];
      if (!exists) return items;
      return items.map((item) => (item.id === change.paper.id ? change.paper : item));
    });
    setViewing((current) => (current?.id === change.paper.id ? change.paper : current));
  };

  useEffect(() => {
    const unsubscribe = subscribeMaterialsChanged(applyMaterialChange);
    void load(true);
    return unsubscribe;
  }, []);

  const openNew = () => {
    if (courses.length === 0) {
      setError('Add courses before adding course material.');
      return;
    }
    setDraft(emptyPaper(courses[0]));
    setSelectedFile(null);
    setIsNew(true);
  };

  const openEdit = (paper: Paper) => {
    setDraft(paper);
    setSelectedFile(null);
    setIsNew(false);
  };

  const save = async () => {
    if (!draft || !draft.title.trim()) {
      setError('Title is required.');
      return;
    }

    const normalizedDraft = normalizePaperDraft(draft);
    if (!Number.isInteger(normalizedDraft.year) || normalizedDraft.year < minYear || normalizedDraft.year > maxYear) {
      setError(`Please enter a valid year from ${minYear} to ${maxYear}.`);
      return;
    }

    if (isNew && !selectedFile && !hasFile(normalizedDraft.fileUrl)) {
      setError('Please attach the file before saving.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (normalizedDraft.verification === 'verified') {
        const { duplicate, exists } = await papersService.findDuplicate(normalizedDraft, {
          verificationStatuses: ['verified'],
        });
        if (exists) {
          if (!isNew) setDuplicateReview({ pending: normalizedDraft, duplicate });
          else setError('A matching verified material already exists. Please review the existing material before adding this one.');
          return;
        }
      }

      if (isNew) {
        const created = await papersService.create(normalizedDraft, selectedFile);
        setPapers((items) => [created, ...items]);
      } else {
        const updated = await papersService.update(normalizedDraft.id, normalizedDraft, selectedFile);
        setPapers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      }
      setDraft(null);
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save material.');
    } finally {
      setSaving(false);
    }
  };

  const removePaper = async (paper: Paper) => {
    setSaving(true);
    setError(null);
    try {
      await papersService.remove(paper.id);
      setPapers((items) => items.filter((item) => item.id !== paper.id));
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete material.');
    } finally {
      setSaving(false);
    }
  };

  const verifyPaper = async (paper: Paper) => {
    setSaving(true);
    setError(null);
    try {
      const { duplicate, exists } = await papersService.findDuplicate(paper, {
        verificationStatuses: ['verified'],
      });
      if (exists) {
        setDuplicateReview({ pending: paper, duplicate });
        return;
      }

      const verified = await papersService.verify(paper.id);
      setPapers((items) => items.map((item) => (item.id === verified.id ? verified : item)));
    } catch (err) {
      if (err instanceof DuplicateMaterialError) {
        setDuplicateReview({ pending: paper, duplicate: err.duplicate });
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to verify material.');
    } finally {
      setSaving(false);
    }
  };

  const movePaperToPending = async (paper: Paper) => {
    if (!canManage) {
      setError('Only content managers can update materials.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const pending = await papersService.update(paper.id, { verification: 'pending' });
      setPapers((items) => items.map((item) => (item.id === pending.id ? pending : item)));
      setViewing((current) => (current?.id === pending.id ? pending : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move material back to pending review.');
    } finally {
      setSaving(false);
    }
  };

  const deleteDuplicateNew = async () => {
    if (!duplicateReview) return;
    await removePaper(duplicateReview.pending);
    setDuplicateReview(null);
  };

  const replaceDuplicateOld = async () => {
    if (!duplicateReview) return;
    setSaving(true);
    try {
      const duplicate = duplicateReview.duplicate;
      if (!duplicate) {
        setError('A matching material exists, but its details are not available. Please refresh and review the table before replacing.');
        return;
      }

      await papersService.remove(duplicate.id);
      const verified = await papersService.update(duplicateReview.pending.id, { verification: 'verified' });
      setPapers((items) => [
        verified,
        ...items.filter((item) => item.id !== duplicate.id && item.id !== verified.id),
      ]);
      setDuplicateReview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace material.');
    } finally {
      setSaving(false);
    }
  };

  const columns: AdminTableColumn<Paper>[] = [
    {
      key: 'title',
      header: 'Title',
      sortValue: (p) => p.title,
      render: (p) => <span className="font-medium text-slate-900">{p.title}</span>,
    },
    { key: 'course', header: 'Course', sortValue: (p) => p.courseName, render: (p) => p.courseName },
    { key: 'type', header: 'Type', sortValue: (p) => p.examType, render: (p) => p.examType },
    { key: 'session', header: 'Session', sortValue: (p) => p.year, render: (p) => `${p.session} ${p.year}` },
    { key: 'by', header: 'Submitted By', render: (p) => p.uploadedBy },
    { key: 'verification', header: 'Status', render: (p) => <VerificationBadge status={p.verification} size="sm" /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {canManage && p.verification === 'pending' && (
            <button type="button" className={actionBtn} disabled={saving} onClick={() => void verifyPaper(p)}>
              <Check className="h-3.5 w-3.5" /> Verify
            </button>
          )}
          {canManage && p.verification === 'verified' && (
            <button type="button" className={actionBtn} disabled={saving} onClick={() => void movePaperToPending(p)}>
              <RotateCcw className="h-3.5 w-3.5" /> Review
            </button>
          )}
          <button type="button" className={actionBtn} onClick={() => setViewing(p)}>
            <FileText className="h-3.5 w-3.5" /> View
          </button>
          {canManage && (
            <>
              <button type="button" className={actionBtn} onClick={() => openEdit(p)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button type="button" className={dangerBtn} onClick={() => setDeleting(p)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </>
          )}
        </div>
      ),
    },
  ];
  const visiblePapers = papers.filter((paper) => paper.verification === (showApproved ? 'verified' : 'pending'));
  const pendingCount = papers.filter((paper) => paper.verification === 'pending').length;
  const approvedCount = papers.filter((paper) => paper.verification === 'verified').length;

  return (
    <div>
      <AdminTopbar
        title="Course Material"
        subtitle={showApproved ? `${approvedCount} approved material` : `${pendingCount} pending review`}
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowApproved((current) => !current)}
                className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-ieee-orange/40 hover:text-ieee-orange"
              >
                {showApproved ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {showApproved ? 'View Pending' : 'View Approved'}
              </button>
              <button
                onClick={openNew}
                className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
              >
                <FileText className="h-4 w-4" /> Add Material
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="p-4 sm:p-6">
        {(error || coursesError) && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error ?? coursesError}
          </div>
        )}
        {loading ? (
          <EmptyState title="Loading course material" description="Fetching the latest submissions." />
        ) : (
          <AdminTable
            columns={columns}
            rows={visiblePapers}
            rowKey={(p) => p.id}
            searchable={(p) => `${p.title} ${p.courseName} ${p.examType} ${p.uploadedBy} ${p.tags.join(' ')}`}
            emptyTitle={showApproved ? 'No approved material' : 'No pending material'}
            emptyMessage={showApproved ? 'No approved course material yet.' : 'No pending course material right now.'}
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'Add Material' : 'Edit Material'}
        subtitle="Verified Midterm and Final materials appear in the public Past Papers archive."
        onClose={() => {
          setDraft(null);
          setSelectedFile(null);
        }}
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
            <AdminField label="Material file" required hint="PDF, PNG, JPG or WebP.">
              <MaterialFileField value={draft.fileUrl} file={selectedFile} onFileChange={setSelectedFile} />
            </AdminField>
            <AdminField label="Title" required>
              <AdminInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </AdminField>
            <AdminField label="Course">
              <CourseSearchSelect
                courses={courses}
                selectedId={draft.courseId}
                disabled={coursesLoading || courses.length === 0}
                onChange={(courseId) => {
                  const course = courses.find((item) => item.id === courseId);
                  if (!course) return;
                  setDraft({ ...draft, courseId: course.id, courseName: course.name });
                }}
                placeholder={coursesLoading ? 'Loading courses...' : 'Search by course code or name'}
              />
            </AdminField>
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Session">
                <AdminSelect value={draft.session} onChange={(e) => setDraft({ ...draft, session: e.target.value })}>
                  {sessionOptions.map((session) => (
                    <option key={session} value={session}>
                      {session}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Year" hint={`${minYear}-${maxYear}`}>
                <AdminInput
                  type="number"
                  min={minYear}
                  max={maxYear}
                  step={1}
                  value={Number.isFinite(draft.year) ? draft.year : ''}
                  onChange={(e) => setDraft({ ...draft, year: e.target.value ? Number(e.target.value) : Number.NaN })}
                />
              </AdminField>
            </div>
            <AdminField label="Material type">
              <AdminSelect value={draft.examType} onChange={(e) => setDraft({ ...draft, examType: e.target.value as Paper['examType'] })}>
                {materialTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Instructor">
              <AdminInput value={draft.instructor} onChange={(e) => setDraft({ ...draft, instructor: e.target.value })} />
            </AdminField>
            <AdminField label="Tags" hint="Comma-separated">
              <AdminInput
                value={draft.tags.join(', ')}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              />
            </AdminField>
          </div>
        )}
      </AdminEditDrawer>

      <AdminEditDrawer open={!!viewing} title="Material Details" onClose={() => setViewing(null)}>
        {viewing && (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-2xl border border-black/5 bg-slate-50">
              <FilePreview paper={viewing} />
            </div>
            {hasFile(viewing.fileUrl) && (
              <a
                href={viewing.fileUrl.trim()}
                download={getSafeDownloadAttribute(
                  viewing.fileUrl,
                  `${viewing.courseName}-${viewing.examType}-${viewing.year}`,
                )}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-ieee-orange/40 hover:text-ieee-orange"
              >
                <Download className="h-4 w-4" /> Download file
              </a>
            )}
            <VerificationBadge status={viewing.verification} />
            {canManage && viewing.verification === 'verified' && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void movePaperToPending(viewing)}
                className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-70"
              >
                <RotateCcw className="h-4 w-4" /> Review
              </button>
            )}
          </div>
        )}
      </AdminEditDrawer>

      {duplicateReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ieee-ink/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-black/5 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <SearchCheck className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">Possible duplicate found</h3>
                <p className="mt-1 text-sm text-slate-500">
                  This material has reached the verified limit for the same course, session, year and type.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[duplicateReview.duplicate, duplicateReview.pending].filter(isPaper).map((paper, index) => (
                <div key={paper.id} className="rounded-2xl border border-black/5 bg-cream p-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                    {index === 0 ? `Existing ${paper.verification}` : 'New pending'}
                  </p>
                  <h4 className="mt-1 font-semibold text-slate-900">{paper.title}</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {paper.courseName} - {paper.examType} - {paper.session} {paper.year}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Uploaded by {paper.uploadedBy}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDuplicateReview(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-black/5"
              >
                Keep pending
              </button>
              <button
                type="button"
                onClick={() => void replaceDuplicateOld()}
                disabled={saving || !duplicateReview.duplicate}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-70"
              >
                Replace old
              </button>
              <button
                type="button"
                onClick={() => void deleteDuplicateNew()}
                disabled={saving}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-70"
              >
                Delete new
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleting}
        title="Delete this material?"
        description="This removes the record and its attached file."
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void removePaper(deleting);
        }}
      />
    </div>
  );
}
