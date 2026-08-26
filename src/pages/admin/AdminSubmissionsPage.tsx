import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ExternalLink, Eye, RotateCcw, SearchCheck, X } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import StatusBadge from '@/components/ui/StatusBadge';
import { adminAuthService } from '@/services/adminAuthService';
import {
  DuplicateMaterialError,
  papersService,
  subscribeMaterialsChanged,
  type MaterialChange,
} from '@/services/papersService';
import { useStore } from '@/hooks/useCollection';
import { loadFromStorage } from '@/utils/storage';
import type { Paper, Submission } from '@/types';

type ReviewSubmission =
  | (Submission & { source: 'local'; paper?: never })
  | (Submission & { source: 'paper'; paper: Paper });
type PaperReviewSubmission = Extract<ReviewSubmission, { source: 'paper' }>;

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';

const isPaper = (paper: Paper | null): paper is Paper => Boolean(paper);

function isRealLocalSubmission(submission: Submission): boolean {
  return !/^sub-\d+$/.test(submission.id) && submission.type !== 'paper';
}

function paperToSubmission(paper: Paper): PaperReviewSubmission {
  return {
    id: `paper:${paper.id}`,
    type: 'paper',
    submittedBy: paper.uploadedBy,
    submittedAt: paper.uploadedDate,
    status: paper.verification === 'verified' ? 'approved' : 'pending',
    source: 'paper',
    paper,
    data: {
      title: paper.title,
      course: paper.courseName,
      materialType: paper.examType,
      session: `${paper.session} ${paper.year}`,
      instructor: paper.instructor,
      tags: paper.tags.join(', '),
      file: paper.fileUrl || 'No file attached',
    },
  };
}

const typeLabel = (type: Submission['type']) => type.replace(/-/g, ' ');

