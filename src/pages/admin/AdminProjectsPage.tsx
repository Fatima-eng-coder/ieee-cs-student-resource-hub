import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ExternalLink, Eye, Trash2, X } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import ConfirmModal from '@/components/ui/ConfirmModal';
import StatusBadge from '@/components/ui/StatusBadge';
import { adminAuthService } from '@/services/adminAuthService';
import {
  projectsService,
  subscribeProjectsChanged,
  type Project,
  type ProjectDecision,
  type ProjectStatus,
} from '@/services/projectsService';

type QueueFilter = 'pending' | 'approved' | 'rejected' | 'all';

const filters: { key: QueueFilter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const actionButton =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-60';

const decisionLabel: Record<ProjectDecision, string> = {
  approved: 'approved and is now on the public showcase',
  rejected: 'rejected and stays off the public showcase',
};

const statusHint: Record<ProjectStatus, string> = {
  pending: 'Waiting for a decision. Not visible to visitors.',
  approved: 'Live on the public showcase.',
  rejected: 'Turned down. Kept here so the decision is on record; delete it to remove it for good.',
};

/**
 * The project moderation queue.
 *
 * Rewritten off AdminResourcePage, which is hard-wired to localStorage collections and has no
 * notion of a row that has to be approved before anybody sees it. There is no "Add Project"
 * here on purpose: the showcase is student-submitted, and a project the committee typed in
 * itself would carry no author to credit and no account to answer questions about it.
 */
export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QueueFilter>('pending');
  const [viewing, setViewing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canManage = adminAuthService.canManageContent();

  const load = useCallback(() => {
    projectsService
      .listForReview()
      .then((rows) => {
        setProjects(rows);
        setError('');
      })
      .catch((cause: unknown) => {
        // The queue is never allowed to degrade to "nothing was submitted": that reads as an
        // empty inbox, and an empty inbox is the one thing a reviewer will not come back to.
        setError(cause instanceof Error ? cause.message : 'The project queue could not be loaded.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = subscribeProjectsChanged(load);
    return unsubscribe;
  }, [load]);

  const pendingCount = useMemo(
    () => projects.filter((project) => project.status === 'pending').length,
    [projects]
  );

  const rows = useMemo(
    () => (filter === 'all' ? projects : projects.filter((project) => project.status === filter)),
    [projects, filter]
  );

  const review = async (project: Project, decision: ProjectDecision) => {
    setBusyId(project.id);
    setError('');
    setNotice('');
    try {
      const updated = await projectsService.review(project.id, decision);
      setProjects((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setViewing((current) => (current?.id === updated.id ? updated : current));
      setNotice(`"${updated.title}" was ${decisionLabel[decision]}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That decision could not be saved.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    setBusyId(target.id);
    setError('');
    setNotice('');
    try {
      await projectsService.remove(target.id);
      setProjects((current) => current.filter((row) => row.id !== target.id));
      setViewing((current) => (current?.id === target.id ? null : current));
      setNotice(`"${target.title}" and its screenshots were deleted.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That project could not be deleted.');
    } finally {
      setBusyId(null);
    }
  };

  const columns: AdminTableColumn<Project>[] = [
    {
      key: 'title',
      header: 'Project',
      sortValue: (project) => project.title,
      render: (project) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{project.title}</p>
          <p className="truncate text-xs text-slate-500">{project.tagline}</p>
        </div>
      ),
    },
    {
      key: 'author',
      header: 'Submitted By',
      sortValue: (project) => project.authorName,
      render: (project) => project.authorName || <span className="text-slate-300">-</span>,
    },
    {
      key: 'category',
      header: 'Category',
      sortValue: (project) => project.category ?? '',
      render: (project) => project.category ?? <span className="text-slate-300">-</span>,
    },
    {
      key: 'shots',
      header: 'Shots',
      align: 'center',
      sortValue: (project) => project.screenshots.length,
      render: (project) => project.screenshots.length,
    },
    {
      key: 'submitted',
      header: 'Submitted',
      sortValue: (project) => project.createdAt,
      render: (project) => project.createdAt.slice(0, 10),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (project) => project.status,
      render: (project) => <StatusBadge status={project.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (project) => (
        <div className="flex justify-end gap-1.5">
          <button type="button" onClick={() => setViewing(project)} className={actionButton}>
            <Eye className="h-3.5 w-3.5" /> View
          </button>
          {canManage && project.status !== 'approved' && (
            <button
              type="button"
              disabled={busyId === project.id}
              onClick={() => void review(project, 'approved')}
              className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
          )}
          {canManage && project.status !== 'rejected' && (
            <button
              type="button"
              disabled={busyId === project.id}
              onClick={() => void review(project, 'rejected')}
              className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" /> Reject
            </button>
          )}
          {canManage && (
            <button
              type="button"
              disabled={busyId === project.id}
              onClick={() => setDeleting(project)}
              className={actionButton}
              aria-label={`Delete ${project.title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <AdminTopbar
        title="Projects"
        subtitle={loading ? 'Loading the queue…' : `${pendingCount} waiting for review`}
      />

      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {notice}
          </div>
        )}
        {!canManage && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            Your role can read this queue but not decide on it. Approve, reject and delete are
            hidden because the database would refuse them anyway — and what you can see here is
            limited to approved projects and your own submissions.
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                filter === key
                  ? 'bg-ieee-orange text-white shadow-sm'
                  : 'border border-black/10 bg-white text-slate-600 hover:border-ieee-orange/40'
              }`}
            >
              {label}
              {key === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 font-mono text-[11px]">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        <AdminTable
          columns={columns}
          rows={rows}
          rowKey={(project) => project.id}
          searchable={(project) =>
            `${project.title} ${project.tagline} ${project.authorName} ${project.category ?? ''} ${project.creators.join(' ')} ${project.techStack.join(' ')}`
          }
          emptyTitle={
            // An empty table under an error banner is the page contradicting itself: the rows
            // are not absent, they were never read.
            error
              ? 'These could not be read'
              : filter === 'pending'
                ? 'Nothing waiting for review'
                : 'No projects here'
          }
          emptyMessage={
            error
              ? 'Nothing below counts as the queue — the read failed, so an empty table here would be a guess.'
              : filter === 'pending'
              ? 'Every project that has been submitted has already been decided on.'
              : filter === 'approved'
                ? 'No project has been approved onto the public showcase yet.'
                : filter === 'rejected'
                  ? 'No project has been turned down.'
                  : 'No student has submitted a project yet.'
          }
        />
      </div>

      <AdminEditDrawer
        open={!!viewing}
        title={viewing?.title ?? 'Project'}
        subtitle={viewing ? statusHint[viewing.status] : undefined}
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold uppercase tracking-wide text-ieee-orange">
                {viewing.category ?? 'Uncategorised'}
              </span>
              <StatusBadge status={viewing.status} />
            </div>

            {viewing.screenshots.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {viewing.screenshots.map((screenshot, index) => (
                  <a
                    key={screenshot}
                    href={screenshot}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-xl border border-black/5"
                  >
                    <img
                      src={screenshot}
                      alt={`${viewing.title} screenshot ${index + 1}`}
                      className="h-28 w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Tagline</p>
              <p className="mt-0.5 text-sm text-slate-800">{viewing.tagline || '-'}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-slate-400">Submitted By</p>
              <p className="mt-0.5 font-semibold text-slate-800">{viewing.authorName || '-'}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-slate-400">Built By</p>
              <p className="mt-0.5 text-sm text-slate-800">{viewing.creators.join(', ') || '-'}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-slate-400">Submitted</p>
              <p className="mt-0.5 text-sm text-slate-700">{viewing.createdAt.slice(0, 10)}</p>
              {viewing.reviewedAt && (
                <>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-slate-400">Last reviewed</p>
                  <p className="mt-0.5 text-sm text-slate-700">{viewing.reviewedAt.slice(0, 10)}</p>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Description</p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{viewing.description || '-'}</p>

              {viewing.techStack.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {viewing.techStack.map((tech) => (
                    <span key={tech} className="rounded-full bg-cream px-2.5 py-1 font-mono text-[11px] text-slate-600">
                      {tech}
                    </span>
                  ))}
                </div>
              )}

              {(viewing.githubUrl || viewing.demoUrl) && (
                <div className="mt-4 flex flex-col gap-2">
                  {viewing.demoUrl && (
                    <a
                      href={viewing.demoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-ieee-orange hover:underline"
                    >
                      Open live demo <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {viewing.githubUrl && (
                    <a
                      href={viewing.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-ieee-orange hover:underline"
                    >
                      Open repository <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {canManage && (
              <div className="flex gap-2">
                {viewing.status !== 'approved' && (
                  <button
                    type="button"
                    disabled={busyId === viewing.id}
                    onClick={() => void review(viewing, 'approved')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                )}
                {viewing.status !== 'rejected' && (
                  <button
                    type="button"
                    disabled={busyId === viewing.id}
                    onClick={() => void review(viewing, 'rejected')}
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

      <ConfirmModal
        open={!!deleting}
        title={`Delete "${deleting?.title ?? ''}"?`}
        description={
          deleting && deleting.screenshots.length > 0
            ? `This removes the project and its ${deleting.screenshots.length} screenshot${
                deleting.screenshots.length === 1 ? '' : 's'
              } from storage. It cannot be undone — reject it instead if you only want it off the public showcase.`
            : 'This removes the project for good. It cannot be undone — reject it instead if you only want it off the public showcase.'
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
