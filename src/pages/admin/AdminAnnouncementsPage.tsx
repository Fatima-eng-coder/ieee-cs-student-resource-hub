import { useEffect, useState } from 'react';
import { Loader2, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect, AdminTextarea } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import { adminAuthService } from '@/services/adminAuthService';
import { announcementsService } from '@/services/announcementsService';
import type { Announcement } from '@/types';

const categories: Announcement['category'][] = ['general', 'event', 'academic', 'navigation', 'projects'];

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';

const emptyAnnouncement = (): Announcement => ({
  id: '',
  title: '',
  summary: '',
  body: '',
  date: new Date().toISOString().slice(0, 10),
  category: 'general',
  pinned: false,
});

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Announcement | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setAnnouncements(await announcementsService.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!draft || !draft.title.trim() || !draft.summary.trim()) {
      setError('Title and summary are required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await announcementsService.create(draft);
        setAnnouncements((items) => [created, ...items]);
      } else {
        const updated = await announcementsService.update(draft.id, draft);
        setAnnouncements((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save announcement.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await announcementsService.remove(deleting.id);
      setAnnouncements((items) => items.filter((item) => item.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete announcement.');
    } finally {
      setSaving(false);
    }
  };

  const columns: AdminTableColumn<Announcement>[] = [
    {
      key: 'title',
      header: 'Title',
      sortValue: (a) => a.title,
      render: (a) => (
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-900">{a.title}</span>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sortValue: (a) => a.category, render: (a) => <span className="capitalize">{a.category}</span> },
    { key: 'date', header: 'Date', sortValue: (a) => a.date, render: (a) => a.date },
    {
      key: 'pinned',
      header: 'Pinned',
      render: (a) =>
        a.pinned ? (
          <span className="inline-flex items-center gap-1 text-ieee-orange">
            <Pin className="h-3.5 w-3.5" /> Yes
          </span>
        ) : (
          <span className="text-slate-400">No</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) =>
        canManage ? (
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                setDraft(a);
                setIsNew(false);
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button type="button" className={dangerBtn} onClick={() => setDeleting(a)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Read only</span>
        ),
    },
  ];

  return (
    <div>
      <AdminTopbar
        title="Announcements"
        subtitle="Posts shown on the public Announcements page"
        action={
          canManage ? (
            <button
              onClick={() => {
                setDraft(emptyAnnouncement());
                setIsNew(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> New Announcement
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
        {loading ? (
          <EmptyState title="Loading announcements" description="Fetching the latest published posts." />
        ) : (
          <AdminTable
            columns={columns}
            rows={announcements}
            rowKey={(a) => a.id}
            searchable={(a) => `${a.title} ${a.summary} ${a.category}`}
            emptyMessage="No announcements have been published yet."
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'New Announcement' : 'Edit Announcement'}
        subtitle="Saved changes appear on the public announcements page."
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
            <AdminField label="Title" required>
              <AdminInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </AdminField>
            <AdminField label="Summary" required hint="Shown in the list">
              <AdminInput value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
            </AdminField>
            <AdminField label="Body">
              <AdminTextarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </AdminField>
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Category">
                <AdminSelect value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Announcement['category'] })}>
                  {categories.map((c) => (
                    <option key={c} value={c} className="capitalize">
                      {c}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Date">
                <AdminInput type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </AdminField>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={!!draft.pinned}
                onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
                className="accent-ieee-orange"
              />
              Pin to top
            </label>
          </div>
        )}
      </AdminEditDrawer>

      <ConfirmModal
        open={!!deleting}
        title="Delete this announcement?"
        description="This announcement will no longer appear on the public site."
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
