import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ExternalLink, Eye, History, SearchCheck, X } from 'lucide-react';
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
  type CourseResourceSubmissionStatus,
} from '@/services/courseResourceSubmissionsService';
import {
  facultySuggestionService,
  type FacultySuggestion,
  type FacultySuggestionDuplicateResult,
  type FacultySuggestionStatus,
} from '@/services/facultySuggestionService';
import { paperRequestsService, type PaperRequest, type PaperRequestStatus } from '@/services/paperRequestsService';
import type { Submission } from '@/types';

type ReviewSubmission =
  | (Submission & { source: 'paper-request'; request: PaperRequest; paper?: never })
  | (Submission & { source: 'course-resource'; resourceSubmission: CourseResourceSubmission; paper?: never })
  | (Submission & { source: 'teacher-suggestion'; facultySuggestion: FacultySuggestion; paper?: never });
type PaperRequestReviewSubmission = Extract<ReviewSubmission, { source: 'paper-request' }>;
type CourseResourceReviewSubmission = Extract<ReviewSubmission, { source: 'course-resource' }>;
type FacultySuggestionReviewSubmission = Extract<ReviewSubmission, { source: 'teacher-suggestion' }>;

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';

function paperRequestToSubmission(request: PaperRequest): PaperRequestReviewSubmission {
  const requester = [request.requesterName, request.requesterEmail].filter(Boolean).join(' - ');

  return {
    id: `paper-request:${request.id}`,
    type: 'paper-request',
    submittedBy: requester || 'Guest request',
    submittedAt: request.createdAt.slice(0, 10),
    status: request.status === 'pending' ? 'pending' : request.status === 'rejected' ? 'rejected' : 'approved',
    source: 'paper-request',
    request,
    data: {
      course: [request.courseCode, request.courseName].filter(Boolean).join(' - '),
      materialType: formatMaterialType(request.materialType),
      session: `${request.session} ${request.year}`,
      requesterName: request.requesterName || 'Not provided',
      requesterEmail: request.requesterEmail || 'Not provided',
      notes: request.notes || 'No notes provided',
      requestStatus: request.status,
    },
  };
}

function courseResourceToSubmission(resourceSubmission: CourseResourceSubmission): CourseResourceReviewSubmission {
  const requester = [resourceSubmission.requesterName, resourceSubmission.requesterEmail].filter(Boolean).join(' - ');

  return {
    id: `course-resource:${resourceSubmission.id}`,
    type: 'course-resource',
    submittedBy: requester || 'Guest submission',
    submittedAt: resourceSubmission.createdAt.slice(0, 10),
    status: resourceSubmission.status,
    source: 'course-resource',
    resourceSubmission,
    data: {
      courseCode: resourceSubmission.courseCode,
      courseName: resourceSubmission.courseName || 'Not provided',
      resourceType: formatMaterialType(resourceSubmission.resourceType),
      suggestedTitle: resourceSubmission.suggestedTitle || 'Not provided',
      suggestedValue: resourceSubmission.suggestedValue || 'Not provided',
      file: resourceSubmission.fileUrl || 'No file attached',
      notes: resourceSubmission.notes || 'No notes provided',
      requesterEmail: resourceSubmission.requesterEmail || 'Not provided',
      submissionStatus: resourceSubmission.status,
    },
  };
}

function facultySuggestionToSubmission(facultySuggestion: FacultySuggestion): FacultySuggestionReviewSubmission {
  const requester = [facultySuggestion.requesterName, facultySuggestion.requesterEmail].filter(Boolean).join(' - ');

  return {
    id: `teacher-suggestion:${facultySuggestion.id}`,
    type: 'teacher-suggestion',
    submittedBy: requester || 'Guest suggestion',
    submittedAt: facultySuggestion.createdAt.slice(0, 10),
    status: facultySuggestion.status,
    source: 'teacher-suggestion',
    facultySuggestion,
    data: {
      suggestionType: formatMaterialType(facultySuggestion.suggestionType),
      teacherName: facultySuggestion.teacherName,
      email: facultySuggestion.email || 'Not provided',
      department: facultySuggestion.department || 'Not provided',
      designation: facultySuggestion.designation || 'Not provided',
      office: facultySuggestion.office || 'Not provided',
      course: [facultySuggestion.courseCode, facultySuggestion.courseName].filter(Boolean).join(' - ') || 'Not provided',
      notes: facultySuggestion.notes || 'No notes provided',
      requesterEmail: facultySuggestion.requesterEmail || 'Not provided',
      submissionStatus: facultySuggestion.status,
    },
  };
}

