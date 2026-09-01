import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect, AdminTextarea } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import { adminAuthService } from '@/services/adminAuthService';
import { faqsService, type AdminFaq } from '@/services/siteContentService';
import type { FAQ } from '@/types';

const categories: FAQ['category'][] = [
  'IEEE CS',
  'Past Papers',
  'Courses',
  'Events',
  'Navigation',
  'Projects Expo',
  'Contributions',
  'Technical Issues',
];

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';
const moveBtn =
  'flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 bg-white text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-30';

const emptyFaq = (): AdminFaq => ({
  id: '',
  question: '',
  answer: '',
  category: 'IEEE CS',
  sortOrder: 0,
});

export default function AdminFaqPage() {
  const [faqs, setFaqs] = useState<AdminFaq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminFaq | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleting, setDeleting] = useState<AdminFaq | null>(null);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setFaqs(await faqsService.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the FAQ list.');
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
      if (isNew) {
        const created = await faqsService.create(draft);
        setFaqs((items) => [...items, created]);
      } else {
        const updated = await faqsService.update(draft.id, draft);
        setFaqs((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the FAQ.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await faqsService.remove(deleting.id);
      setFaqs((items) => items.filter((item) => item.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the FAQ.');
    } finally {
      setSaving(false);
    }
  };

  const move = async (faq: AdminFaq, direction: -1 | 1) => {
    setMoving(true);
    setError(null);
    try {
      setFaqs(await faqsService.move(faqs, faq.id, direction));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder the FAQ list.');
    } finally {
      setMoving(false);
    }
  };

  // The table renders the collection in its stored order, so a row's index is the position a
  // visitor sees it in and is what the arrows have to be measured against.
  const positions = new Map(faqs.map((faq, index) => [faq.id, index]));

  const columns: AdminTableColumn<AdminFaq>[] = [
    {
      key: 'position',
      header: '#',
      render: (f) => <span className="font-mono text-xs text-slate-400">{(positions.get(f.id) ?? 0) + 1}</span>,
    },
    {
      key: 'question',
      header: 'Question',
      render: (f) => <span className="font-medium text-slate-900">{f.question}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (f) => (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{f.category}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (f) => {
        if (!canManage) return <span className="text-xs text-slate-400">Read only</span>;
        const position = positions.get(f.id) ?? 0;

        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span className="flex items-center gap-1">
              <button
                type="button"
                className={moveBtn}
                disabled={moving || position === 0}
                onClick={() => void move(f, -1)}
                aria-label="Move up"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={moveBtn}
                disabled={moving || position === faqs.length - 1}
                onClick={() => void move(f, 1)}
                aria-label="Move down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </span>
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                setDraft(f);
                setIsNew(false);
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button type="button" className={dangerBtn} onClick={() => setDeleting(f)}>
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
        title="FAQ Management"
        subtitle="Questions shown on the FAQ & Contact page"
        action={
          canManage ? (
            <button
              onClick={() => {
                setDraft(emptyFaq());
                setIsNew(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> New FAQ
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
            The arrows move a question within the whole list, which is the order visitors read it in —
            not within whatever the search box has narrowed the table down to.
          </p>
        )}
        {loading ? (
          <EmptyState title="Loading FAQs" description="Fetching the published questions." />
        ) : (
          <AdminTable
            columns={columns}
            rows={faqs}
            rowKey={(f) => f.id}
            searchable={(f) => `${f.question} ${f.answer} ${f.category}`}
            emptyMessage="No questions have been published yet."
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'New FAQ' : 'Edit FAQ'}
        subtitle="Saved changes appear on the public FAQ & Contact page."
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
            <AdminField label="Question" required>
              <AdminInput value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
            </AdminField>
            <AdminField label="Answer" required>
              <AdminTextarea value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
            </AdminField>
            <AdminField label="Category">
              <AdminSelect
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as FAQ['category'] })}
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
        title="Delete this question?"
        description="It will no longer appear on the public FAQ & Contact page."
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
