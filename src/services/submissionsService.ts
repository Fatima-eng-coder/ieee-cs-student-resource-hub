/**
 * The three things a student sends the committee without needing an account: a sign-up for an
 * event, a message through the contact form, and a report that a route on the map is wrong.
 *
 * One service rather than three because they are one shape. Each is an INSERT the database
 * bounds with CHECK constraints and lets anonymous visitors make, paired with a queue only a
 * content manager may read back. Split apart, the error mapping would be the same twenty lines
 * copied three times, and three copies drift.
 *
 * Writing is deliberately open to signed-out visitors (see 20260901002000 section 9): a
 * registration or a broken-route report from somebody without an account is still worth
 * having. Reading is not open, because every row here carries a name and an address — anon
 * holds INSERT and nothing else. That is why create() never chains .select(): asking for the
 * row back needs SELECT, and a visitor would be told their submission failed after it had
 * already been written.
 *
 * student_email is stamped by a BEFORE INSERT trigger from auth.uid(). Nothing here sends it.
 */

import { supabase } from '@/lib/supabase';

export type ContactMessageStatus = 'pending' | 'handled' | 'archived';
export type NavigationReportStatus = 'pending' | 'fixed' | 'rejected';

/**
 * The lengths contact_messages_message_check and navigation_reports_issue_check enforce.
 * Exported so a form can stop a student at the limit while they are still typing, instead of
 * letting them finish and then losing the submission to a constraint they never saw.
 */
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_ISSUE_LENGTH = 2000;

export interface EventRegistrationInput {
  eventId: string;
  name: string;
  email: string;
  rollNumber: string;
  batch: string;
}

export interface EventRegistration {
  id: string;
  eventId: string;
  name: string;
  email: string;
  rollNumber: string | null;
  batch: string | null;
  studentEmail: string | null;
  submittedBy: string | null;
  createdAt: string;
}

export interface ContactMessageInput {
  name: string;
  email: string;
  category: string;
  message: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  category: string;
  message: string;
  status: ContactMessageStatus;
  studentEmail: string | null;
  submittedBy: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
}

export interface NavigationReportInput {
  route: string;
  issue: string;
  reporterName: string;
}

export interface NavigationReport {
  id: string;
  route: string;
  issue: string;
  reporterName: string | null;
  status: NavigationReportStatus;
  studentEmail: string | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface EventRegistrationRow {
  id: string;
  event_id: string;
  name: string;
  email: string;
  roll_number: string | null;
  batch: string | null;
  student_email: string | null;
  submitted_by: string | null;
  created_at: string;
}

interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  category: string;
  message: string;
  status: ContactMessageStatus;
  student_email: string | null;
  submitted_by: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
}

