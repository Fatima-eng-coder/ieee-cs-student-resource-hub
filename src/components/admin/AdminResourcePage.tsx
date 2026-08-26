import { useState, type ReactNode } from 'react';
import { Plus, Eye, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useCollection } from '@/hooks/useCollection';
import { adminAuthService } from '@/services/adminAuthService';

export interface ResourceApi<T> {
  update: (patch: Partial<T>) => void;
  remove: () => void;
}

interface AdminResourcePageProps<T> {
  title: string;
  subtitle?: string;
  addLabel: string;
  /** Persistent collection key shared with the public site. */
  collectionKey: string;
  seed: T[];
  rowKey: (t: T) => string;
  /** Columns WITHOUT an actions column — actions are appended automatically. */
  columns: AdminTableColumn<T>[];
  emptyItem: () => T;
  renderForm: (draft: T, setDraft: (t: T) => void) => ReactNode;
  /** Optional read-only view (e.g. preview a past paper). Adds a "View" action. */
  renderView?: (item: T) => ReactNode;
  searchable?: (t: T) => string;
  /** Custom per-row actions (e.g. Verify / Approve), left of Edit. */
  extraActions?: (item: T, api: ResourceApi<T>) => ReactNode;
  validate?: (t: T) => boolean;
  /** Set false to hide the top "Add" action (e.g. student-submitted Projects). */
  addable?: boolean;
  /** Set false to hide Edit (e.g. read-only resources like Projects). */
  editable?: boolean;
  deletable?: boolean;
  /** Show up/down controls to reorder items (e.g. Quick Links, FAQ). */
  reorderable?: boolean;
}

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';

export default function AdminResourcePage<T extends { id: string }>({
  title,
  subtitle,
  addLabel,
  collectionKey,
  seed,
  rowKey,
  columns,
  emptyItem,
  renderForm,
  renderView,
  searchable,
  extraActions,
  validate,
  addable = true,
  editable = true,
  deletable = true,
  reorderable = false,
}: AdminResourcePageProps<T>) {
  const { items: rows, upsert, update, remove, setAll } = useCollection<T>(collectionKey, seed);
  const canManage = adminAuthService.canManageContent();

  const move = (row: T, dir: -1 | 1) => {
    const i = rows.findIndex((r) => r.id === row.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setAll(next);
  };
  const [draft, setDraft] = useState<T | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [viewing, setViewing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);

  const openNew = () => {
    setDraft(emptyItem());
    setIsNew(true);
  };
  const openEdit = (row: T) => {
    setDraft(row);
    setIsNew(false);
  };

  const save = () => {
    if (!draft) return;
    if (validate && !validate(draft)) return;
    upsert(draft);
    setDraft(null);
  };

  const updateRow = (row: T, patch: Partial<T>) => update(row.id, patch);

  const actionsColumn: AdminTableColumn<T> = {
    key: '__actions',
    header: '',
    align: 'right',
    render: (row) => (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {canManage && reorderable && (
          <span className="flex items-center">
            <button
              onClick={() => move(row, -1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 bg-white text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
              aria-label="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => move(row, 1)}
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 bg-white text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
              aria-label="Move down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        {canManage && extraActions?.(row, { update: (p) => updateRow(row, p), remove: () => setDeleting(row) })}
        {renderView && (
          <button className={actionBtn} onClick={() => setViewing(row)}>
            <Eye className="h-3.5 w-3.5" /> View
          </button>
        )}
        {canManage && editable && (
          <button className={actionBtn} onClick={() => openEdit(row)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        )}
        {canManage && deletable && (
          <button className={dangerBtn} onClick={() => setDeleting(row)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
      </div>
    ),
  };

  return (
    <div>
      <AdminTopbar
        title={title}
        subtitle={subtitle}
        action={
          addable && canManage ? (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> {addLabel}
            </button>
          ) : undefined
        }
      />
      <div className="p-4 sm:p-6">
        <AdminTable columns={[...columns, actionsColumn]} rows={rows} rowKey={rowKey} searchable={searchable} />
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? `Add ${addLabel.replace(/^Add\s|^New\s|^Invite\s/i, '')}` : `Edit`}
        subtitle="Prototype — saved to this session (wired to the database later)."
        onClose={() => setDraft(null)}
        footer={
          <button
            onClick={save}
            className="w-full rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark"
          >
            Save
          </button>
        }
      >
        {draft && renderForm(draft, setDraft)}
      </AdminEditDrawer>

      {renderView && (
        <AdminEditDrawer open={!!viewing} title="Details" onClose={() => setViewing(null)}>
          {viewing && renderView(viewing)}
        </AdminEditDrawer>
      )}

      <ConfirmModal
        open={!!deleting}
        title="Delete this item?"
        description="This removes it from the list."
        danger
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
