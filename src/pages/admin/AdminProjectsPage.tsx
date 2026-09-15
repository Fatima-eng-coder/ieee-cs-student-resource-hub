import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ExternalLink, Eye, Loader2, Pencil, Trash2, X } from 'lucide-react';
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
  type ProjectEdit,
  type ProjectStatus,
} from '@/services/projectsService';

type QueueFilter = 'pending' | 'approved' | 'rejected' | 'all';

const filters: { key: QueueFilter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const editInput =
  'w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-ieee-orange focus:ring-2 focus:ring-ieee-orange/20 placeholder:text-slate-400';

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
  /**
   * null until the first read answers, which is NOT the same as an empty queue.
   *
   * Seeded as [], the table rendered its empty state on the first paint -- "Nothing waiting for
   * review / Every project that has been submitted has already been decided on" -- so a reviewer
   * on slow wifi read a confident, false statement for the length of the round trip. This page's
   * own comment forbids exactly that, and the public showcase already holds a skeleton for the
   * same reason.
   */
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QueueFilter>('pending');
  const [viewing, setViewing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /** Non-null while the drawer is in edit mode. The read-only detail is the default. */
  const [editing, setEditing] = useState<ProjectEdit | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
    () => (projects ?? []).filter((project) => project.status === 'pending').length,
    [projects]
  );

  /** null while the first read is still out, so the table can hold instead of asserting. */
  const rows = useMemo(() => {
    if (projects === null) return null;
    return filter === 'all' ? projects : projects.filter((project) => project.status === filter);
  }, [projects, filter]);

  const review = async (project: Project, decision: ProjectDecision) => {
    setBusyId(project.id);
    setError('');
    setNotice('');
    try {
      const updated = await projectsService.review(project.id, decision);
      setProjects((current) => (current ?? []).map((row) => (row.id === updated.id ? updated : row)));
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
      const { screenshotsRemoved, screenshotsExpected } = await projectsService.remove(target.id);
      setProjects((current) => (current ?? []).filter((row) => row.id !== target.id));
      setViewing((current) => (current?.id === target.id ? null : current));

      // Worded on what the bucket actually did, not on what was asked of it. This used to claim
      // "and its screenshots were deleted" unconditionally — including for a project that had
      // none, and including when Storage silently removed nothing because the policy declined.
      // The row is gone either way; that half is never in doubt and is said plainly.
      setNotice(
        screenshotsExpected === 0
          ? `"${target.title}" was deleted.`
          : screenshotsRemoved === screenshotsExpected
            ? `"${target.title}" and its ${screenshotsExpected === 1 ? 'screenshot' : `${screenshotsExpected} screenshots`} were deleted.`
            : `"${target.title}" was deleted, but ${screenshotsExpected - screenshotsRemoved} of its ${screenshotsExpected} screenshots could not be removed from storage.`
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That project could not be deleted.');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Creators and tech stack are stored as arrays of short strings and edited here as one
   * comma-separated line each. A row of add/remove inputs would be the richer control, but this
   * is a correction screen -- somebody fixing a spelling, not composing a submission -- and a
   * line you can retype in full is faster for that than five boxes with X buttons.
   */
  const asList = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean);

  const openEditor = (project: Project) => {
    setEditing({
      title: project.title,
      tagline: project.tagline,
      description: project.description,
      creators: project.creators,
      techStack: project.techStack,
      category: project.category ?? '',
      githubUrl: project.githubUrl ?? '',
      demoUrl: project.demoUrl ?? '',
      authorName: project.authorName,
      // Everything kept by default: opening the editor must not be a way to lose a screenshot.
      keepScreenshots: project.screenshots.map((_url, index) => index),
    });
  };

  const saveEdit = async () => {
    if (!viewing || !editing) return;
    setSavingEdit(true);
    setError('');
    try {
      const saved = await projectsService.update(viewing.id, editing);
      setProjects((current) => (current ?? []).map((row) => (row.id === saved.id ? saved : row)));
      // The drawer stays open on the saved row rather than closing: a correction is usually one
      // of several, and closing would make the reviewer find the project again for each one.
      setViewing(saved);
      setEditing(null);
      setNotice('Project updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That project could not be updated.');
    } finally {
      setSavingEdit(false);
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

        {rows === null ? (
          // Deliberately says nothing about what is in the queue. The empty state below is a
          // statement of fact -- "everything has been decided" -- and it must not be made
          // before anyone has looked.
          <div className="h-64 animate-pulse rounded-2xl border border-black/5 bg-white" />
        ) : (
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
              : filter === 'pending' && !canManage
                ? 'Not visible to your role'
                : filter === 'pending'
                ? 'Nothing waiting for review'
                : 'No projects here'
          }
          emptyMessage={
            error
              ? 'Nothing below counts as the queue — the read failed, so an empty table here would be a guess.'
              : filter === 'pending' && !canManage
                // Without this the page contradicts itself: the banner above tells a non-manager
                // that pending rows are hidden from their role, and this line then asserts there
                // are none. listForReview() returns them no pending rows either way, so an empty
                // table here says nothing about the queue.
                ? 'Pending submissions are only visible to content managers, so this list is empty for your role.'
              : filter === 'pending'
              ? 'Every project that has been submitted has already been decided on.'
              : filter === 'approved'
                ? 'No project has been approved onto the public showcase yet.'
                : filter === 'rejected'
                  ? 'No project has been turned down.'
                  : 'No student has submitted a project yet.'
          }
        />
        )}
      </div>

      <AdminEditDrawer
        open={!!viewing}
        title={viewing?.title ?? 'Project'}
        subtitle={viewing ? statusHint[viewing.status] : undefined}
        onClose={() => {
          // A half-rewritten description must not be lost to a click a few pixels left of the
          // panel. The drawer's backdrop closes it, and in edit mode that is the one destructive
          // path nobody aims at -- Cancel, which people do aim at, only leaves edit mode. While
          // an edit is open the backdrop drops back to Cancel's behaviour.
          if (editing) {
            setEditing(null);
            return;
          }
          setViewing(null);
        }}
      >
        {viewing && editing && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-ieee-orange/30 bg-ieee-orange/5 p-3 text-xs text-slate-600">
              Correcting what the student submitted. Screenshots can be removed here but not
              replaced &mdash; only the author can upload new ones.
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Title</span>
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className={editInput}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700">One-line summary</span>
              <input
                value={editing.tagline}
                onChange={(e) => setEditing({ ...editing, tagline: e.target.value })}
                className={editInput}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Description</span>
              <textarea
                rows={5}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className={`${editInput} min-h-28 resize-y`}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Category</span>
                <input
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  placeholder="e.g. Web App"
                  className={editInput}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Submitted by</span>
                <input
                  value={editing.authorName}
                  onChange={(e) => setEditing({ ...editing, authorName: e.target.value })}
                  className={editInput}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Built by</span>
              <input
                value={editing.creators.join(', ')}
                onChange={(e) => setEditing({ ...editing, creators: asList(e.target.value) })}
                className={editInput}
              />
              <span className="text-xs text-slate-400">Separate names with commas.</span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Tech stack</span>
              <input
                value={editing.techStack.join(', ')}
                onChange={(e) => setEditing({ ...editing, techStack: asList(e.target.value) })}
                className={editInput}
              />
              <span className="text-xs text-slate-400">Separate with commas.</span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Repository link</span>
                <input
                  value={editing.githubUrl}
                  onChange={(e) => setEditing({ ...editing, githubUrl: e.target.value })}
                  placeholder="https://github.com/..."
                  className={editInput}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Live demo link</span>
                <input
                  value={editing.demoUrl}
                  onChange={(e) => setEditing({ ...editing, demoUrl: e.target.value })}
                  placeholder="https://..."
                  className={editInput}
                />
              </label>
            </div>

            {viewing.screenshots.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-slate-700">Screenshots</p>
                <p className="mb-2 text-xs text-slate-400">
                  Untick one to remove it. The file is deleted from storage when you save, so it
                  cannot be brought back.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {viewing.screenshots.map((screenshot, index) => {
                    const kept = editing.keepScreenshots.includes(index);
                    return (
                      <label
                        key={screenshot}
                        className={`relative block cursor-pointer overflow-hidden rounded-xl border-2 transition ${
                          kept ? 'border-ieee-orange/50' : 'border-transparent opacity-40 grayscale'
                        }`}
                      >
                        <img
                          src={screenshot}
                          alt={`Screenshot ${index + 1}`}
                          className="h-28 w-full object-cover"
                        />
                        <input
                          type="checkbox"
                          checked={kept}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              keepScreenshots: e.target.checked
                                ? [...editing.keepScreenshots, index].sort((a, b) => a - b)
                                : editing.keepScreenshots.filter((i) => i !== index),
                            })
                          }
                          className="absolute left-2 top-2 h-4 w-4 accent-ieee-orange"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2 border-t border-black/5 pt-3">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => void saveEdit()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-70"
              >
                {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => setEditing(null)}
                className="rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-70"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {viewing && !editing && (
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
              <button
                type="button"
                onClick={() => openEditor(viewing)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-ieee-orange/30 px-4 py-2.5 text-sm font-semibold text-ieee-orange transition hover:bg-ieee-orange/5"
              >
                <Pencil className="h-4 w-4" /> Edit details
              </button>
            )}

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