interface NavigationReportRow {
  id: string;
  route: string;
  issue: string;
  reporter_name: string | null;
  status: NavigationReportStatus;
  student_email: string | null;
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const registrationColumns =
  'id,event_id,name,email,roll_number,batch,student_email,submitted_by,created_at';
const messageColumns =
  'id,name,email,category,message,status,student_email,submitted_by,handled_by,handled_at,created_at';
const reportColumns =
  'id,route,issue,reporter_name,status,student_email,submitted_by,reviewed_by,reviewed_at,created_at';

const toRegistration = (row: EventRegistrationRow): EventRegistration => ({
  id: row.id,
  eventId: row.event_id,
  name: row.name,
  email: row.email,
  rollNumber: row.roll_number,
  batch: row.batch,
  studentEmail: row.student_email,
  submittedBy: row.submitted_by,
  createdAt: row.created_at,
});

const toContactMessage = (row: ContactMessageRow): ContactMessage => ({
  id: row.id,
  name: row.name,
  email: row.email,
  category: row.category,
  message: row.message,
  status: row.status,
  studentEmail: row.student_email,
  submittedBy: row.submitted_by,
  handledBy: row.handled_by,
  handledAt: row.handled_at,
  createdAt: row.created_at,
});

const toNavigationReport = (row: NavigationReportRow): NavigationReport => ({
  id: row.id,
  route: row.route,
  issue: row.issue,
  reporterName: row.reporter_name,
  status: row.status,
  studentEmail: row.student_email,
  submittedBy: row.submitted_by,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
});

const toRegistrationPayload = (input: EventRegistrationInput, userId: string | null) => ({
  event_id: input.eventId,
  name: input.name.trim(),
  email: input.email.trim(),
  roll_number: input.rollNumber.trim() || null,
  batch: input.batch.trim() || null,
  submitted_by: userId,
});

const toContactMessagePayload = (input: ContactMessageInput, userId: string | null) => ({
  name: input.name.trim(),
  email: input.email.trim(),
  category: input.category.trim(),
  message: input.message.trim(),
  // Both are pinned by the insert policy's WITH CHECK; sending anything else is a refusal.
  status: 'pending',
  handled_by: null,
  submitted_by: userId,
});

const toNavigationReportPayload = (input: NavigationReportInput, userId: string | null) => ({
  route: input.route.trim(),
  issue: input.issue.trim(),
  reporter_name: input.reporterName.trim() || null,
  status: 'pending',
  reviewed_by: null,
  submitted_by: userId,
});

/** Structurally what PostgrestError gives us, without importing the client's types. */
interface WriteFailure {
  code?: string | null;
  message?: string | null;
  /** PostgREST puts the row count of a failed `.single()` here, not in `message`. */
  details?: string | null;
}

/**
 * Exactly what event_registrations_email_check and contact_messages_email_check test:
 * strpos(email, '@') > 1, which is 1-based, so the '@' must exist and must not be the first
 * character. Nothing more — a service that refuses addresses the database would accept sends
 * a student away over a rule that does not exist.
 */
const hasAddressShape = (email: string) => email.trim().indexOf('@') > 0;

/** The failures that read the same whichever of the three forms is in front of the student. */
const commonSubmitFailure = (error: WriteFailure): string | null => {
  const lower = (error.message ?? '').toLowerCase();

  if (error.code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'The server refused this submission. That is a problem on our side, not with what you typed — please try again later.';
  }
  if (lower.includes('jwt') || lower.includes('token is expired')) {
    return 'Your session has expired. Please reload the page and send this again.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('load failed')) {
    return 'We could not reach the server, so nothing has been sent yet. Check your connection and try again.';
  }
  return null;
};

const friendlyRegistrationError = (error: WriteFailure): string => {
  const lower = (error.message ?? '').toLowerCase();

  // The one failure this form sees in normal use. "duplicate key value violates unique
  // constraint" tells a student nothing they can act on, and a generic failure is worse still:
  // it reads as "try again", so they do, and it fails identically every time.
  if (error.code === '23505' || lower.includes('event_registrations_one_per_email_idx')) {
    return 'You have already registered for this event with that address.';
  }
  // ON DELETE CASCADE on event_id, so the event was removed between this page loading and the
  // form being sent. There is nothing to retry against.
  if (
    error.code === '23503' ||
    error.code === '22P02' ||
    lower.includes('event_registrations_event_id_fkey') ||
    lower.includes('invalid input syntax')
  ) {
    return 'This event is no longer listed, so it cannot take registrations. It may have been removed while this page was open.';
  }
  if (lower.includes('event_registrations_name_check')) return 'Please enter your full name.';
  if (lower.includes('event_registrations_email_check')) return 'Please enter a valid email address.';

  return commonSubmitFailure(error) ?? 'Your registration could not be sent right now. Please try again.';
};

const friendlyMessageError = (error: WriteFailure): string => {
  const lower = (error.message ?? '').toLowerCase();

  if (lower.includes('contact_messages_message_check')) {
    return `Please write a message of up to ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`;
  }
  if (lower.includes('contact_messages_name_check')) return 'Please enter your name.';
  if (lower.includes('contact_messages_email_check')) return 'Please enter a valid email address.';

  return commonSubmitFailure(error) ?? 'Your message could not be sent right now. Please try again.';
};

const friendlyReportError = (error: WriteFailure): string => {
  const lower = (error.message ?? '').toLowerCase();

  if (lower.includes('navigation_reports_issue_check')) {
    return `Please describe the problem in up to ${MAX_ISSUE_LENGTH.toLocaleString()} characters.`;
  }
  if (lower.includes('navigation_reports_route_check')) return 'Please say which route the problem is on.';

  return commonSubmitFailure(error) ?? 'Your report could not be sent right now. Please try again.';
};

/** Said whenever a queue write names a row the database no longer holds, or will not hand over. */
const STALE_ROW_MESSAGE =
  'That submission is no longer there. Reload the queue to see what is stored.';

/**
 * The committee's side of all three tables. anon has no SELECT at all here, so a read from a
 * signed-out browser is a 42501 rather than an empty list — which is the whole point, and must
 * be reported as a refusal instead of being smoothed into "no submissions yet".
 */
const friendlyQueueError = (error: WriteFailure, action: 'read' | 'change' = 'read'): string => {
  const lower = (error.message ?? '').toLowerCase();
  const details = (error.details ?? '').toLowerCase();

  if (error.code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
    // A write refused with a read's wording sends an admin looking for a permissions problem
    // on the queue they can plainly see in front of them.
    return action === 'change'
      ? 'Only content managers can change student submissions.'
      : 'Only content managers can read student submissions.';
  }
  if (lower.includes('_status_check')) {
    return 'That status is not one this queue accepts.';
  }
  /*
   * PostgREST's answer when a single-row write matched nothing. On these tables that is almost
   * always the policy declining the row rather than the row being absent.
   *
   * Matched on the CODE, not on the prose. This deployment answers a zero-row `.single()` with
   * "Cannot coerce the result to a single JSON object" and puts "The result contains 0 rows"
   * in `details` — so a match against `message` alone never fired, and an RLS-declined update
   * fell through to the generic "try again", which an admin then does, forever.
   */
  if (
    error.code === 'PGRST116' ||
    lower.includes('multiple (or no) rows') ||
    lower.includes('0 rows') ||
    details.includes('0 rows')
  ) {
    return STALE_ROW_MESSAGE;
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('load failed')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return action === 'change'
    ? 'That change could not be saved right now. Please try again.'
    : 'Student submissions could not be loaded right now. Please try again.';
};

/** Everything the database would refuse, named in the student's own words first. */
function assertRegistration(input: EventRegistrationInput): void {
  if (!input.eventId) {
    throw new Error('This form is not attached to an event. Please open it from the event page.');
  }
  if (!input.name.trim()) throw new Error('Please enter your full name.');
  if (!hasAddressShape(input.email)) throw new Error('Please enter a valid email address.');
}

function assertContactMessage(input: ContactMessageInput): void {
  if (!input.name.trim()) throw new Error('Please enter your name.');
  if (!hasAddressShape(input.email)) throw new Error('Please enter a valid email address.');
  if (!input.category.trim()) throw new Error('Please choose what your message is about.');

  const message = input.message.trim();
  if (!message) throw new Error('Please write your message.');
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(
      `Your message is ${message.length.toLocaleString()} characters. Please shorten it to ${MAX_MESSAGE_LENGTH.toLocaleString()}.`
    );
  }
}

function assertNavigationReport(input: NavigationReportInput): void {
  if (!input.route.trim()) throw new Error('Please say which route the problem is on.');

  const issue = input.issue.trim();
  if (!issue) throw new Error('Please describe what is wrong with the route.');
  if (issue.length > MAX_ISSUE_LENGTH) {
    throw new Error(
      `Your description is ${issue.length.toLocaleString()} characters. Please shorten it to ${MAX_ISSUE_LENGTH.toLocaleString()}.`
    );
  }
}

/**
 * The account to attribute a submission to, or null for a signed-out visitor — which is the
 * normal case on all three of these forms and not an error.
 *
 * Read here rather than taken from the caller: the insert policies check
 * submitted_by = auth.uid(), so a page passing an id the token does not match would be refused
 * with nothing wrong in front of the student.
 */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

export const submissionsService = {
  /**
   * A sign-up for an event with no attached form. Resolves only once the row is in the
   * database, so the caller can show a confirmation knowing there is something to confirm.
   *
   * Nothing comes back: anon holds INSERT and no SELECT, so asking PostgREST to return the
   * inserted row would answer 42501 for a row that was written perfectly well.
   */
  async registerForEvent(input: EventRegistrationInput): Promise<void> {
    assertRegistration(input);

    const userId = await currentUserId();
    const { error } = await supabase
      .from('event_registrations')
      .insert(toRegistrationPayload(input, userId));

    if (error) throw new Error(friendlyRegistrationError(error));
  },

  async sendContactMessage(input: ContactMessageInput): Promise<void> {
    assertContactMessage(input);

    const userId = await currentUserId();
    const { error } = await supabase
      .from('contact_messages')
      .insert(toContactMessagePayload(input, userId));

    if (error) throw new Error(friendlyMessageError(error));
  },

  async reportRoute(input: NavigationReportInput): Promise<void> {
    assertNavigationReport(input);

    const userId = await currentUserId();
    const { error } = await supabase
      .from('navigation_reports')
      .insert(toNavigationReportPayload(input, userId));

    if (error) throw new Error(friendlyReportError(error));
  },

  /** Every sign-up, or just one event's, newest first. Content managers only. */
  async listRegistrations(eventId?: string): Promise<EventRegistration[]> {
    let query = supabase.from('event_registrations').select(registrationColumns);
    if (eventId) query = query.eq('event_id', eventId);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw new Error(friendlyQueueError(error));
    return ((data ?? []) as EventRegistrationRow[]).map(toRegistration);
  },

  async listContactMessages(): Promise<ContactMessage[]> {
    const { data, error } = await supabase
      .from('contact_messages')
      .select(messageColumns)
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyQueueError(error));
    return ((data ?? []) as ContactMessageRow[]).map(toContactMessage);
  },

