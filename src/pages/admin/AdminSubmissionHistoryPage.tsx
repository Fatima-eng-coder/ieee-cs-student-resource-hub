import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import ConfirmModal from '@/components/ui/ConfirmModal';
import StatusBadge from '@/components/ui/StatusBadge';
import { adminAuthService } from '@/services/adminAuthService';
import {
  courseResourceSubmissionsService,
  type CourseResourceSubmission,
} from '@/services/courseResourceSubmissionsService';
import { facultySuggestionService, type FacultySuggestion } from '@/services/facultySuggestionService';
import { paperRequestsService, type PaperRequest } from '@/services/paperRequestsService';

type HistoryParentFilter = 'all' | 'paper-request' | 'course-resource' | 'teacher-suggestion';
type HistoryStatusFilter = 'all' | 'approved' | 'rejected' | 'fulfilled' | 'noted';
type ReviewedStatus = Exclude<HistoryStatusFilter, 'all'>;

type HistoryRow =
  | {
      id: string;
      source: 'paper-request';
      type: 'Paper Request';
      summary: string;
      course: string;
      submittedBy: string;
      submittedAt: string;
      reviewedAt: string;
      status: ReviewedStatus;
      data: Record<string, string>;
      request: PaperRequest;
    }
  | {
      id: string;
      source: 'course-resource';
      type: 'Course Resource';
      summary: string;
      course: string;
      submittedBy: string;
      submittedAt: string;
      reviewedAt: string;
      status: ReviewedStatus;
      data: Record<string, string>;
      resourceSubmission: CourseResourceSubmission;
    }
  | {
      id: string;
      source: 'teacher-suggestion';
      type: 'Teacher Info';
      summary: string;
      course: string;
      submittedBy: string;
      submittedAt: string;
      reviewedAt: string;
      status: ReviewedStatus;
      data: Record<string, string>;
      facultySuggestion: FacultySuggestion;
    };

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';

const parentFilters: Array<{ value: HistoryParentFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'paper-request', label: 'Paper Request' },
  { value: 'course-resource', label: 'Course Resource' },
  { value: 'teacher-suggestion', label: 'Teacher Info' },
];

const statusFilters: Array<{ value: HistoryStatusFilter; label: string }> = [
  { value: 'all', label: 'All Reviewed' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'noted', label: 'Noted' },
];

