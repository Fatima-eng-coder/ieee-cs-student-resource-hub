import { useEffect, useState } from 'react';
import { Check, Pencil, RotateCcw, SearchCheck, Trash2, UserRound, Users } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import VerificationBadge from '@/components/ui/VerificationBadge';
import { adminAuthService } from '@/services/adminAuthService';
import {
  DuplicateTeacherError,
  facultyAdminService,
  subscribeFacultyChanged,
  type AdminTeacher,
  type DuplicateTeacherMatch,
  type FacultyChange,
} from '@/services/facultyAdminService';
import { facultySuggestionService, type FacultySuggestion } from '@/services/facultySuggestionService';

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';

const isTeacher = (teacher: AdminTeacher | null): teacher is AdminTeacher => Boolean(teacher);

type TeacherEntry =
  | { source: 'faculty'; id: string; teacher: AdminTeacher; suggestion?: never }
  | { source: 'suggestion'; id: string; teacher: AdminTeacher; suggestion: FacultySuggestion };

const emptyTeacher = (): AdminTeacher => ({
  id: '',
  name: '',
  designation: '',
  department: '',
  email: '',
  office: '',
  courses: [],
  photo: '',
  uploadedBy: 'IEEE CS',
  uploadedDate: new Date().toISOString().slice(0, 10),
  verification: 'verified',
});

function normalizeTeacherDraft(draft: AdminTeacher): AdminTeacher {
  return {
    ...draft,
    name: draft.name.trim(),
    designation: draft.designation.trim(),
    department: draft.department.trim(),
    email: draft.email.trim(),
    office: draft.office.trim(),
  };
}