  async listNavigationReports(): Promise<NavigationReport[]> {
    const { data, error } = await supabase
      .from('navigation_reports')
      .select(reportColumns)
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyQueueError(error));
    return ((data ?? []) as NavigationReportRow[]).map(toNavigationReport);
  },

  /**
   * handled_by and handled_at are cleared when a message goes back to pending. A message
   * returned to the queue has not been handled, and leaving the stamp behind would have the
   * list claim someone dealt with it while it sits there unanswered.
   */
  async updateContactMessageStatus(id: string, status: ContactMessageStatus): Promise<ContactMessage> {
    await refreshAuthSession();
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('contact_messages')
      .update({
        status,
        handled_by: status === 'pending' ? null : userId,
        handled_at: status === 'pending' ? null : new Date().toISOString(),
      })
      .eq('id', id)
      .select(messageColumns)
      .single();

    if (error) throw new Error(friendlyQueueError(error, 'change'));
    return toContactMessage(data as ContactMessageRow);
  },

  async updateNavigationReportStatus(id: string, status: NavigationReportStatus): Promise<NavigationReport> {
    await refreshAuthSession();
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('navigation_reports')
      .update({
        status,
        reviewed_by: status === 'pending' ? null : userId,
        reviewed_at: status === 'pending' ? null : new Date().toISOString(),
      })
      .eq('id', id)
      .select(reportColumns)
      .single();

    if (error) throw new Error(friendlyQueueError(error, 'change'));
    return toNavigationReport(data as NavigationReportRow);
  },

  /**
   * `authenticated` holds the DELETE grant on all three tables outright; what separates a
   * content manager from anyone else is the row-level policy, and Postgres answers a delete
   * the policy refused with zero rows affected rather than an error. Without the count that
   * refusal is indistinguishable here from a completed delete. A null count means the header
   * was absent and proves nothing either way, so only an explicit zero is a refusal.
   */
  async removeRegistration(id: string): Promise<void> {
    await removeRow('event_registrations', id);
  },

  async removeContactMessage(id: string): Promise<void> {
    await removeRow('contact_messages', id);
  },

  async removeNavigationReport(id: string): Promise<void> {
    await removeRow('navigation_reports', id);
  },
};

async function removeRow(table: string, id: string): Promise<void> {
  await refreshAuthSession();
  const { error, count } = await supabase.from(table).delete({ count: 'exact' }).eq('id', id);

  if (error) throw new Error(friendlyQueueError(error, 'change'));
  if (count === 0) throw new Error(STALE_ROW_MESSAGE);
}