const formatTitle = (value: string) =>
  value
    .replace(/_/g, ' ')
    .split(/[\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const dateOnly = (value?: string | null) => (value ? value.slice(0, 10) : '-');

const requester = (name?: string | null, email?: string | null, fallback = 'Guest') =>
  [name, email].filter(Boolean).join(' - ') || fallback;

function paperRequestToHistory(request: PaperRequest): HistoryRow | null {
  if (!['noted', 'fulfilled', 'rejected'].includes(request.status)) return null;

  return {
    id: `paper-request:${request.id}`,
    source: 'paper-request',
    type: 'Paper Request',
    summary: `${formatTitle(request.materialType)} - ${request.session} ${request.year}`,
    course: [request.courseCode, request.courseName].filter(Boolean).join(' - '),
    submittedBy: requester(request.requesterName, request.requesterEmail, 'Guest request'),
    submittedAt: dateOnly(request.createdAt),
    reviewedAt: dateOnly(request.reviewedAt),
    status: request.status as ReviewedStatus,
    request,
    data: {
      courseCode: request.courseCode,
      courseName: request.courseName || 'Not provided',
      materialType: formatTitle(request.materialType),
      session: `${request.session} ${request.year}`,
      requesterName: request.requesterName || 'Not provided',
      requesterEmail: request.requesterEmail || 'Not provided',
      notes: request.notes || 'No notes provided',
      submittedDate: dateOnly(request.createdAt),
      reviewedDate: dateOnly(request.reviewedAt),
      status: request.status,
    },
  };
}

function courseResourceToHistory(resourceSubmission: CourseResourceSubmission): HistoryRow | null {
  if (!['approved', 'rejected'].includes(resourceSubmission.status)) return null;

  return {
    id: `course-resource:${resourceSubmission.id}`,
    source: 'course-resource',
    type: 'Course Resource',
    summary: formatTitle(resourceSubmission.resourceType),
    course: [resourceSubmission.courseCode, resourceSubmission.courseName].filter(Boolean).join(' - '),
    submittedBy: requester(resourceSubmission.requesterName, resourceSubmission.requesterEmail, 'Guest submission'),
    submittedAt: dateOnly(resourceSubmission.createdAt),
    reviewedAt: dateOnly(resourceSubmission.reviewedAt),
    status: resourceSubmission.status as ReviewedStatus,
    resourceSubmission,
    data: {
      courseCode: resourceSubmission.courseCode,
      courseName: resourceSubmission.courseName || 'Not provided',
      resourceType: formatTitle(resourceSubmission.resourceType),
      suggestedTitle: resourceSubmission.suggestedTitle || 'Not provided',
      suggestedValue: resourceSubmission.suggestedValue || 'Not provided',
      file: resourceSubmission.fileUrl || 'No file attached',
      notes: resourceSubmission.notes || 'No notes provided',
      requesterEmail: resourceSubmission.requesterEmail || 'Not provided',
      submittedDate: dateOnly(resourceSubmission.createdAt),
      reviewedDate: dateOnly(resourceSubmission.reviewedAt),
      status: resourceSubmission.status,
    },
  };
}

function facultySuggestionToHistory(facultySuggestion: FacultySuggestion): HistoryRow | null {
  if (!['approved', 'rejected'].includes(facultySuggestion.status)) return null;

  return {
    id: `teacher-suggestion:${facultySuggestion.id}`,
    source: 'teacher-suggestion',
    type: 'Teacher Info',
    summary: `${formatTitle(facultySuggestion.suggestionType)} - ${facultySuggestion.teacherName}`,
    course: [facultySuggestion.courseCode, facultySuggestion.courseName].filter(Boolean).join(' - ') || '-',
    submittedBy: requester(facultySuggestion.requesterName, facultySuggestion.requesterEmail, 'Guest suggestion'),
    submittedAt: dateOnly(facultySuggestion.createdAt),
    reviewedAt: dateOnly(facultySuggestion.reviewedAt),
    status: facultySuggestion.status as ReviewedStatus,
    facultySuggestion,
    data: {
      suggestionType: formatTitle(facultySuggestion.suggestionType),
      teacherName: facultySuggestion.teacherName,
      email: facultySuggestion.email || 'Not provided',
      department: facultySuggestion.department || 'Not provided',
      designation: facultySuggestion.designation || 'Not provided',
      office: facultySuggestion.office || 'Not provided',
      course: [facultySuggestion.courseCode, facultySuggestion.courseName].filter(Boolean).join(' - ') || 'Not provided',
      notes: facultySuggestion.notes || 'No notes provided',
      requesterEmail: facultySuggestion.requesterEmail || 'Not provided',
      submittedDate: dateOnly(facultySuggestion.createdAt),
      reviewedDate: dateOnly(facultySuggestion.reviewedAt),
      status: facultySuggestion.status,
    },
  };
}

export default function AdminSubmissionHistoryPage() {
  const [paperRequests, setPaperRequests] = useState<PaperRequest[]>([]);
  const [courseResources, setCourseResources] = useState<CourseResourceSubmission[]>([]);
  const [facultySuggestions, setFacultySuggestions] = useState<FacultySuggestion[]>([]);
  const [parentFilter, setParentFilter] = useState<HistoryParentFilter>('all');
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('all');
  const [viewing, setViewing] = useState<HistoryRow | null>(null);
  const [deleting, setDeleting] = useState<HistoryRow | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const loadHistory = async () => {
    if (!canManage) return;

    try {
      const [requests, resources, suggestions] = await Promise.all([
        paperRequestsService.listForAdmin(),
        courseResourceSubmissionsService.listForAdmin(),
        facultySuggestionService.listForAdmin(),
      ]);
      setPaperRequests(requests);
      setCourseResources(resources);
      setFacultySuggestions(suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reviewed submission history could not be loaded right now.');
    }
  };

  useEffect(() => {
    if (!canManage) return undefined;

    const refreshQuietly = () => void loadHistory();
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshQuietly();
    };
    const unsubscribes = [
      paperRequestsService.subscribe(refreshQuietly),
      courseResourceSubmissionsService.subscribe(refreshQuietly),
      facultySuggestionService.subscribe(refreshQuietly),
    ];

    void loadHistory();
    window.addEventListener('focus', refreshQuietly);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      window.removeEventListener('focus', refreshQuietly);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const rows = useMemo(() => {
    const mapped = [
      ...paperRequests.map(paperRequestToHistory),
      ...courseResources.map(courseResourceToHistory),
      ...facultySuggestions.map(facultySuggestionToHistory),
    ].filter((row): row is HistoryRow => Boolean(row));

    return mapped
      .filter((row) => parentFilter === 'all' || row.source === parentFilter)
      .filter((row) => statusFilter === 'all' || row.status === statusFilter)
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt) || b.submittedAt.localeCompare(a.submittedAt));
  }, [courseResources, facultySuggestions, paperRequests, parentFilter, statusFilter]);

  const deleteRow = async (row: HistoryRow) => {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      if (row.source === 'paper-request') await paperRequestsService.deleteReviewed(row.request.id);
      if (row.source === 'course-resource') await courseResourceSubmissionsService.deleteReviewed(row.resourceSubmission.id);
      if (row.source === 'teacher-suggestion') await facultySuggestionService.deleteReviewed(row.facultySuggestion.id);

      setDeleting(null);
      setViewing((current) => (current?.id === row.id ? null : current));
      setNotice('Reviewed submission record deleted.');
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reviewed submission record could not be deleted.');
    } finally {
      setSaving(false);
    }
  };

  const clearRows = async () => {
    const paperIds = rows.filter((row) => row.source === 'paper-request').map((row) => row.request.id);
    const resourceIds = rows.filter((row) => row.source === 'course-resource').map((row) => row.resourceSubmission.id);
    const suggestionIds = rows.filter((row) => row.source === 'teacher-suggestion').map((row) => row.facultySuggestion.id);

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await Promise.all([
        paperRequestsService.deleteReviewedMany(paperIds),
        courseResourceSubmissionsService.deleteReviewedMany(resourceIds),
        facultySuggestionService.deleteReviewedMany(suggestionIds),
      ]);

      setClearing(false);
      setViewing(null);
      setNotice('Reviewed submission history cleared for the selected filters.');
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reviewed submission history could not be cleared.');
    } finally {
      setSaving(false);
    }
  };

  const columns: AdminTableColumn<HistoryRow>[] = [
    {
      key: 'type',
      header: 'Type',
      sortValue: (row) => row.type,
      render: (row) => <span className="font-medium text-slate-900">{row.type}</span>,
    },
    {
      key: 'summary',
      header: 'Summary',
      sortValue: (row) => row.summary,
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.summary}</p>
          <p className="mt-0.5 text-xs text-slate-500">{row.course || '-'}</p>
        </div>
      ),
    },
    { key: 'submittedBy', header: 'Submitted By', sortValue: (row) => row.submittedBy, render: (row) => row.submittedBy },
    { key: 'submittedAt', header: 'Submitted', sortValue: (row) => row.submittedAt, render: (row) => row.submittedAt },
    { key: 'reviewedAt', header: 'Reviewed', sortValue: (row) => row.reviewedAt, render: (row) => row.reviewedAt },
    { key: 'status', header: 'Status', sortValue: (row) => row.status, render: (row) => <StatusBadge status={row.status} /> },
    {
      key: '__actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button type="button" onClick={() => setViewing(row)} className={actionBtn}>
            <Eye className="h-3.5 w-3.5" /> View
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setDeleting(row)}
            className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-70"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <AdminTopbar
        title="Submission History"
        subtitle={`${rows.length} reviewed records`}
        action={
          <Link
            to="/portal/submissions"
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-ieee-orange/40 hover:text-ieee-orange"
          >
            <ArrowLeft className="h-4 w-4" />
            Pending Queue
          </Link>
        }
      />

      <div className="p-4 sm:p-6">
        {!canManage ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Only content managers can view reviewed submission history.
          </div>
        ) : (
          <>
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

            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {parentFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setParentFilter(filter.value)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                      parentFilter === filter.value
                        ? 'bg-ieee-orange text-white shadow-sm'
                        : 'border border-black/10 bg-white text-slate-600 hover:border-ieee-orange/40'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {statusFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                      statusFilter === filter.value
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'border border-black/10 bg-white text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={saving || rows.length === 0}
                  onClick={() => setClearing(true)}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                >
                  Clear History
                </button>
              </div>
            </div>

            <AdminTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              searchable={(row) =>
                `${row.type} ${row.summary} ${row.course} ${row.submittedBy} ${row.status} ${Object.values(row.data).join(' ')}`
              }
              emptyTitle="No reviewed submissions"
              emptyMessage="No reviewed submission records match the selected filters."
            />
          </>
        )}
      </div>

      <AdminEditDrawer open={!!viewing} title="Submission Details" onClose={() => setViewing(null)}>
        {viewing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold uppercase tracking-wide text-ieee-orange">
                {viewing.type}
              </span>
              <StatusBadge status={viewing.status} />
            </div>
            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Submitted By</p>
              <p className="mt-0.5 font-semibold text-slate-800">{viewing.submittedBy}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Reviewed Date</p>
              <p className="mt-0.5 text-sm text-slate-700">{viewing.reviewedAt}</p>
            </div>
            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-slate-400">Submitted Data</p>
              <dl className="flex flex-col gap-3">
                {Object.entries(viewing.data).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs font-semibold capitalize text-slate-500">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </dt>
                    <dd className="mt-0.5 break-words text-sm text-slate-800">
                      {key === 'file' && value.startsWith('http') ? (
                        <a
                          href={value}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-ieee-orange hover:underline"
                        >
                          Open file
                        </a>
                      ) : (
                        value || <span className="text-slate-300">-</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </motion.div>
        )}
      </AdminEditDrawer>

      <ConfirmModal
        open={!!deleting}
        title="Delete this history record?"
        description="This removes the reviewed submission record only. It will not undo any approved course or faculty changes."
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && void deleteRow(deleting)}
      />

      <ConfirmModal
        open={clearing}
        title="Clear selected history?"
        description="This removes reviewed submission records only. Pending submissions will remain in the review queue."
        confirmLabel={saving ? 'Clearing...' : 'Clear History'}
        danger
        onCancel={() => setClearing(false)}
        onConfirm={() => void clearRows()}
      />
    </div>
  );
}