function suggestionToTeacher(suggestion: FacultySuggestion): AdminTeacher {
  return {
    id: `suggestion:${suggestion.id}`,
    name: suggestion.teacherName,
    designation: suggestion.designation ?? '',
    department: suggestion.department ?? '',
    email: suggestion.email ?? '',
    office: suggestion.office ?? '',
    courses: suggestion.courseCode ? [suggestion.courseCode] : [],
    photo: '',
    uploadedBy: suggestion.requesterName || suggestion.requesterEmail || 'Guest suggestion',
    uploadedDate: suggestion.createdAt.slice(0, 10),
    verification: 'pending',
  };
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [teacherSuggestions, setTeacherSuggestions] = useState<FacultySuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminTeacher | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [viewing, setViewing] = useState<TeacherEntry | null>(null);
  const [deleting, setDeleting] = useState<TeacherEntry | null>(null);
  const [duplicateReview, setDuplicateReview] = useState<{
    pending: AdminTeacher;
    duplicate: AdminTeacher | null;
    match: DuplicateTeacherMatch | null;
    suggestion?: FacultySuggestion;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showApproved, setShowApproved] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      setTeachers(await facultyAdminService.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teacher directory.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const loadTeacherSuggestions = async () => {
    try {
      setTeacherSuggestions(await facultySuggestionService.listForAdmin());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teacher suggestions.');
    }
  };

  const applyFacultyChange = (change?: FacultyChange) => {
    if (!change) {
      void load(false);
      return;
    }

    if (change.type === 'delete') {
      setTeachers((items) => items.filter((item) => item.id !== change.id));
      setViewing((current) => (current?.source === 'faculty' && current.teacher.id === change.id ? null : current));
      return;
    }

    setTeachers((items) => {
      const exists = items.some((item) => item.id === change.teacher.id);
      if (change.type === 'insert' && !exists) return [change.teacher, ...items];
      if (!exists) return items;
      return items.map((item) => (item.id === change.teacher.id ? change.teacher : item));
    });
    setViewing((current) =>
      current?.source === 'faculty' && current.teacher.id === change.teacher.id
        ? { ...current, teacher: change.teacher }
        : current
    );
  };

  useEffect(() => {
    const refreshQuietly = () => void load(false);
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshQuietly();
    };
    const unsubscribe = subscribeFacultyChanged(applyFacultyChange);
    void load(true);
    window.addEventListener('focus', refreshQuietly);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', refreshQuietly);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const refreshQuietly = () => void loadTeacherSuggestions();
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshQuietly();
    };
    const unsubscribe = facultySuggestionService.subscribe(refreshQuietly);

    void loadTeacherSuggestions();
    window.addEventListener('focus', refreshQuietly);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', refreshQuietly);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const openNew = () => {
    setDraft(emptyTeacher());
    setIsNew(true);
  };

  const openEdit = (teacher: AdminTeacher) => {
    setDraft(teacher);
    setIsNew(false);
  };

  const save = async () => {
    if (!draft || !draft.name.trim()) {
      setError('Name is required.');
      return;
    }

    const normalizedDraft = normalizeTeacherDraft(draft);
    if (!normalizedDraft.department) {
      setError('Department is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (normalizedDraft.verification === 'verified') {
        const { duplicate, exists, match } = await facultyAdminService.findDuplicate(normalizedDraft, {
          verificationStatuses: ['verified'],
        });
        if (exists) {
          if (!isNew) setDuplicateReview({ pending: normalizedDraft, duplicate, match });
          else {
            setError(
              match === 'email'
                ? 'A teacher with this email is already verified. Please review the existing entry before adding this one.'
                : 'A teacher with the same name and department may already exist. Please review the existing entry before adding this one.'
            );
          }
          return;
        }
      }

      if (isNew) {
        const created = await facultyAdminService.create(normalizedDraft);
        setTeachers((items) => [created, ...items]);
      } else {
        const updated = await facultyAdminService.update(normalizedDraft.id, normalizedDraft);
        setTeachers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save teacher.');
    } finally {
      setSaving(false);
    }
  };

  const removeTeacher = async (teacher: AdminTeacher) => {
    setSaving(true);
    setError(null);
    try {
      await facultyAdminService.remove(teacher.id);
      setTeachers((items) => items.filter((item) => item.id !== teacher.id));
      setViewing((current) => (current?.source === 'faculty' && current.teacher.id === teacher.id ? null : current));
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete teacher.');
    } finally {
      setSaving(false);
    }
  };

  const verifyTeacher = async (teacher: AdminTeacher) => {
    setSaving(true);
    setError(null);
    try {
      const { duplicate, exists, match } = await facultyAdminService.findDuplicate(teacher, {
        verificationStatuses: ['verified'],
      });
      if (exists) {
        setDuplicateReview({ pending: teacher, duplicate, match });
        return;
      }

      const verified = await facultyAdminService.verify(teacher.id);
      setTeachers((items) => items.map((item) => (item.id === verified.id ? verified : item)));
    } catch (err) {
      if (err instanceof DuplicateTeacherError) {
        setDuplicateReview({ pending: teacher, duplicate: err.duplicate, match: err.match });
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to verify teacher.');
    } finally {
      setSaving(false);
    }
  };

  const moveTeacherToPending = async (teacher: AdminTeacher) => {
    if (!canManage) {
      setError('Only content managers can update teacher entries.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const pending = await facultyAdminService.update(teacher.id, { verification: 'pending' });
      setTeachers((items) => items.map((item) => (item.id === pending.id ? pending : item)));
      setViewing((current) =>
        current?.source === 'faculty' && current.teacher.id === pending.id ? { ...current, teacher: pending } : current
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move teacher back to pending review.');
    } finally {
      setSaving(false);
    }
  };

  const deleteDuplicateNew = async () => {
    if (!duplicateReview) return;
    if (duplicateReview.suggestion) {
      await rejectTeacherSuggestion(duplicateReview.suggestion);
    } else {
      await removeTeacher(duplicateReview.pending);
    }
    setDuplicateReview(null);
  };

  const verifyDuplicateAnyway = async () => {
    if (!duplicateReview) return;

    setSaving(true);
    setError(null);
    try {
      if (duplicateReview.suggestion) {
        const result = await facultySuggestionService.approve(duplicateReview.suggestion, { allowDuplicate: true });
        updateTeacherSuggestion(result.suggestion);
      } else {
        const verified = await facultyAdminService.verify(duplicateReview.pending.id, { allowPossibleDuplicate: true });
        setTeachers((items) => items.map((item) => (item.id === verified.id ? verified : item)));
      }
      setDuplicateReview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify teacher.');
    } finally {
      setSaving(false);
    }
  };

  const updateTeacherSuggestion = (suggestion: FacultySuggestion) => {
    setTeacherSuggestions((items) => items.map((item) => (item.id === suggestion.id ? suggestion : item)));
    setViewing((current) =>
      current?.source === 'suggestion' && current.suggestion.id === suggestion.id
        ? { ...current, suggestion, teacher: suggestionToTeacher(suggestion) }
        : current
    );
  };

  const verifyTeacherSuggestion = async (suggestion: FacultySuggestion) => {
    if (!canManage) {
      setError('Only content managers can verify teacher suggestions.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const duplicate = await facultySuggestionService.findApprovalDuplicate(suggestion);
      if (duplicate.exists) {
        setDuplicateReview({
          pending: suggestionToTeacher(suggestion),
          duplicate: duplicate.duplicate,
          match: duplicate.match,
          suggestion,
        });
        return;
      }

      const result = await facultySuggestionService.approve(suggestion);
      updateTeacherSuggestion(result.suggestion);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify teacher suggestion.');
    } finally {
      setSaving(false);
    }
  };

  const rejectTeacherSuggestion = async (suggestion: FacultySuggestion) => {
    if (!canManage) {
      setError('Only content managers can reject teacher suggestions.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await facultySuggestionService.reject(suggestion);
      updateTeacherSuggestion(result.suggestion);
      setViewing((current) => (current?.source === 'suggestion' && current.suggestion.id === suggestion.id ? null : current));
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject teacher suggestion.');
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (entry: TeacherEntry) => {
    if (entry.source === 'suggestion') {
      await rejectTeacherSuggestion(entry.suggestion);
      return;
    }

    await removeTeacher(entry.teacher);
  };

  const columns: AdminTableColumn<TeacherEntry>[] = [
    {
      key: 'name',
      header: 'Name',
      sortValue: (entry) => entry.teacher.name,
      render: (entry) => <span className="font-medium text-slate-900">{entry.teacher.name}</span>,
    },
    {
      key: 'designation',
      header: 'Designation',
      sortValue: (entry) => entry.teacher.designation,
      render: (entry) => entry.teacher.designation,
    },
    {
      key: 'department',
      header: 'Department',
      sortValue: (entry) => entry.teacher.department,
      render: (entry) => entry.teacher.department,
    },
    { key: 'email', header: 'Email', render: (entry) => entry.teacher.email || 'Not listed' },
    { key: 'office', header: 'Office', render: (entry) => entry.teacher.office || 'Not listed' },
    { key: 'verification', header: 'Status', render: (entry) => <VerificationBadge status={entry.teacher.verification} size="sm" /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (entry) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {canManage && entry.teacher.verification === 'pending' && (
            <button
              type="button"
              className={actionBtn}
              disabled={saving}
              onClick={() =>
                entry.source === 'suggestion'
                  ? void verifyTeacherSuggestion(entry.suggestion)
                  : void verifyTeacher(entry.teacher)
              }
            >
              <Check className="h-3.5 w-3.5" /> Verify
            </button>
          )}
          {canManage && entry.source === 'faculty' && entry.teacher.verification === 'verified' && (
            <button type="button" className={actionBtn} disabled={saving} onClick={() => void moveTeacherToPending(entry.teacher)}>
              <RotateCcw className="h-3.5 w-3.5" /> Review
            </button>
          )}
          <button type="button" className={actionBtn} onClick={() => setViewing(entry)}>
            <UserRound className="h-3.5 w-3.5" /> View
          </button>
          {canManage && (
            <>
              {entry.source === 'faculty' && (
                <button type="button" className={actionBtn} onClick={() => openEdit(entry.teacher)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              )}
              <button type="button" className={dangerBtn} onClick={() => setDeleting(entry)}>
                <Trash2 className="h-3.5 w-3.5" /> {entry.source === 'suggestion' ? 'Reject' : 'Delete'}
              </button>
            </>
          )}
        </div>
      ),
    },
  ];
  const facultyEntries: TeacherEntry[] = teachers.map((teacher) => ({
    source: 'faculty',
    id: `faculty:${teacher.id}`,
    teacher,
  }));
  const pendingSuggestionEntries: TeacherEntry[] = teacherSuggestions
    .filter((suggestion) => suggestion.status === 'pending')
    .map((suggestion) => ({
      source: 'suggestion',
      id: `suggestion:${suggestion.id}`,
      teacher: suggestionToTeacher(suggestion),
      suggestion,
    }));
  const visibleTeachers = showApproved
    ? facultyEntries.filter((entry) => entry.teacher.verification === 'verified')
    : [
        ...facultyEntries.filter((entry) => entry.teacher.verification === 'pending'),
        ...pendingSuggestionEntries,
      ];
  const pendingCount = teachers.filter((teacher) => teacher.verification === 'pending').length + pendingSuggestionEntries.length;
  const approvedCount = teachers.filter((teacher) => teacher.verification === 'verified').length;

  return (
    <div>
      <AdminTopbar
        title="Teacher Directory"
        subtitle={showApproved ? `${approvedCount} approved teachers` : `${pendingCount} pending review`}
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
                <Users className="h-4 w-4" /> Add Teacher
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
        {loading ? (
          <EmptyState title="Loading teacher directory" description="Fetching the latest submissions." />
        ) : (
          <AdminTable
            columns={columns}
            rows={visibleTeachers}
            rowKey={(entry) => entry.id}
            searchable={(entry) =>
              `${entry.teacher.name} ${entry.teacher.designation} ${entry.teacher.department} ${entry.teacher.email} ${entry.teacher.office} ${entry.source}`
            }
            emptyTitle={showApproved ? 'No approved teachers' : 'No pending teachers'}
            emptyMessage={showApproved ? 'No approved teacher entries yet.' : 'No pending teacher entries right now.'}
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'Add Teacher' : 'Edit Teacher'}
        subtitle="Verified teachers appear in the public Teacher Directory."
        onClose={() => setDraft(null)}
        footer={
          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-70"
          >
            Save
          </button>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <AdminField label="Name" required>
              <AdminInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </AdminField>
            <AdminField label="Designation">
              <AdminInput
                value={draft.designation}
                placeholder="e.g. Assistant Professor"
                onChange={(e) => setDraft({ ...draft, designation: e.target.value })}
              />
            </AdminField>
            <AdminField label="Department" required>
              <AdminInput value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
            </AdminField>
            <AdminField label="Email">
              <AdminInput type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </AdminField>
            <AdminField label="Office" hint="Room / building">
              <AdminInput value={draft.office} onChange={(e) => setDraft({ ...draft, office: e.target.value })} />
            </AdminField>
          </div>
        )}
      </AdminEditDrawer>

      <AdminEditDrawer open={!!viewing} title="Teacher Details" onClose={() => setViewing(null)}>
        {viewing && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 rounded-2xl border border-black/5 bg-slate-50 p-4">
              <h4 className="font-display text-lg font-bold text-slate-900">{viewing.teacher.name}</h4>
              <p className="text-sm text-slate-600">{viewing.teacher.designation || 'Designation not listed'}</p>
              <p className="text-sm text-slate-500">{viewing.teacher.department || 'Department not listed'}</p>
              <p className="mt-2 text-sm text-slate-500">{viewing.teacher.email || 'Email not listed'}</p>
              <p className="text-sm text-slate-500">{viewing.teacher.office || 'Office not listed'}</p>
              {viewing.source === 'suggestion' && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                  Pending teacher info suggestion
                </p>
              )}
            </div>
            <VerificationBadge status={viewing.teacher.verification} />
            {canManage && viewing.source === 'faculty' && viewing.teacher.verification === 'verified' && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void moveTeacherToPending(viewing.teacher)}
                className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-70"
              >
                <RotateCcw className="h-4 w-4" /> Review
              </button>
            )}
            {canManage && viewing.source === 'suggestion' && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void verifyTeacherSuggestion(viewing.suggestion)}
                className="flex items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-70"
              >
                <Check className="h-4 w-4" /> Verify
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
                <h3 className="font-display text-lg font-bold text-slate-900">
                  {duplicateReview.match === 'email' ? 'Duplicate teacher found' : 'Possible duplicate found'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {duplicateReview.match === 'email'
                    ? 'A verified teacher with the same email already exists. Keep the current entry pending or remove it.'
                    : 'A verified teacher with the same name and department may already exist. Review both entries before deciding what to keep.'}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[duplicateReview.duplicate, duplicateReview.pending].filter(isTeacher).map((teacher, index) => (
                <div key={teacher.id || index} className="rounded-2xl border border-black/5 bg-cream p-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                    {index === 0 ? `Existing ${teacher.verification}` : 'New pending'}
                  </p>
                  <h4 className="mt-1 font-semibold text-slate-900">{teacher.name}</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {[teacher.department, teacher.designation].filter(Boolean).join(' - ') || 'No department listed'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{teacher.email || 'No email listed'}</p>
                  <p className="mt-1 text-xs text-slate-400">Added by {teacher.uploadedBy}</p>
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
                onClick={() => void verifyDuplicateAnyway()}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-70"
              >
                Verify anyway
              </button>
              <button
                type="button"
                onClick={() => void deleteDuplicateNew()}
                disabled={saving}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-70"
              >
                Delete current
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleting}
        title={deleting?.source === 'suggestion' ? 'Reject this teacher suggestion?' : 'Delete this teacher?'}
        description={
          deleting?.source === 'suggestion'
            ? 'This marks the pending teacher info suggestion as rejected and removes it from the pending review list.'
            : 'This removes the teacher from the directory.'
        }
        confirmLabel={saving ? (deleting?.source === 'suggestion' ? 'Rejecting...' : 'Deleting...') : deleting?.source === 'suggestion' ? 'Reject' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void removeEntry(deleting);
        }}
      />
    </div>
  );
}
