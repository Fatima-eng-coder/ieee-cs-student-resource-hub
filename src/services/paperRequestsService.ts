import { supabase } from '@/lib/supabase';

export type PaperRequestMaterialType = 'midterm' | 'final' | 'quiz' | 'assignment';
export type PaperRequestSession = 'Spring' | 'Fall';
export type PaperRequestStatus = 'pending' | 'noted' | 'fulfilled' | 'rejected';

export interface PaperRequestInput {
  courseCode: string;
  courseName: string;
  materialType: PaperRequestMaterialType;
  session: PaperRequestSession;
  year: number;
  requesterName?: string | null;
  requesterEmail?: string | null;
  notes: string;
}

export interface PaperRequest {
  id: string;
  courseCode: string;
  courseName: string | null;
  materialType: PaperRequestMaterialType;
  session: PaperRequestSession;
  year: number;
  requesterName: string | null;
  requesterEmail: string | null;
  notes: string | null;
  status: PaperRequestStatus;
  submittedBy: string | null;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

interface PaperRequestRow {
  id: string;
  course_code: string;
  course_name: string | null;
  material_type: PaperRequestMaterialType;
  session: PaperRequestSession;
  year: number;
  requester_name: string | null;
  requester_email: string | null;
  notes: string | null;
  status: PaperRequestStatus;
  submitted_by: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

const requestColumns =
  'id,course_code,course_name,material_type,session,year,requester_name,requester_email,notes,status,submitted_by,created_at,reviewed_by,reviewed_at';

const toPaperRequest = (row: PaperRequestRow): PaperRequest => ({
  id: row.id,
  courseCode: row.course_code,
  courseName: row.course_name,
  materialType: row.material_type,
  session: row.session,
  year: row.year,
  requesterName: row.requester_name,
  requesterEmail: row.requester_email,
  notes: row.notes,
  status: row.status,
  submittedBy: row.submitted_by,
  createdAt: row.created_at,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
});

const friendlyRequestError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Your request could not be saved because access rules blocked it. Please refresh and try again.';
  }

  if (lower.includes('check constraint')) {
    return 'Please review the selected material type, session, and year before submitting.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  return 'Your request could not be submitted right now. Please try again.';
};

const friendlyAdminRequestError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Only content managers can manage paper requests.';
  }

  if (lower.includes('check constraint')) {
    return 'The selected request status is not valid.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  return 'Paper requests could not be updated right now. Please try again.';
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

export const paperRequestsService = {
  async create(input: PaperRequestInput): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from('paper_requests').insert({
      course_code: input.courseCode,
      course_name: input.courseName || null,
      material_type: input.materialType,
      session: input.session,
      year: input.year,
      requester_name: input.requesterName?.trim() || null,
      requester_email: input.requesterEmail?.trim() || null,
      notes: input.notes || null,
      status: 'pending',
      submitted_by: userData.user?.id ?? null,
    });

    if (error) throw new Error(friendlyRequestError(error.message));
  },

  async listForAdmin(): Promise<PaperRequest[]> {
    const { data, error } = await supabase
      .from('paper_requests')
      .select(requestColumns)
      .in('status', ['pending', 'noted', 'fulfilled', 'rejected'])
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyAdminRequestError(error.message));
    return ((data ?? []) as PaperRequestRow[]).map(toPaperRequest);
  },

  async updateStatus(id: string, status: PaperRequestStatus): Promise<PaperRequest> {
    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('paper_requests')
      .update({
        status,
        reviewed_by: userData.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(requestColumns)
      .single();

    if (error) throw new Error(friendlyAdminRequestError(error.message));
    return toPaperRequest(data as PaperRequestRow);
  },

  async deleteReviewed(id: string): Promise<void> {
    await refreshAuthSession();
    const { error } = await supabase
      .from('paper_requests')
      .delete()
      .eq('id', id)
      .neq('status', 'pending');

    if (error) throw new Error(friendlyAdminRequestError(error.message));
  },

  async deleteReviewedMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await refreshAuthSession();
    const { error } = await supabase
      .from('paper_requests')
      .delete()
      .in('id', ids)
      .neq('status', 'pending');

    if (error) throw new Error(friendlyAdminRequestError(error.message));
  },

  subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;

    let timeout: number | null = null;
    const scheduleCallback = () => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(callback, 150);
    };

    const channel = supabase
      .channel(`paper-requests-sync-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paper_requests' }, scheduleCallback)
      .subscribe();

    return () => {
      if (timeout) window.clearTimeout(timeout);
      void supabase.removeChannel(channel);
    };
  },
};