const typeLabel = (type: Submission['type']) =>
  type
    .replace(/-/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const formatMaterialType = (type: string) =>
  type
    .replace(/_/g, ' ')
    .split(/[\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const displayStatus = (submission: ReviewSubmission) => {
  if (submission.source === 'paper-request') return submission.request.status;
  if (submission.source === 'course-resource') return submission.resourceSubmission.status;
  return submission.facultySuggestion.status;
};

const submissionTitle = (submission: ReviewSubmission) => {
  if (submission.source === 'paper-request') {
    return [submission.request.courseCode, submission.request.courseName].filter(Boolean).join(' - ');
  }
  if (submission.source === 'course-resource') return formatMaterialType(submission.resourceSubmission.resourceType);
  return submission.facultySuggestion.teacherName;
};

const submissionMaterial = (submission: ReviewSubmission) => {
  if (submission.source === 'paper-request') {
    return `${formatMaterialType(submission.request.materialType)} - ${submission.request.session} ${submission.request.year}`;
  }
  if (submission.source === 'course-resource') {
    return [submission.resourceSubmission.courseCode, submission.resourceSubmission.courseName].filter(Boolean).join(' - ');
  }
  if (submission.source === 'teacher-suggestion') {
    const suggestion = submission.facultySuggestion;
    const course = [suggestion.courseCode, suggestion.courseName].filter(Boolean).join(' - ');
    return course
      ? `${formatMaterialType(suggestion.suggestionType)} - ${course}`
      : formatMaterialType(suggestion.suggestionType);
  }
};

const submissionNotes = (submission: ReviewSubmission) => {
  if (submission.source === 'paper-request') return submission.request.notes || '-';
  if (submission.source === 'course-resource') {
    return submission.resourceSubmission.notes || submission.resourceSubmission.suggestedValue || '-';
  }
  return submission.facultySuggestion.notes || '-';
};

const isPendingSubmission = (submission: ReviewSubmission) => displayStatus(submission) === 'pending';

export default function AdminSubmissionsPage() {
  const [paperRequestSubmissions, setPaperRequestSubmissions] = useState<PaperRequestReviewSubmission[]>([]);
  const [courseResourceSubmissions, setCourseResourceSubmissions] = useState<CourseResourceReviewSubmission[]>([]);
  const [facultySuggestionSubmissions, setFacultySuggestionSubmissions] = useState<FacultySuggestionReviewSubmission[]>([]);
  const [filter, setFilter] = useState<'all' | Submission['type']>('all');
  const [viewing, setViewing] = useState<ReviewSubmission | null>(null);
  const [rejecting, setRejecting] = useState<ReviewSubmission | null>(null);
  const [reviewingCourseResource, setReviewingCourseResource] = useState<{
    submission: CourseResourceReviewSubmission;
    status: Extract<CourseResourceSubmissionStatus, 'approved' | 'rejected'>;
  } | null>(null);
  const [reviewingFacultySuggestion, setReviewingFacultySuggestion] = useState<{
    submission: FacultySuggestionReviewSubmission;
    status: Extract<FacultySuggestionStatus, 'approved' | 'rejected'>;
  } | null>(null);
  const [duplicateFacultySuggestionReview, setDuplicateFacultySuggestionReview] = useState<{
    submission: FacultySuggestionReviewSubmission;
    duplicate: FacultySuggestionDuplicateResult['duplicate'];
    match: FacultySuggestionDuplicateResult['match'];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = adminAuthService.canManageContent();

  useEffect(() => {
    let ignore = false;

    const loadPaperRequests = async () => {
      try {
        const requests = await paperRequestsService.listForAdmin();
        if (!ignore) setPaperRequestSubmissions(requests.map(paperRequestToSubmission));
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load paper requests.');
      }
    };

    const refreshQuietly = () => void loadPaperRequests();
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshQuietly();
    };
    const unsubscribe = paperRequestsService.subscribe(refreshQuietly);

    void loadPaperRequests();
    window.addEventListener('focus', refreshQuietly);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      ignore = true;
      unsubscribe();
      window.removeEventListener('focus', refreshQuietly);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadCourseResourceSubmissions = async () => {
      try {
        const resourceSubmissions = await courseResourceSubmissionsService.listForAdmin();
        if (!ignore) setCourseResourceSubmissions(resourceSubmissions.map(courseResourceToSubmission));
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : 'Failed to load course resource submissions.'
          );
        }
      }
    };

    const refreshQuietly = () => void loadCourseResourceSubmissions();
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshQuietly();
    };
    const unsubscribe = courseResourceSubmissionsService.subscribe(refreshQuietly);

    void loadCourseResourceSubmissions();
    window.addEventListener('focus', refreshQuietly);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      ignore = true;
      unsubscribe();
      window.removeEventListener('focus', refreshQuietly);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadFacultySuggestions = async () => {
      try {
        const suggestions = await facultySuggestionService.listForAdmin();
        if (!ignore) setFacultySuggestionSubmissions(suggestions.map(facultySuggestionToSubmission));
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : 'Failed to load teacher info suggestions.'
          );
        }
      }
    };

    const refreshQuietly = () => void loadFacultySuggestions();
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshQuietly();
    };
    const unsubscribe = facultySuggestionService.subscribe(refreshQuietly);

    void loadFacultySuggestions();
    window.addEventListener('focus', refreshQuietly);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      ignore = true;
      unsubscribe();
      window.removeEventListener('focus', refreshQuietly);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const submissions: ReviewSubmission[] = [
    ...paperRequestSubmissions,
    ...courseResourceSubmissions,
    ...facultySuggestionSubmissions,
  ].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const updatePaperRequestSubmission = (request: PaperRequest) => {
    const updated = paperRequestToSubmission(request);
    setPaperRequestSubmissions((items) =>
      items.map((item) => (item.request.id === request.id ? updated : item))
    );
    setViewing((current) =>
      current?.source === 'paper-request' && current.request.id === request.id ? updated : current
    );
  };

  const updateCourseResourceSubmission = (resourceSubmission: CourseResourceSubmission) => {
    const updated = courseResourceToSubmission(resourceSubmission);
    setCourseResourceSubmissions((items) =>
      items.map((item) => (item.resourceSubmission.id === resourceSubmission.id ? updated : item))
    );
    setViewing((current) =>
      current?.source === 'course-resource' && current.resourceSubmission.id === resourceSubmission.id
        ? updated
        : current
    );
  };

  const removeCourseResourceSubmission = (submissionId: string) => {
    setCourseResourceSubmissions((items) =>
      items.filter((item) => item.resourceSubmission.id !== submissionId)
    );
    setViewing((current) =>
      current?.source === 'course-resource' && current.resourceSubmission.id === submissionId ? null : current
    );
  };

  const updateFacultySuggestionSubmission = (facultySuggestion: FacultySuggestion) => {
    const updated = facultySuggestionToSubmission(facultySuggestion);
    setFacultySuggestionSubmissions((items) =>
      items.map((item) => (item.facultySuggestion.id === facultySuggestion.id ? updated : item))
    );
    setViewing((current) =>
      current?.source === 'teacher-suggestion' && current.facultySuggestion.id === facultySuggestion.id
        ? updated
        : current
    );
  };

  const updatePaperRequestStatus = async (submission: PaperRequestReviewSubmission, status: PaperRequestStatus) => {
    if (!canManage) {
      setError('Only content managers can manage paper requests.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await paperRequestsService.updateStatus(submission.request.id, status);
      updatePaperRequestSubmission(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update paper request.');
    } finally {
      setSaving(false);
    }
  };

  const requestCourseResourceReview = (
    submission: CourseResourceReviewSubmission,
    status: Extract<CourseResourceSubmissionStatus, 'approved' | 'rejected'>
  ) => {
    if (!canManage) {
      setError('You do not have permission to review course resource submissions.');
      return;
    }

    setError(null);
    setWarning(null);
    setNotice(null);
    setReviewingCourseResource({ submission, status });
  };

  const confirmCourseResourceReview = async () => {
    if (!reviewingCourseResource) return;

    setSaving(true);
    setError(null);
    setWarning(null);
    setNotice(null);
    try {
      const result =
        reviewingCourseResource.status === 'approved'
          ? await courseResourceSubmissionsService.approve(reviewingCourseResource.submission.resourceSubmission)
          : await courseResourceSubmissionsService.reject(reviewingCourseResource.submission.resourceSubmission);

      if (result.submission) updateCourseResourceSubmission(result.submission);
      if (result.deletedId) removeCourseResourceSubmission(result.deletedId);
      setViewing((current) =>
        current?.id === reviewingCourseResource.submission.id ? null : current
      );
      setReviewingCourseResource(null);
      if (result.warning) setWarning(result.warning);
      setNotice(
        reviewingCourseResource.status === 'approved'
          ? result.submission && ['cdf', 'lab_manual', 'useful_link', 'description'].includes(result.submission.resourceType)
            ? 'Course resource submission approved and the course page data was updated.'
            : 'Course resource submission approved for review records.'
          : 'Course resource submission rejected and moved to history.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review course resource submission.');
    } finally {
      setSaving(false);
    }
  };

  const requestFacultySuggestionReview = async (
    submission: FacultySuggestionReviewSubmission,
    status: Extract<FacultySuggestionStatus, 'approved' | 'rejected'>
  ) => {
    if (!canManage) {
      setError('You do not have permission to review teacher info suggestions.');
      return;
    }

    setError(null);
    setWarning(null);
    setNotice(null);

    if (status === 'approved') {
      setSaving(true);
      try {
        const duplicate = await facultySuggestionService.findApprovalDuplicate(submission.facultySuggestion);
        if (duplicate.exists) {
          setDuplicateFacultySuggestionReview({
            submission,
            duplicate: duplicate.duplicate,
            match: duplicate.match,
          });
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check teacher duplicates.');
        return;
      } finally {
        setSaving(false);
      }
    }

    setReviewingFacultySuggestion({ submission, status });
  };

  const approveFacultySuggestion = async (
    submission: FacultySuggestionReviewSubmission,
    options: { allowDuplicate?: boolean } = {}
  ) => {
    const result = await facultySuggestionService.approve(submission.facultySuggestion, options);
    updateFacultySuggestionSubmission(result.suggestion);
    setViewing((current) => (current?.id === submission.id ? null : current));
    setNotice('Teacher info suggestion approved and the faculty directory was updated.');
  };

  const confirmFacultySuggestionReview = async () => {
    if (!reviewingFacultySuggestion) return;

    setSaving(true);
    setError(null);
    setWarning(null);
    setNotice(null);
    try {
      if (reviewingFacultySuggestion.status === 'approved') {
        await approveFacultySuggestion(reviewingFacultySuggestion.submission);
      } else {
        const result = await facultySuggestionService.reject(reviewingFacultySuggestion.submission.facultySuggestion);
        updateFacultySuggestionSubmission(result.suggestion);
        setViewing((current) =>
          current?.id === reviewingFacultySuggestion.submission.id ? null : current
        );
        setNotice('Teacher info suggestion rejected.');
      }
      setReviewingFacultySuggestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review teacher info suggestion.');
    } finally {
      setSaving(false);
    }
  };

  const approveDuplicateFacultySuggestion = async () => {
    if (!duplicateFacultySuggestionReview) return;

    setSaving(true);
    setError(null);
    setWarning(null);
    setNotice(null);
    try {
      await approveFacultySuggestion(duplicateFacultySuggestionReview.submission, { allowDuplicate: true });
      setDuplicateFacultySuggestionReview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve teacher info suggestion.');
    } finally {
      setSaving(false);
    }
  };

  const rejectDuplicateFacultySuggestion = async () => {
    if (!duplicateFacultySuggestionReview) return;

    setSaving(true);
    setError(null);
    setWarning(null);
    setNotice(null);
    try {
      const result = await facultySuggestionService.reject(duplicateFacultySuggestionReview.submission.facultySuggestion);
      updateFacultySuggestionSubmission(result.suggestion);
      setViewing((current) =>
        current?.id === duplicateFacultySuggestionReview.submission.id ? null : current
      );
      setDuplicateFacultySuggestionReview(null);
      setNotice('Teacher info suggestion rejected.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject teacher info suggestion.');
    } finally {
      setSaving(false);
    }
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    setSaving(true);
    setError(null);
    try {
      if (rejecting.source === 'paper-request') {
        const updated = await paperRequestsService.updateStatus(rejecting.request.id, 'rejected');
        updatePaperRequestSubmission(updated);
        setViewing((current) => (current?.id === rejecting.id ? null : current));
      } else if (rejecting.source === 'course-resource') {
        const result = await courseResourceSubmissionsService.reject(rejecting.resourceSubmission);
        if (result.submission) updateCourseResourceSubmission(result.submission);
        if (result.deletedId) removeCourseResourceSubmission(result.deletedId);
        if (result.warning) setWarning(result.warning);
        setViewing((current) => (current?.id === rejecting.id ? null : current));
      } else if (rejecting.source === 'teacher-suggestion') {
        const result = await facultySuggestionService.reject(rejecting.facultySuggestion);
        updateFacultySuggestionSubmission(result.suggestion);
        setViewing((current) => (current?.id === rejecting.id ? null : current));
      }
      setRejecting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject submission.');
    } finally {
      setSaving(false);
    }
  };

  const pendingSubmissions = submissions.filter(isPendingSubmission);
  const filtered = filter === 'all' ? pendingSubmissions : pendingSubmissions.filter((s) => s.type === filter);
  const types: Submission['type'][] = ['paper-request', 'course-resource', 'teacher-suggestion'];
  const pendingCount = pendingSubmissions.length;

  const columns: AdminTableColumn<ReviewSubmission>[] = [
    {
      key: 'type',
      header: 'Type',
      sortValue: (s) => s.type,
      render: (s) => <span className="font-medium text-slate-900">{typeLabel(s.type)}</span>,
    },
    {
      key: 'details',
      header: 'Details',
      sortValue: submissionTitle,
      render: (s) => (
        <div>
          <p className="font-medium text-slate-900">{submissionTitle(s)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{submissionMaterial(s)}</p>
        </div>
      ),
    },
    { key: 'submittedBy', header: 'Submitted By', sortValue: (s) => s.submittedBy, render: (s) => s.submittedBy },
    {
      key: 'notes',
      header: 'Notes',
      render: (s) => <span className="line-clamp-2 max-w-xs text-sm text-slate-500">{submissionNotes(s)}</span>,
    },
    { key: 'submittedAt', header: 'Date', sortValue: (s) => s.submittedAt, render: (s) => s.submittedAt },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={displayStatus(s)} /> },
    {
      key: '__actions',
      header: '',
      align: 'right',
      render: (s) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button type="button" onClick={() => setViewing(s)} className={actionBtn}>
            <Eye className="h-3.5 w-3.5" /> View
          </button>
          {canManage && s.source === 'paper-request' && s.request.status !== 'noted' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void updatePaperRequestStatus(s, 'noted')}
              className={actionBtn}
            >
              <SearchCheck className="h-3.5 w-3.5" /> Noted
            </button>
          )}
          {canManage && s.source === 'paper-request' && s.request.status !== 'fulfilled' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void updatePaperRequestStatus(s, 'fulfilled')}
              className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-70"
            >
              <Check className="h-3.5 w-3.5" /> Fulfilled
            </button>
          )}
          {canManage && s.source === 'course-resource' && s.resourceSubmission.status === 'pending' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => requestCourseResourceReview(s, 'approved')}
              className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-70"
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
          )}
          {canManage && s.source === 'teacher-suggestion' && s.facultySuggestion.status === 'pending' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void requestFacultySuggestionReview(s, 'approved')}
              className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-70"
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
          )}
          {canManage && displayStatus(s) !== 'rejected' && (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                s.source === 'course-resource'
                  ? requestCourseResourceReview(s, 'rejected')
                  : s.source === 'teacher-suggestion'
                  ? void requestFacultySuggestionReview(s, 'rejected')
                  : setRejecting(s)
              }
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
      <AdminTopbar
        title="Submissions"
        subtitle={`${pendingCount} pending review`}
        action={
          <Link
            to="/portal/submissions/history"
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-ieee-orange/40 hover:text-ieee-orange"
          >
            <History className="h-4 w-4" />
            View History
          </Link>
        }
      />
      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
        {warning && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            {warning}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {notice}
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
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
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
          searchable={(s) => `${s.type} ${s.submittedBy} ${submissionTitle(s)} ${submissionMaterial(s)} ${Object.values(s.data).join(' ')}`}
          emptyTitle="No pending submissions"
          emptyMessage={
            filter === 'paper-request'
              ? 'No paper requests are waiting for review right now.'
              : filter === 'course-resource'
                ? 'No course resource submissions are waiting for review.'
                : filter === 'teacher-suggestion'
                  ? 'No teacher info suggestions are waiting for review.'
                  : 'No submissions are waiting for review right now.'
          }
        />
      </div>

      <AdminEditDrawer open={!!viewing} title="Submission Details" onClose={() => setViewing(null)}>
        {viewing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold uppercase tracking-wide text-ieee-orange">
                {typeLabel(viewing.type)}
              </span>
              <StatusBadge status={displayStatus(viewing)} />
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
                      {k === 'file' && viewing.source === 'course-resource' && viewing.resourceSubmission.fileUrl ? (
                        <a
                          href={viewing.resourceSubmission.fileUrl}
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
                {viewing.source === 'paper-request' && viewing.request.status !== 'noted' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void updatePaperRequestStatus(viewing, 'noted')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-70"
                  >
                    <SearchCheck className="h-4 w-4" /> Noted
                  </button>
                )}
                {viewing.source === 'paper-request' && viewing.request.status !== 'fulfilled' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void updatePaperRequestStatus(viewing, 'fulfilled')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
                  >
                    <Check className="h-4 w-4" /> Fulfilled
                  </button>
                )}
                {viewing.source === 'course-resource' && viewing.resourceSubmission.status === 'pending' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => requestCourseResourceReview(viewing, 'approved')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                )}
                {viewing.source === 'teacher-suggestion' && viewing.facultySuggestion.status === 'pending' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void requestFacultySuggestionReview(viewing, 'approved')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                )}
                {displayStatus(viewing) !== 'rejected' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      viewing.source === 'course-resource'
                        ? requestCourseResourceReview(viewing, 'rejected')
                        : viewing.source === 'teacher-suggestion'
                        ? void requestFacultySuggestionReview(viewing, 'rejected')
                        : setRejecting(viewing)
                    }
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

      {duplicateFacultySuggestionReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ieee-ink/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-black/5 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <SearchCheck className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  {duplicateFacultySuggestionReview.match === 'email'
                    ? 'Duplicate teacher found'
                    : 'Possible duplicate found'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {duplicateFacultySuggestionReview.match === 'email'
                    ? 'A verified teacher with the same email already exists. Review both entries before approving this suggestion.'
                    : 'A verified teacher with the same name and department may already exist. Review both entries before approving this suggestion.'}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {duplicateFacultySuggestionReview.duplicate && (
                <div className="rounded-2xl border border-black/5 bg-cream p-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                    Existing verified
                  </p>
                  <h4 className="mt-1 font-semibold text-slate-900">
                    {duplicateFacultySuggestionReview.duplicate.name}
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {[
                      duplicateFacultySuggestionReview.duplicate.department,
                      duplicateFacultySuggestionReview.duplicate.designation,
                    ]
                      .filter(Boolean)
                      .join(' - ') || 'No department listed'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {duplicateFacultySuggestionReview.duplicate.email || 'No email listed'}
                  </p>
                </div>
              )}
              <div className="rounded-2xl border border-black/5 bg-cream p-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                  Pending suggestion
                </p>
                <h4 className="mt-1 font-semibold text-slate-900">
                  {duplicateFacultySuggestionReview.submission.facultySuggestion.teacherName}
                </h4>
                <p className="mt-1 text-sm text-slate-500">
                  {[
                    duplicateFacultySuggestionReview.submission.facultySuggestion.department,
                    duplicateFacultySuggestionReview.submission.facultySuggestion.designation,
                  ]
                    .filter(Boolean)
                    .join(' - ') || 'No department listed'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {duplicateFacultySuggestionReview.submission.facultySuggestion.email || 'No email listed'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDuplicateFacultySuggestionReview(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-black/5"
              >
                Keep pending
              </button>
              <button
                type="button"
                onClick={() => void approveDuplicateFacultySuggestion()}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-70"
              >
                Approve anyway
              </button>
              <button
                type="button"
                onClick={() => void rejectDuplicateFacultySuggestion()}
                disabled={saving}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-70"
              >
                Reject suggestion
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!reviewingCourseResource}
        title={
          reviewingCourseResource?.status === 'approved'
            ? 'Approve this course resource submission?'
            : 'Reject this course resource submission?'
        }
        description={
          reviewingCourseResource?.status === 'approved'
            ? 'This will apply supported changes to the course page, then mark the submission as approved.'
            : 'This will mark the submission as rejected and move it to reviewed history. If a file was uploaded, the file will be removed from storage first.'
        }
        confirmLabel={
          saving
            ? reviewingCourseResource?.status === 'approved'
              ? 'Approving...'
              : 'Rejecting...'
            : reviewingCourseResource?.status === 'approved'
              ? 'Approve'
              : 'Reject'
        }
        danger={reviewingCourseResource?.status === 'rejected'}
        onCancel={() => setReviewingCourseResource(null)}
        onConfirm={() => void confirmCourseResourceReview()}
      />

      <ConfirmModal
        open={!!reviewingFacultySuggestion}
        title={
          reviewingFacultySuggestion?.status === 'approved'
            ? 'Approve this teacher info suggestion?'
            : 'Reject this teacher info suggestion?'
        }
        description={
          reviewingFacultySuggestion?.status === 'approved'
            ? 'This will apply the supported teacher update, then mark the suggestion as approved.'
            : 'This will keep the suggestion in review history and mark it as rejected.'
        }
        confirmLabel={
          saving
            ? reviewingFacultySuggestion?.status === 'approved'
              ? 'Approving...'
              : 'Rejecting...'
            : reviewingFacultySuggestion?.status === 'approved'
              ? 'Approve'
              : 'Reject'
        }
        danger={reviewingFacultySuggestion?.status === 'rejected'}
        onCancel={() => setReviewingFacultySuggestion(null)}
        onConfirm={() => void confirmFacultySuggestionReview()}
      />

      <ConfirmModal
        open={!!rejecting}
        title="Reject this submission?"
        description={
          rejecting?.source === 'paper-request'
            ? 'This paper request will be marked as rejected and removed from the active review list.'
            : rejecting?.source === 'course-resource'
            ? 'This course resource submission will be marked as rejected and moved to reviewed history. If a file was uploaded, the file will be removed from storage first.'
            : rejecting?.status === 'approved'
            ? 'This approved material will be removed from the public archive and the system. Its record and attached file will no longer be available after rejection.'
            : 'This removes the submission from the review queue.'
        }
        confirmLabel={saving ? 'Rejecting...' : 'Reject'}
        danger
        onCancel={() => setRejecting(null)}
        onConfirm={() => void confirmReject()}
      />
    </div>
  );
}
