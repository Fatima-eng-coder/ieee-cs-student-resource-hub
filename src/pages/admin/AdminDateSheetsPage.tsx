import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileCheck2, Loader2, Pencil, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import { adminAuthService } from '@/services/adminAuthService';
import { dateSheetsService, type AdminDateSheet, type DateSheetSaveInput } from '@/services/dateSheetsService';
import { currentTerm } from '@/data/dateSheets';
import { hasFile } from '@/utils/files';
import { PROGRAMS } from '@/types';

/**
 * PostgREST can answer with an empty message, and the banner below only renders a non-empty
 * string. Without the fallback a failed save would look identical to a cancelled one.
 */
const getCleanError = (err: unknown, fallback: string) => (err instanceof Error && err.message) || fallback;

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';

const emptyDateSheet = (): AdminDateSheet => ({
  id: '',
  title: '',
  program: PROGRAMS[0],
  semester: 1,
  term: currentTerm.term,
  year: currentTerm.year,
  fileUrl: '',
  filePath: null,
  // Drafts by default: a new sheet has no file yet, and the database refuses a published one
  // without it. Starting published would mean every new entry opens on an error.
  isPublished: false,
  uploadedDate: '',
  createdAt: '',
  updatedAt: '',
});

/** The sheet is chosen here and uploaded on save, so a cancelled drawer leaves nothing behind. */
function DateSheetFileField({
  fileUrl,
  selectedFile,
  onFileChange,
  onClear,
}: {
  fileUrl: string;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const attached = !!selectedFile || hasFile(fileUrl);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`flex min-h-12 flex-1 items-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-left text-sm transition ${
          attached
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : 'border-slate-300 bg-white text-slate-500 hover:border-ieee-orange/60 hover:text-ieee-orange'
        }`}
      >
        {attached ? <FileCheck2 className="h-4 w-4 shrink-0" /> : <UploadCloud className="h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1 font-semibold">
          {selectedFile
            ? `${selectedFile.name} — saved with this sheet`
            : attached
              ? 'Date sheet attached — click to replace'
              : 'Upload date sheet (PDF)'}
        </span>
      </button>

      {/* Only the stored file can be opened; a pending selection is not on the server yet. */}
      {!selectedFile && hasFile(fileUrl) && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
          aria-label="Open date sheet"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}

      {attached && (
        <button
          type="button"
          onClick={() => {
            onFileChange(null);
            onClear();
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-slate-400 transition hover:border-rose-300 hover:text-rose-600"
          aria-label="Remove date sheet file"
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
          onFileChange(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export default function AdminDateSheetsPage() {
  const [sheets, setSheets] = useState<AdminDateSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminDateSheet | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deleting, setDeleting] = useState<AdminDateSheet | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setSheets(await dateSheetsService.list());
    } catch (err) {
      setError(getCleanError(err, 'Failed to load date sheets.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const closeDraft = () => {
    setDraft(null);
    setSelectedFile(null);
    setIsNew(false);
  };

  // date_sheets_published_needs_file_check refuses a published sheet with nothing attached.
  // Caught here so the admin is told which field is missing while the drawer is still open,
  // rather than losing the save to a constraint name.
  const willHaveFile = !!selectedFile || hasFile(draft?.fileUrl ?? '');
  const publishProblem =
    draft?.isPublished && !willHaveFile
      ? 'A published date sheet needs its file attached. Upload the sheet, or untick Published to keep it as a draft.'
      : '';

  const save = async () => {
    if (!draft) return;
    if (!canManage) {
      setError('You do not have permission to manage date sheets.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    let uploaded: { url: string; path: string } | null = null;
    const previousPath = draft.filePath;

    try {
      if (selectedFile) {
        uploaded = await dateSheetsService.uploadFile(selectedFile, draft.id || crypto.randomUUID());
      }

      const input: DateSheetSaveInput = {
        title: draft.title,
        program: draft.program,
        semester: draft.semester,
        term: draft.term,
        year: draft.year,
        fileUrl: uploaded?.url ?? draft.fileUrl,
        filePath: uploaded?.path ?? draft.filePath,
        isPublished: draft.isPublished,
      };

      const saved = isNew ? await dateSheetsService.create(input) : await dateSheetsService.update(draft.id, input);

      // Only once the row actually points somewhere else. Swept before the write lands, a failed
      // save would leave a published sheet whose download 404s for every student who clicks it.
      if (previousPath && previousPath !== saved.filePath) {
        void dateSheetsService.removeFile(previousPath);
      }

      setSheets((items) => {
        const exists = items.some((item) => item.id === saved.id);
        const next = exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved];
        return next.sort(
          (a, b) => b.year - a.year || a.program.localeCompare(b.program) || a.semester - b.semester
        );
      });

      closeDraft();
      setSuccess(isNew ? 'Date sheet created successfully.' : 'Date sheet updated successfully.');
    } catch (err) {
      if (uploaded) void dateSheetsService.removeFile(uploaded.path);
      setError(getCleanError(err, 'Failed to save the date sheet.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    // Defence in depth behind the policy: it refuses a non-manager anyway, and refusing here
    // says so in words instead of as a silent no-op.
    if (!canManage) {
      setError('You do not have permission to manage date sheets.');
      setDeleting(null);
      return;
    }

    const sheet = deleting;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await dateSheetsService.remove(sheet.id);
      setSheets((items) => items.filter((item) => item.id !== sheet.id));
      setSuccess('Date sheet deleted.');
    } catch (err) {
      setError(getCleanError(err, 'Failed to delete the date sheet.'));
    } finally {
      setDeleting(null);
      setSaving(false);
    }
  };

  const columns: AdminTableColumn<AdminDateSheet>[] = [
    {
      key: 'title',
      header: 'Title',
      sortValue: (d) => d.title,
      render: (d) => <span className="font-medium text-slate-900">{d.title}</span>,
    },
    {
      key: 'program',
      header: 'Program',
      sortValue: (d) => d.program,
      render: (d) => <span className="text-xs font-semibold text-ieee-orange">{d.program}</span>,
    },
    { key: 'semester', header: 'Semester', sortValue: (d) => d.semester, render: (d) => `Sem ${d.semester}` },
    { key: 'term', header: 'Term', sortValue: (d) => `${d.year}${d.term}`, render: (d) => `${d.term} ${d.year}` },
    {
      key: 'file',
      header: 'File',
      render: (d) =>
        hasFile(d.fileUrl) ? (
          <a
            href={d.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-ieee-orange"
          >
            <FileCheck2 className="h-3.5 w-3.5" /> Open
          </a>
        ) : (
          <span className="text-slate-400">None</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (d) => (d.isPublished ? 'published' : 'draft'),
      render: (d) => (
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            d.isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {d.isPublished ? 'Published' : 'Draft'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) =>
        canManage ? (
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                setDraft(d);
                setSelectedFile(null);
                setIsNew(false);
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button type="button" className={dangerBtn} onClick={() => setDeleting(d)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Read only</span>
        ),
    },
  ];

  const publishedCount = sheets.filter((sheet) => sheet.isPublished).length;

  return (
    <div>
      <AdminTopbar
        title="Date Sheets"
        subtitle="Exam date sheets per program and semester"
        action={
          canManage ? (
            <button
              onClick={() => {
                setDraft(emptyDateSheet());
                setSelectedFile(null);
                setIsNew(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> Add Date Sheet
            </button>
          ) : undefined
        }
      />

      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {success}
          </div>
        )}

        {/*
         * The public page shows its parked "coming back" screen until at least one sheet is
         * published, and swaps itself over the moment one is. Said here because otherwise the
         * only way to discover it is to publish something and watch the site change.
         */}
        {!loading && !error && (
          <div className="mb-4 rounded-xl border border-black/5 bg-white px-4 py-3 text-sm text-slate-600">
            {publishedCount === 0
              ? 'The public Date Sheets page is showing its "coming back" screen. Publish a sheet here and the page switches itself over to the real list.'
              : `The public Date Sheets page is live, showing ${publishedCount} published ${
                  publishedCount === 1 ? 'sheet' : 'sheets'
                }. Unpublishing them all returns it to the "coming back" screen.`}
          </div>
        )}

        {loading ? (
          <EmptyState title="Loading date sheets" description="Fetching the stored date sheets." />
        ) : (
          <AdminTable
            columns={columns}
            rows={sheets}
            rowKey={(d) => d.id}
            searchable={(d) => `${d.title} ${d.program} ${d.term} ${d.year}`}
            emptyMessage="No date sheets have been added yet."
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'Add Date Sheet' : 'Edit Date Sheet'}
        subtitle="Published sheets appear on the public Date Sheets page."
        onClose={closeDraft}
        footer={
          <button
            onClick={save}
            disabled={saving || !!publishProblem}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-70"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <AdminField
              label="Date sheet file"
              hint="PDF, up to 10 MB. This is what students download. A scanned sheet needs converting to PDF first — the document store accepts nothing else."
            >
              <DateSheetFileField
                fileUrl={draft.fileUrl}
                selectedFile={selectedFile}
                onFileChange={setSelectedFile}
                onClear={() => setDraft({ ...draft, fileUrl: '', filePath: null })}
              />
            </AdminField>
            <AdminField label="Title" required>
              <AdminInput
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="CS Semester 3 Final — Fall 2026"
              />
            </AdminField>
            <AdminField label="Program" required>
              <AdminSelect value={draft.program} onChange={(e) => setDraft({ ...draft, program: e.target.value })}>
                {/*
                 * A sheet entered outside this app can carry a program this build does not list.
                 * Kept as an option so opening it to fix a typo does not silently re-file it
                 * under Computer Science on the way back out.
                 */}
                {!PROGRAMS.includes(draft.program as (typeof PROGRAMS)[number]) && draft.program && (
                  <option value={draft.program}>{draft.program}</option>
                )}
                {PROGRAMS.map((program) => (
                  <option key={program} value={program}>
                    {program}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <div className="grid grid-cols-3 gap-3">
              <AdminField label="Semester">
                <AdminInput
                  type="number"
                  min={1}
                  max={12}
                  value={draft.semester}
                  onChange={(e) => setDraft({ ...draft, semester: Number(e.target.value) })}
                />
              </AdminField>
              <AdminField label="Term">
                <AdminInput
                  value={draft.term}
                  onChange={(e) => setDraft({ ...draft, term: e.target.value })}
                  placeholder="Fall"
                />
              </AdminField>
              <AdminField label="Year">
                <AdminInput
                  type="number"
                  min={2000}
                  max={2100}
                  value={draft.year}
                  onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) })}
                />
              </AdminField>
            </div>

            <div className="rounded-xl border border-black/5 bg-white p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.isPublished}
                  onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })}
                  className="accent-ieee-orange"
                />
                Published
              </label>
              <p className={`mt-2 text-xs ${publishProblem ? 'font-medium text-rose-600' : 'text-slate-400'}`}>
                {publishProblem || 'Only published sheets are visible to students.'}
              </p>
            </div>
          </div>
        )}
      </AdminEditDrawer>

      <ConfirmModal
        open={!!deleting}
        title="Delete this date sheet?"
        description="The entry and its uploaded file are removed permanently."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
