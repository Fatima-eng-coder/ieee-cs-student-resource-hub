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
  type FacultyChange,
} from '@/services/facultyAdminService';

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';

const isTeacher = (teacher: AdminTeacher | null): teacher is AdminTeacher => Boolean(teacher);

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

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminTeacher | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [viewing, setViewing] = useState<AdminTeacher | null>(null);
  const [deleting, setDeleting] = useState<AdminTeacher | null>(null);
  const [duplicateReview, setDuplicateReview] = useState<{ pending: AdminTeacher; duplicate: AdminTeacher | null } | null>(
    null
  );
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

  const applyFacultyChange = (change?: FacultyChange) => {
    if (!change) {
      void load(false);
      return;
    }

    if (change.type === 'delete') {
      setTeachers((items) => items.filter((item) => item.id !== change.id));
      setViewing((current) => (current?.id === change.id ? null : current));
      return;
    }

    setTeachers((items) => {
      const exists = items.some((item) => item.id === change.teacher.id);
      if (change.type === 'insert' && !exists) return [change.teacher, ...items];
      if (!exists) return items;
      return items.map((item) => (item.id === change.teacher.id ? change.teacher : item));
    });
    setViewing((current) => (current?.id === change.teacher.id ? change.teacher : current));
  };

  useEffect(() => {
    const unsubscribe = subscribeFacultyChanged(applyFacultyChange);
    void load(true);
    return unsubscribe;
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
        const { duplicate, exists } = await facultyAdminService.findDuplicate(normalizedDraft, {
          verificationStatuses: ['verified'],
        });
        if (exists) {
          if (!isNew) setDuplicateReview({ pending: normalizedDraft, duplicate });
          else setError('A matching verified teacher already exists. Please review the existing entry before adding this one.');
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
      const { duplicate, exists } = await facultyAdminService.findDuplicate(teacher, {
        verificationStatuses: ['verified'],
      });
      if (exists) {
        setDuplicateReview({ pending: teacher, duplicate });
        return;
      }

      const verified = await facultyAdminService.verify(teacher.id);
      setTeachers((items) => items.map((item) => (item.id === verified.id ? verified : item)));
    } catch (err) {
      if (err instanceof DuplicateTeacherError) {
        setDuplicateReview({ pending: teacher, duplicate: err.duplicate });
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
      setViewing((current) => (current?.id === pending.id ? pending : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move teacher back to pending review.');
    } finally {
      setSaving(false);
    }
  };

  const deleteDuplicateNew = async () => {
    if (!duplicateReview) return;
    await removeTeacher(duplicateReview.pending);
    setDuplicateReview(null);
  };

  const replaceDuplicateOld = async () => {
    if (!duplicateReview) return;
    setSaving(true);
    try {
      const duplicate = duplicateReview.duplicate;
      if (!duplicate) {
        setError('A matching teacher exists, but its details are not available. Please refresh and review the table before replacing.');
        return;
      }

      await facultyAdminService.remove(duplicate.id);
      const verified = await facultyAdminService.update(duplicateReview.pending.id, { verification: 'verified' });
      setTeachers((items) => [
        verified,
        ...items.filter((item) => item.id !== duplicate.id && item.id !== verified.id),
      ]);
      setDuplicateReview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace teacher.');
    } finally {
      setSaving(false);
    }
  };

  const columns: AdminTableColumn<AdminTeacher>[] = [
    {
      key: 'name',
      header: 'Name',
      sortValue: (t) => t.name,
      render: (t) => <span className="font-medium text-slate-900">{t.name}</span>,
    },
    { key: 'designation', header: 'Designation', sortValue: (t) => t.designation, render: (t) => t.designation },
    { key: 'department', header: 'Department', sortValue: (t) => t.department, render: (t) => t.department },
    { key: 'email', header: 'Email', render: (t) => t.email },
    { key: 'office', header: 'Office', render: (t) => t.office },
    { key: 'verification', header: 'Status', render: (t) => <VerificationBadge status={t.verification} size="sm" /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (t) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {canManage && t.verification === 'pending' && (
            <button type="button" className={actionBtn} disabled={saving} onClick={() => void verifyTeacher(t)}>
              <Check className="h-3.5 w-3.5" /> Verify
            </button>
          )}
          {canManage && t.verification === 'verified' && (
            <button type="button" className={actionBtn} disabled={saving} onClick={() => void moveTeacherToPending(t)}>
              <RotateCcw className="h-3.5 w-3.5" /> Review
            </button>
          )}
          <button type="button" className={actionBtn} onClick={() => setViewing(t)}>
            <UserRound className="h-3.5 w-3.5" /> View
          </button>
          {canManage && (
            <>
              <button type="button" className={actionBtn} onClick={() => openEdit(t)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button type="button" className={dangerBtn} onClick={() => setDeleting(t)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </>
          )}
        </div>
      ),
    },
  ];
  const visibleTeachers = teachers.filter((teacher) => teacher.verification === (showApproved ? 'verified' : 'pending'));
  const pendingCount = teachers.filter((teacher) => teacher.verification === 'pending').length;
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
            rowKey={(t) => t.id}
            searchable={(t) => `${t.name} ${t.designation} ${t.department} ${t.email} ${t.office}`}
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
              <h4 className="font-display text-lg font-bold text-slate-900">{viewing.name}</h4>
              <p className="text-sm text-slate-600">{viewing.designation}</p>
              <p className="text-sm text-slate-500">{viewing.department}</p>
              {viewing.email && <p className="mt-2 text-sm text-slate-500">{viewing.email}</p>}
              {viewing.office && <p className="text-sm text-slate-500">{viewing.office}</p>}
            </div>
            <VerificationBadge status={viewing.verification} />
            {canManage && viewing.verification === 'verified' && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void moveTeacherToPending(viewing)}
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
                  A verified teacher with the same name and department already exists.
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
                    {teacher.department} - {teacher.designation}
                  </p>
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
        title="Delete this teacher?"
        description="This removes the teacher from the directory."
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void removeTeacher(deleting);
        }}
      />
    </div>
  );
}