export default function AdminSubmissionsPage() {
  const [localSubmissions, setLocalSubmissions] = useStore<Submission>('submissions', []);
  const [paperSubmissions, setPaperSubmissions] = useState<PaperReviewSubmission[]>([]);
  const [filter, setFilter] = useState<'all' | Submission['type']>('all');
  const [viewing, setViewing] = useState<ReviewSubmission | null>(null);
  const [duplicateReview, setDuplicateReview] = useState<{ pending: Paper; duplicate: Paper | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = adminAuthService.canManageContent();

  // Keep real local submissions from modules that are not Supabase-backed yet,
  // but clear old seed/demo rows that were persisted during the prototype.
  useEffect(() => {
    const cleanCurrent = localSubmissions.filter(isRealLocalSubmission);
    const incoming = loadFromStorage<Submission>('ieeecs_submissions', []).filter(isRealLocalSubmission);
    const existing = new Set(cleanCurrent.map((s) => s.id));
    const fresh = incoming.filter((s) => !existing.has(s.id));
    const next = [...fresh, ...cleanCurrent];

    if (fresh.length || next.length !== localSubmissions.length) setLocalSubmissions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadPapers = async () => {
      try {
        const papers = await papersService.list();
        if (!ignore) setPaperSubmissions(papers.map(paperToSubmission));
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load paper submissions.');
      }
    };

    const applyMaterialChange = (change?: MaterialChange) => {
      if (!change) {
        void loadPapers();
        return;
      }

      if (change.type === 'delete') {
        setPaperSubmissions((items) => items.filter((item) => item.paper.id !== change.id));
        setViewing((current) => (current?.source === 'paper' && current.paper.id === change.id ? null : current));
        return;
      }

      const updated = paperToSubmission(change.paper);
      setPaperSubmissions((items) => {
        const exists = items.some((item) => item.paper.id === change.paper.id);
        if (change.type === 'insert' && !exists) return [updated, ...items];
        if (!exists) return items;
        return items.map((item) => (item.paper.id === change.paper.id ? updated : item));
      });
      setViewing((current) => (current?.source === 'paper' && current.paper.id === change.paper.id ? updated : current));
    };

    const unsubscribe = subscribeMaterialsChanged(applyMaterialChange);
    void loadPapers();

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, []);

  const submissions: ReviewSubmission[] = [
    ...paperSubmissions,
    ...localSubmissions.map((submission) => ({ ...submission, source: 'local' as const })),
  ].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const updatePaperSubmission = (paper: Paper) => {
    const updated = paperToSubmission(paper);
    setPaperSubmissions((items) => items.map((item) => (item.paper.id === paper.id ? updated : item)));
    setViewing((current) => (current?.source === 'paper' && current.paper.id === paper.id ? updated : current));
  };

  const removePaperSubmission = (paperId: string) => {
    setPaperSubmissions((items) => items.filter((item) => item.paper.id !== paperId));
    setViewing((current) => (current?.source === 'paper' && current.paper.id === paperId ? null : current));
  };

  const setStatus = async (submission: ReviewSubmission, status: Submission['status']) => {
    if (!canManage) {
      setError('Only content managers can update submissions.');
      return;
    }

    if (submission.source === 'local') {
      setLocalSubmissions(localSubmissions.map((s) => (s.id === submission.id ? { ...s, status } : s)));
      setViewing((current) => (current && current.id === submission.id ? { ...current, status } : current));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (status === 'approved') {
        const { duplicate, exists } = await papersService.findDuplicate(submission.paper, {
          verificationStatuses: ['verified'],
        });
        if (exists) {
          setDuplicateReview({ pending: submission.paper, duplicate });
          return;
        }

        const verified = await papersService.verify(submission.paper.id);
        updatePaperSubmission(verified);
      } else if (status === 'pending') {
        const pending = await papersService.update(submission.paper.id, { verification: 'pending' });
        updatePaperSubmission(pending);
      } else if (status === 'rejected') {
        await papersService.remove(submission.paper.id);
        removePaperSubmission(submission.paper.id);
      }
    } catch (err) {
      if (submission.source === 'paper' && err instanceof DuplicateMaterialError) {
        setDuplicateReview({ pending: submission.paper, duplicate: err.duplicate });
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to update paper submission.');
    } finally {
      setSaving(false);
    }
  };

  const replaceExisting = async () => {
    if (!duplicateReview) return;
    setSaving(true);
    setError(null);
    try {
      const duplicate = duplicateReview.duplicate;
      if (!duplicate) {
        setError('A matching material exists, but its details are not available. Please refresh and review the table before replacing.');
        return;
      }

      await papersService.remove(duplicate.id);
      const verified = await papersService.update(duplicateReview.pending.id, { verification: 'verified' });
      updatePaperSubmission(verified);
      removePaperSubmission(duplicate.id);
      setDuplicateReview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace duplicate paper.');
    } finally {
      setSaving(false);
    }
  };

  const deleteNewSubmission = async () => {
    if (!duplicateReview) return;
    setSaving(true);
    setError(null);
    try {
      await papersService.remove(duplicateReview.pending.id);
      removePaperSubmission(duplicateReview.pending.id);
      setDuplicateReview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete duplicate paper.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = filter === 'all' ? submissions : submissions.filter((s) => s.type === filter);
  const types = [...new Set(submissions.map((s) => s.type))];
  const pendingCount = submissions.filter((s) => s.status === 'pending').length;

  const columns: AdminTableColumn<ReviewSubmission>[] = [
    {
      key: 'type',
      header: 'Type',
      sortValue: (s) => s.type,
      render: (s) => <span className="font-medium capitalize text-slate-900">{typeLabel(s.type)}</span>,
    },
    { key: 'submittedBy', header: 'Submitted By', sortValue: (s) => s.submittedBy, render: (s) => s.submittedBy },
    { key: 'submittedAt', header: 'Date', sortValue: (s) => s.submittedAt, render: (s) => s.submittedAt },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
    {
      key: '__actions',
      header: '',
      align: 'right',
      render: (s) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button type="button" onClick={() => setViewing(s)} className={actionBtn}>
            <Eye className="h-3.5 w-3.5" /> View
          </button>
          {canManage && s.status !== 'approved' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void setStatus(s, 'approved')}
              className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-70"
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
          )}
          {canManage && s.status === 'approved' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void setStatus(s, 'pending')}
              className={actionBtn}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Review
            </button>
          )}
          {canManage && s.status !== 'rejected' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void setStatus(s, 'rejected')}
              className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-70"
            >
              <X className="h-3.5 w-3.5" /> Reject
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <AdminTopbar title="Submissions" subtitle={`${pendingCount} pending review`} />
      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              filter === 'all' ? 'bg-ieee-orange text-white shadow-sm' : 'border border-black/10 bg-white text-slate-600 hover:border-ieee-orange/40'
            }`}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
                filter === t ? 'bg-ieee-orange text-white shadow-sm' : 'border border-black/10 bg-white text-slate-600 hover:border-ieee-orange/40'
              }`}
            >
              {typeLabel(t)}
            </button>
          ))}
        </div>

        <AdminTable
          columns={columns}
          rows={filtered}
          rowKey={(s) => s.id}
          searchable={(s) => `${s.type} ${s.submittedBy} ${Object.values(s.data).join(' ')}`}
          emptyMessage="No submissions of this type yet."
        />
      </div>

      <AdminEditDrawer open={!!viewing} title="Submission Details" onClose={() => setViewing(null)}>
        {viewing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold uppercase tracking-wide text-ieee-orange">
                {typeLabel(viewing.type)}
              </span>
              <StatusBadge status={viewing.status} />
            </div>
            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Submitted By</p>
              <p className="mt-0.5 font-semibold text-slate-800">{viewing.submittedBy}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Date</p>
              <p className="mt-0.5 text-sm text-slate-700">{viewing.submittedAt}</p>
            </div>
            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-slate-400">Submitted Data</p>
              <dl className="flex flex-col gap-3">
                {Object.entries(viewing.data).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs font-semibold capitalize text-slate-500">{k.replace(/([A-Z])/g, ' $1')}</dt>
                    <dd className="mt-0.5 break-words text-sm text-slate-800">
                      {k === 'file' && viewing.source === 'paper' && viewing.paper.fileUrl ? (
                        <a
                          href={viewing.paper.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-ieee-orange hover:underline"
                        >
                          Open file <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        v || <span className="text-slate-300">-</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            {canManage && (
              <div className="flex gap-2">
                {viewing.status !== 'approved' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void setStatus(viewing, 'approved')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                )}
                {viewing.status === 'approved' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void setStatus(viewing, 'pending')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-70"
                  >
                    <RotateCcw className="h-4 w-4" /> Review
                  </button>
                )}
                {viewing.status !== 'rejected' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void setStatus(viewing, 'rejected')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-70"
                  >
                    <X className="h-4 w-4" /> Reject
                  </button>
                )}
              </div>
            )}
          </motion.div>
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
                    {index === 0 ? `Existing ${paper.verification} material` : 'New pending material'}
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
                onClick={() => void replaceExisting()}
                disabled={saving || !duplicateReview.duplicate}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-70"
              >
                Replace old
              </button>
              <button
                type="button"
                onClick={() => void deleteNewSubmission()}
                disabled={saving}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-70"
              >
                Reject new
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
