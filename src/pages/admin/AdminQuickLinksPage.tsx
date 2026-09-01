import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import { adminAuthService } from '@/services/adminAuthService';
import { quickLinksService, sortQuickLinks, type AdminQuickLink } from '@/services/siteContentService';
import type { QuickLink } from '@/types';

const categories: QuickLink['category'][] = [
  'University Portals',
  'Academic Resources',
  'Society Links',
  'Forms',
  'Event Links',
  'Past Paper Links',
  'Student Help',
];

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';
const moveBtn =
  'flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 bg-white text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-30';

const emptyLink = (): AdminQuickLink => ({
  id: '',
  label: '',
  url: '',
  category: 'University Portals',
  sortOrder: 0,
});

export default function AdminQuickLinksPage() {
  const [links, setLinks] = useState<AdminQuickLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminQuickLink | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleting, setDeleting] = useState<AdminQuickLink | null>(null);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setLinks(await quickLinksService.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quick links.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!draft) return;

    setSaving(true);
    setError(null);
    try {
      // Both paths re-sort: a new link lands at the end of its own category rather than the end
      // of the table, and an edit that changes the category moves the row into that block.
      if (isNew) {
        const created = await quickLinksService.create(draft);
        setLinks((items) => sortQuickLinks([...items, created]));
      } else {
        const updated = await quickLinksService.update(draft.id, draft);
        setLinks((items) => sortQuickLinks(items.map((item) => (item.id === updated.id ? updated : item))));
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the link.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await quickLinksService.remove(deleting.id);
      setLinks((items) => items.filter((item) => item.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the link.');
    } finally {
      setSaving(false);
    }
  };

  const move = async (link: AdminQuickLink, direction: -1 | 1) => {
    setMoving(true);
    setError(null);
    try {
      setLinks(await quickLinksService.move(links, link.id, direction));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder quick links.');
    } finally {
      setMoving(false);
    }
  };

  // The public page groups these by category, so what a nudge changes is where a link sits
  // among the others in its own card — nothing about a link in a different card. The number
  // shown and the arrows are therefore measured inside the category, not down the whole table.
  const categorySizes = new Map<QuickLink['category'], number>();
  const positions = new Map<string, number>();
  links.forEach((link) => {
    const position = categorySizes.get(link.category) ?? 0;
    positions.set(link.id, position);
    categorySizes.set(link.category, position + 1);
  });

  const columns: AdminTableColumn<AdminQuickLink>[] = [
    {
      key: 'position',
      header: '# in category',
      render: (l) => <span className="font-mono text-xs text-slate-400">{(positions.get(l.id) ?? 0) + 1}</span>,
    },
    { key: 'label', header: 'Label', render: (l) => <span className="font-medium text-slate-900">{l.label}</span> },
    {
      key: 'category',
      header: 'Category',
      render: (l) => (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{l.category}</span>
      ),
    },
    { key: 'url', header: 'URL', render: (l) => <span className="font-mono text-xs text-slate-500">{l.url}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (l) => {
        if (!canManage) return <span className="text-xs text-slate-400">Read only</span>;
        const position = positions.get(l.id) ?? 0;

        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span className="flex items-center gap-1">
              <button
                type="button"
                className={moveBtn}
                disabled={moving || position === 0}
                onClick={() => void move(l, -1)}
                aria-label="Move up"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={moveBtn}
                disabled={moving || position === (categorySizes.get(l.category) ?? 1) - 1}
                onClick={() => void move(l, 1)}
                aria-label="Move down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </span>
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                setDraft(l);
                setIsNew(false);
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button type="button" className={dangerBtn} onClick={() => setDeleting(l)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <AdminTopbar
        title="Quick Links"
        subtitle="Links shown on the Quick Links page"
        action={
          canManage ? (
            <button
              onClick={() => {
                setDraft(emptyLink());
                setIsNew(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> Add Link
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
        {canManage && (
          <p className="mb-4 text-xs text-slate-500">
            The arrows move a link within its own category — the order it appears in on the public
            page&apos;s card for that category — and stop at the category&apos;s first and last link.
            They ignore whatever the search box has narrowed the table down to. To move a link to a
            different category, edit it and change the category.
          </p>
        )}
        {loading ? (
          <EmptyState title="Loading quick links" description="Fetching the published links." />
        ) : (
          <AdminTable
            columns={columns}
            rows={links}
            rowKey={(l) => l.id}
            searchable={(l) => `${l.label} ${l.category} ${l.url}`}
            emptyMessage="No quick links have been published yet."
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'Add Link' : 'Edit Link'}
        subtitle="Saved changes appear on the public Quick Links page."
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
            <AdminField label="Label" required>
              <AdminInput value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </AdminField>
            <AdminField label="URL" required hint="Internal (/courses) or external (https://…)">
              <AdminInput value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            </AdminField>
            <AdminField label="Category">
              <AdminSelect
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as QuickLink['category'] })}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          </div>
        )}
      </AdminEditDrawer>

      <ConfirmModal
        open={!!deleting}
        title="Delete this link?"
        description="It will no longer appear on the public Quick Links page."
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
