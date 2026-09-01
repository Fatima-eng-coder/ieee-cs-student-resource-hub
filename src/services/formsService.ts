import { supabase } from '@/lib/supabase';
import { announcementsService, type AnnouncementFormLink } from '@/services/announcementsService';
import { eventsService, type EventFormLink } from '@/services/eventsService';
import type {
  FormAnswer,
  FormCapacity,
  FormDef,
  FormField,
  FormFieldOption,
  FormFieldType,
  FormPage,
  FormResponse,
  FormStatus,
} from '@/types';

/**
 * Forms module backend. Admin builds forms; students fill open ones; responses
 * collect for the admin. Availability (status, the opens/closes window and the
 * response cap) is enforced by a database trigger — everything here only makes
 * the refusal readable.
 */

const formColumns =
  'id,title,description,status,opens_at,closes_at,max_responses,show_remaining,is_default,created_by,created_at,updated_at';
const pageColumns = 'id,form_id,title,description,sort_order';
const fieldColumns =
  'id,form_id,page_id,label,help_text,placeholder,field_type,required,options,sort_order';
const responseColumns = 'id,form_id,submitted_by,student_email,answers,field_labels,created_at';

/** PostgREST caps how many rows one request returns, so a busy form is read a page at a time. */
const RESPONSE_PAGE_SIZE = 1000;

/** A stop so a form that keeps answering with full pages cannot loop forever. */
const MAX_RESPONSE_PAGES = 50;

type DbFieldType =
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'image';

interface FormRow {
  id: string;
  title: string;
  description: string | null;
  status: FormStatus;
  opens_at: string | null;
  closes_at: string | null;
  max_responses: number | null;
  show_remaining: boolean | null;
  is_default: boolean | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

interface FormPageRow {
  id: string;
  form_id: string;
  title: string | null;
  description: string | null;
  sort_order: number | null;
}

interface FormFieldRow {
  id: string;
  form_id: string;
  page_id: string;
  label: string;
  help_text: string | null;
  placeholder: string | null;
  field_type: DbFieldType;
  required: boolean;
  options: unknown;
  sort_order: number | null;
}

interface FormResponseRow {
  id: string;
  form_id: string;
  submitted_by: string | null;
  student_email: string | null;
  answers: Record<string, FormAnswer> | null;
  field_labels: Record<string, string> | null;
  created_at: string;
}

interface FormCapacityRow {
  max_responses: number | null;
  response_count: number | null;
  remaining: number | null;
  is_open: boolean | null;
}

const fieldTypeToDb: Record<FormFieldType, DbFieldType> = {
  'short-text': 'short_text',
  'long-text': 'long_text',
  email: 'email',
  number: 'number',
  date: 'date',
  dropdown: 'select',
  radio: 'radio',
  checkbox: 'checkbox',
  file: 'file',
  image: 'image',
};

/**
 * The builder ships no phone control, so a phone field authored elsewhere is
 * shown as short text. Saving that form through the builder rewrites it as
 * short_text — the value survives, the input hint does not.
 */
const fieldTypeFromDb: Record<DbFieldType, FormFieldType> = {
  short_text: 'short-text',
  long_text: 'long-text',
  email: 'email',
  phone: 'short-text',
  number: 'number',
  date: 'date',
  select: 'dropdown',
  radio: 'radio',
  checkbox: 'checkbox',
  file: 'file',
  image: 'image',
};

const optionFieldTypes: ReadonlySet<FormFieldType> = new Set<FormFieldType>(['dropdown', 'radio', 'checkbox']);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The builder mints local ids like `ff-1699…`; only a real uuid names a row that already exists. */
const isPersistedId = (id: string | undefined): id is string => typeof id === 'string' && UUID_PATTERN.test(id);

const toOptions = (raw: unknown): FormFieldOption[] | undefined => {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  return raw.map((entry, index) => {
    if (typeof entry === 'string') return { id: `opt-${index}`, label: entry };
    const record = (entry ?? {}) as { id?: unknown; label?: unknown; value?: unknown };
    const label =
      typeof record.label === 'string'
        ? record.label
        : typeof record.value === 'string'
          ? record.value
          : '';
    return { id: typeof record.id === 'string' ? record.id : `opt-${index}`, label };
  });
};

const toFormField = (row: FormFieldRow): FormField => {
  const type = fieldTypeFromDb[row.field_type] ?? 'short-text';
  return {
    id: row.id,
    type,
    label: row.label,
    description: row.help_text || undefined,
    placeholder: row.placeholder || undefined,
    required: Boolean(row.required),
    options: optionFieldTypes.has(type) ? toOptions(row.options) : undefined,
  };
};

const bySortOrder = <T extends { sort_order: number | null }>(a: T, b: T) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0);

const toFormDef = (row: FormRow, pageRows: FormPageRow[], fieldRows: FormFieldRow[]): FormDef => {
  const fieldsByPage = new Map<string, FormFieldRow[]>();
  for (const field of [...fieldRows].sort(bySortOrder)) {
    const bucket = fieldsByPage.get(field.page_id);
    if (bucket) bucket.push(field);
    else fieldsByPage.set(field.page_id, [field]);
  }

  const pages: FormPage[] = [...pageRows].sort(bySortOrder).map((page) => ({
    id: page.id,
    title: page.title || undefined,
    description: page.description || undefined,
    fields: (fieldsByPage.get(page.id) ?? []).map(toFormField),
  }));

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    pages,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    isDefault: row.is_default ?? undefined,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    maxResponses: row.max_responses,
    showRemaining: row.show_remaining ?? undefined,
    createdBy: row.created_by,
  };
};

const toFormResponse = (row: FormResponseRow): FormResponse => ({
  id: row.id,
  formId: row.form_id,
  submittedBy: row.submitted_by ?? undefined,
  studentEmail: row.student_email,
  submittedAt: row.created_at,
  answers: row.answers ?? {},
  fieldLabels: row.field_labels ?? {},
});

const toCapacity = (row: FormCapacityRow | undefined): FormCapacity => ({
  maxResponses: row?.max_responses ?? null,
  responseCount: row?.response_count ?? null,
  remaining: row?.remaining ?? null,
  isOpen: Boolean(row?.is_open),
});

const friendlyAdminError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Only content managers can manage forms.';
  }

  if (lower.includes('check constraint') || lower.includes('violates')) {
    return 'This form has a setting the database rejected. Please review its status, dates and response limit.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  return 'The form could not be saved right now. Please try again.';
};

const friendlyReadError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'You do not have access to this form.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  return 'Forms could not be loaded right now. Please try again.';
};

const CLOSED_MESSAGE = 'This form is closed and is no longer accepting responses.';
const NOT_YET_OPEN_MESSAGE = 'This form has not opened yet. Please come back once it starts.';
const WINDOW_PASSED_MESSAGE = 'This form has already closed and is no longer accepting responses.';
const FULL_MESSAGE = 'This form is full — it has reached its response limit.';

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * The trigger's own wording is not a contract, so its refusal is matched
 * loosely and only as a backstop behind the state we can read directly.
 */
const friendlyResponseError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('full') || lower.includes('max_responses') || lower.includes('capacity') || lower.includes('limit')) {
    return FULL_MESSAGE;
  }

  if (lower.includes('not yet') || lower.includes('has not opened') || lower.includes('opens_at')) {
    return NOT_YET_OPEN_MESSAGE;
  }

  if (lower.includes('closes_at') || lower.includes('no longer') || lower.includes('expired')) {
    return WINDOW_PASSED_MESSAGE;
  }

  if (lower.includes('closed') || lower.includes('not open') || lower.includes('draft')) {
    return CLOSED_MESSAGE;
  }

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Your response could not be saved because access rules blocked it. Please refresh and try again.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  return 'Your response could not be submitted right now. Please try again.';
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

/**
 * The submit path is the one write here a signed-out student may perform, and refreshing a
 * session that does not exist is an error — one that would be logged on every anonymous
 * submission. So the token is only refreshed when there is one, which still covers the case
 * that matters: a student who signed in, then spent twenty minutes filling the form in.
 */
async function refreshAuthSessionIfSignedIn(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) await refreshAuthSession();
}

/**
 * The admin list prints a response count while it renders and cannot await, so
 * every call that already knows a count leaves it here for that render to read.
 */
const responseCounts = new Map<string, number>();

async function fetchForms(): Promise<FormDef[]> {
  const { data, error } = await supabase
    .from('forms')
    .select(formColumns)
    .order('is_default', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw new Error(friendlyReadError(error.message));

  const rows = (data ?? []) as FormRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [pages, fields] = await Promise.all([
    supabase.from('form_pages').select(pageColumns).in('form_id', ids),
    supabase.from('form_fields').select(fieldColumns).in('form_id', ids),
  ]);

  if (pages.error) throw new Error(friendlyReadError(pages.error.message));
  if (fields.error) throw new Error(friendlyReadError(fields.error.message));

  const pageRows = (pages.data ?? []) as FormPageRow[];
  const fieldRows = (fields.data ?? []) as FormFieldRow[];

  return rows.map((row) =>
    toFormDef(
      row,
      pageRows.filter((page) => page.form_id === row.id),
      fieldRows.filter((field) => field.form_id === row.id)
    )
  );
}

/** A form students may actually open right now: released and inside its window. */
const isAcceptingNow = (form: FormDef): boolean => {
  if (form.status !== 'open') return false;
  const now = Date.now();
  if (form.opensAt && new Date(form.opensAt).getTime() > now) return false;
  if (form.closesAt && new Date(form.closesAt).getTime() < now) return false;
  return true;
};

/**
 * Counted head-only rather than tallied from fetched rows, because PostgREST caps how many
 * rows one request returns and a capped page would quietly undercount a popular form.
 *
 * Returns null rather than 0 when the count cannot be read — students have no select
 * privilege on form_responses at all, and a delete confirmation that says "0 responses" for
 * a form holding forty is the one failure this whole feature exists to prevent.
 */
async function countResponses(formId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('form_responses')
    .select('id', { count: 'exact', head: true })
    .eq('form_id', formId);

  // A missing count is treated exactly like a refusal. PostgREST answers a head request it
  // will not serve with an empty error and no number at all, and reading that absence as
  // zero is the one mistake that would let a form holding forty answers be deleted under a
  // dialog promising it held none.
  if (error || count === null || count === undefined) return null;

  responseCounts.set(formId, count);
  return count;
}

/**
 * Fills the cache the admin list reads while it renders. A count that could not be read
 * leaves no entry behind and clears any stale one, so the badge goes blank rather than
 * printing the zero countResponses refuses to invent — a row reading "0 responses" one click
 * away from a dialog admitting the count is unknown is the contradiction to avoid.
 */
async function warmResponseCounts(formIds: string[]): Promise<void> {
  await Promise.all(
    formIds.map(async (id) => {
      if ((await countResponses(id)) === null) responseCounts.delete(id);
    })
  );
}

/**
 * The builder mints ids locally, so a page or field that has never been saved
 * gets its uuid here — one uniform shape lets the whole set go up in a single
 * upsert while surviving rows keep the ids the existing responses point at.
 */
function buildRows(formId: string, pages: FormPage[]) {
  const pageRows: Record<string, unknown>[] = [];
  const fieldRows: Record<string, unknown>[] = [];

  pages.forEach((page, pageIndex) => {
    const pageId = isPersistedId(page.id) ? page.id : crypto.randomUUID();
    pageRows.push({
      id: pageId,
      form_id: formId,
      title: page.title?.trim() ?? '',
      description: page.description?.trim() ?? '',
      sort_order: pageIndex,
    });

    page.fields.forEach((field, fieldIndex) => {
      const hasOptions = optionFieldTypes.has(field.type);
      fieldRows.push({
        id: isPersistedId(field.id) ? field.id : crypto.randomUUID(),
        form_id: formId,
        page_id: pageId,
        label: field.label.trim(),
        help_text: field.description?.trim() ?? '',
        placeholder: field.placeholder?.trim() ?? '',
        field_type: fieldTypeToDb[field.type] ?? 'short_text',
        required: Boolean(field.required),
        options: hasOptions ? (field.options ?? []).map((o) => ({ id: o.id, label: o.label })) : [],
        sort_order: fieldIndex,
      });
    });
  });

  return { pageRows, fieldRows };
}

const idList = (rows: Record<string, unknown>[]) => rows.map((row) => String(row.id));

/** Fields go before pages so a dropped page never leaves its fields dangling. */
async function pruneRemoved(formId: string, table: 'form_fields' | 'form_pages', keepIds: string[]): Promise<void> {
  let query = supabase.from(table).delete().eq('form_id', formId);
  if (keepIds.length > 0) query = query.not('id', 'in', `(${keepIds.join(',')})`);

  const { error } = await query;
  if (error) throw new Error(friendlyAdminError(error.message));
}

async function writePages(formId: string, pages: FormPage[]): Promise<void> {
  const { pageRows, fieldRows } = buildRows(formId, pages);

  await pruneRemoved(formId, 'form_fields', idList(fieldRows));
  await pruneRemoved(formId, 'form_pages', idList(pageRows));

  if (pageRows.length > 0) {
    const { error } = await supabase.from('form_pages').upsert(pageRows);
    if (error) throw new Error(friendlyAdminError(error.message));
  }

  if (fieldRows.length > 0) {
    const { error } = await supabase.from('form_fields').upsert(fieldRows);
    if (error) throw new Error(friendlyAdminError(error.message));
  }
}

/**
 * Everything a delete confirmation needs to know about one form: what it is called, what it
 * would cost to destroy, and which events and announcements would lose their sign-up form.
 *
 * Composed here rather than in each page because both directions of the question ask it —
 * the forms list asks "what points at this form", and the event and announcement editors ask
 * "what is the form I have attached" — and three pages fanning out to the same three tables
 * is three places for the answer to drift.
 */
export interface FormLinkImpact {
  formId: string;
  /** Null when the form row could not be read: already deleted, or not visible to this user. */
  title: string | null;
  status: FormStatus | null;
  /** Null when responses could not be counted — never a guessed zero. */
  responseCount: number | null;
  events: EventFormLink[];
  announcements: AnnouncementFormLink[];
}

export interface CreateFormInput {
  title: string;
  description: string;
  pages: FormDef['pages'];
  status?: FormStatus;
  opensAt?: string | null;
  closesAt?: string | null;
  maxResponses?: number | null;
  showRemaining?: boolean;
}

/** The admin toggle predates the draft state; its "disabled" means closed. */
export type SettableFormStatus = FormStatus | 'disabled';

const normalizeStatus = (status: SettableFormStatus): FormStatus => (status === 'disabled' ? 'closed' : status);

export function subscribeFormsChanged(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let timeout: number | null = null;
  const channel = supabase.channel(`forms-sync-${crypto.randomUUID()}`);
  const scheduleCallback = () => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(callback, 150);
  };

  channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'forms' }, scheduleCallback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'form_pages' }, scheduleCallback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'form_fields' }, scheduleCallback)
    .subscribe();

  return () => {
    if (timeout) window.clearTimeout(timeout);
    void supabase.removeChannel(channel);
  };
}

export function subscribeFormResponsesChanged(formId: string, callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let timeout: number | null = null;
  const scheduleCallback = () => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(callback, 150);
  };

  const channel = supabase
    .channel(`form-responses-sync-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'form_responses', filter: `form_id=eq.${formId}` },
      scheduleCallback
    )
    .subscribe();

  return () => {
    if (timeout) window.clearTimeout(timeout);
    void supabase.removeChannel(channel);
  };
}

export const formsService = {
  /** Every form, newest first, with the default form pinned last — for the admin. */
  async list(): Promise<FormDef[]> {
    const forms = await fetchForms();
    await warmResponseCounts(forms.map((form) => form.id));
    return forms;
  },

  /** Alias kept for the admin list. */
  async listAll(): Promise<FormDef[]> {
    return this.list();
  },

  /** Forms a student may fill right now — for the public side. */
  async listOpen(): Promise<FormDef[]> {
    const forms = await fetchForms();
    return forms.filter(isAcceptingNow);
  },

  async get(id: string): Promise<FormDef | null> {
    if (!isPersistedId(id)) return null;

    const { data, error } = await supabase.from('forms').select(formColumns).eq('id', id).maybeSingle();
    if (error) throw new Error(friendlyReadError(error.message));
    if (!data) return null;

    const [pages, fields] = await Promise.all([
      supabase.from('form_pages').select(pageColumns).eq('form_id', id),
      supabase.from('form_fields').select(fieldColumns).eq('form_id', id),
    ]);

    if (pages.error) throw new Error(friendlyReadError(pages.error.message));
    if (fields.error) throw new Error(friendlyReadError(fields.error.message));

    return toFormDef(data as FormRow, (pages.data ?? []) as FormPageRow[], (fields.data ?? []) as FormFieldRow[]);
  },

  async create(input: CreateFormInput): Promise<FormDef> {
    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('forms')
      .insert({
        title: input.title.trim() || 'Untitled form',
        description: input.description.trim(),
        status: input.status ?? 'open',
        opens_at: input.opensAt ?? null,
        closes_at: input.closesAt ?? null,
        max_responses: input.maxResponses ?? null,
        show_remaining: input.showRemaining ?? false,
        is_default: false,
        created_by: userData.user?.id ?? null,
      })
      .select(formColumns)
      .single();

    if (error) throw new Error(friendlyAdminError(error.message));

    const row = data as FormRow;
    await writePages(row.id, input.pages);

    const saved = await this.get(row.id);
    return saved ?? toFormDef(row, [], []);
  },

  async update(id: string, patch: Partial<Omit<FormDef, 'id'>>): Promise<FormDef> {
    await refreshAuthSession();

    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload.title = patch.title.trim() || 'Untitled form';
    if (patch.description !== undefined) payload.description = patch.description.trim();
    if (patch.status !== undefined) payload.status = normalizeStatus(patch.status);
    if (patch.opensAt !== undefined) payload.opens_at = patch.opensAt;
    if (patch.closesAt !== undefined) payload.closes_at = patch.closesAt;
    if (patch.maxResponses !== undefined) payload.max_responses = patch.maxResponses;
    if (patch.showRemaining !== undefined) payload.show_remaining = Boolean(patch.showRemaining);

    if (Object.keys(payload).length > 0) {
      payload.updated_at = new Date().toISOString();
      const { error } = await supabase.from('forms').update(payload).eq('id', id);
      if (error) throw new Error(friendlyAdminError(error.message));
    }

    if (patch.pages !== undefined) await writePages(id, patch.pages);

    const saved = await this.get(id);
    if (!saved) throw new Error('Form not found.');
    return saved;
  },

  async setStatus(id: string, status: SettableFormStatus): Promise<FormDef> {
    return this.update(id, { status: normalizeStatus(status) });
  },

  /** Release a form so students can fill it. */
  async publish(id: string): Promise<FormDef> {
    return this.setStatus(id, 'open');
  },

  /** Stop accepting responses; the form and its answers stay. */
  async close(id: string): Promise<FormDef> {
    return this.setStatus(id, 'closed');
  },

  /**
   * Deletes the form and everything hanging off it, in one statement.
   *
   * Nothing here deletes the pages, fields or responses first. All three name forms.id with
   * ON DELETE CASCADE (20260901000200_forms.sql:102, 138 and 215), so Postgres takes them
   * with the parent inside the same transaction: either the whole form goes or none of it
   * does. Deleting the children from the client instead would put a network round trip in
   * the middle of that — a session that expires between the field delete and the form delete
   * leaves the form still listed, still attached to its event, with every question gone and
   * its responses pointing at field ids that no longer exist. Unrecoverable, and worse than
   * the failure it was meant to guard against.
   *
   * What no version of this call can do is keep the responses, which is why every caller has
   * to say the response count out loud before getting here.
   */
  async remove(id: string): Promise<void> {
    await refreshAuthSession();

    // Counted, because an RLS refusal on a DELETE is not an error: the policy filters the row
    // out and PostgREST answers 204. Uncounted, this reported success for a form still sitting
    // in the database, and the caller removed it from the list and told the admin it was gone.
    // An explicit zero only — a null count means no header was sent, which proves nothing.
    const { error, count } = await supabase.from('forms').delete({ count: 'exact' }).eq('id', id);
    if (error) throw new Error(friendlyAdminError(error.message));
    if (count === 0) {
      throw new Error('That form was not deleted. It may already be gone, or you may not have permission.');
    }

    responseCounts.delete(id);
  },

  /**
   * What deleting this form would take with it. Called when a confirm dialog opens, never
   * while a list renders: it is four round trips and its answer is only ever read once.
   *
   * The lookups run together and a refused link read fails the whole call, so a caller
   * either shows the admin a complete picture or admits it could not check. A partial
   * picture is worse than none here: an empty "nothing else uses this", drawn from a read
   * that was denied, is exactly the reassurance that gets a form deleted out from under a
   * live event. The response count is the one part allowed to come back unknown, because it
   * has its own way of saying so.
   */
  async linkImpact(formId: string): Promise<FormLinkImpact> {
    if (!isPersistedId(formId)) {
      return { formId, title: null, status: null, responseCount: null, events: [], announcements: [] };
    }

    const [form, responseCount, events, announcements] = await Promise.all([
      supabase.from('forms').select('id,title,status').eq('id', formId).maybeSingle(),
      countResponses(formId),
      eventsService.listUsingForm(formId),
      announcementsService.listUsingForm(formId),
    ]);

    if (form.error) throw new Error(friendlyReadError(form.error.message));

    const row = form.data as Pick<FormRow, 'title' | 'status'> | null;
    return {
      formId,
      title: row?.title ?? null,
      status: row?.status ?? null,
      responseCount,
      events,
      announcements,
    };
  },

  /**
   * Every response to one form, newest first — read in pages because the responses page
   * counts the array itself. Seats taken, seats left and whether the form reads as full all
   * come from its length, so a set truncated at PostgREST's max-rows would not just show a
   * short table: it would tell the admin a full form still has room.
   */
  async listResponses(formId: string): Promise<FormResponse[]> {
    if (!isPersistedId(formId)) return [];

    const rows: FormResponseRow[] = [];

    for (let page = 0; page < MAX_RESPONSE_PAGES; page += 1) {
      const from = page * RESPONSE_PAGE_SIZE;
      const { data, error } = await supabase
        .from('form_responses')
        .select(responseColumns)
        .eq('form_id', formId)
        .order('created_at', { ascending: false })
        // Each page is its own query, so two responses saved in the same instant could come
        // back in either order per page — repeating one and dropping the other. The id
        // breaks every tie into a total order.
        .order('id', { ascending: false })
        .range(from, from + RESPONSE_PAGE_SIZE - 1);

      if (error) throw new Error(friendlyReadError(error.message));

      const batch = (data ?? []) as FormResponseRow[];
      rows.push(...batch);
      if (batch.length < RESPONSE_PAGE_SIZE) break;
    }

    responseCounts.set(formId, rows.length);
    return rows.map(toFormResponse);
  },

  /**
   * Responses recorded for a form as of the last list or capacity read. The admin list
   * renders it inline, so it answers from cache instead of awaiting. Null means the count
   * has not been read yet or could not be read at all — never a zero standing in for either,
   * for the same reason countResponses refuses to guess one.
   */
  responseCount(formId: string): number | null {
    return responseCounts.get(formId) ?? null;
  },

  /** Seats left and whether the form is open, straight from the database. */
  async capacity(formId: string): Promise<FormCapacity> {
    const { data, error } = await supabase.rpc('form_capacity', { p_form_id: formId });
    if (error) throw new Error(friendlyReadError(error.message));

    const row = (Array.isArray(data) ? data[0] : data) as FormCapacityRow | undefined;
    const capacity = toCapacity(row);
    if (capacity.responseCount !== null) responseCounts.set(formId, capacity.responseCount);
    return capacity;
  },

  /**
   * `displayName` is accepted for older call sites but never stored: submitted_by
   * comes from the session and student_email is stamped by the database.
   */
  async submitResponse(
    formId: string,
    answers: Record<string, FormAnswer>,
    fieldLabels: Record<string, string>,
    _displayName?: string
  ): Promise<void> {
    await refreshAuthSessionIfSignedIn();
    const { data: userData } = await supabase.auth.getUser();

    /*
     * No .select() on the way out, and that is the whole point of this shape.
     *
     * Chaining one makes PostgREST issue INSERT ... RETURNING, which needs SELECT on
     * public.form_responses. Nobody filling in a form has it:
     *
     *   anon           GRANT INSERT only                       (20260901000200_forms.sql:500)
     *   authenticated  has the grant, but the only SELECT policy on the table is
     *                  "Content managers can read form responses"
     *
     * So the row was written and then the read of it back was refused, and the student was
     * told their submission had failed. Every registration through this page was broken for
     * everyone except the four admin roles.
     *
     * Nothing needed the returned row: the caller awaits this for success or failure. A
     * response is also the one thing in this schema deliberately never readable by the person
     * who wrote it, so asking for it back was wrong in principle as well as in practice.
     */
    const { error } = await supabase.from('form_responses').insert({
      form_id: formId,
      submitted_by: userData.user?.id ?? null,
      answers,
      field_labels: fieldLabels,
    });

    if (error) throw new Error((await submissionBlockReason(formId)) ?? friendlyResponseError(error.message));

    responseCounts.set(formId, (responseCounts.get(formId) ?? 0) + 1);
  },
};

/**
 * Reads back why the trigger refused. Checked in the order the student cares
 * about: a form that was never released, one whose window has not started or
 * has passed, then one that filled up.
 */
async function submissionBlockReason(formId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('forms')
    .select('status,opens_at,closes_at')
    .eq('id', formId)
    .maybeSingle();

  if (error) return null;
  if (!data) return 'This form is no longer available.';

  const form = data as Pick<FormRow, 'status' | 'opens_at' | 'closes_at'>;
  if (form.status !== 'open') return CLOSED_MESSAGE;

  const now = Date.now();
  if (form.opens_at && new Date(form.opens_at).getTime() > now) {
    return `This form has not opened yet. It starts on ${formatWhen(form.opens_at)}.`;
  }
  if (form.closes_at && new Date(form.closes_at).getTime() < now) {
    return `This form closed on ${formatWhen(form.closes_at)} and is no longer accepting responses.`;
  }

  const { data: capacityData, error: capacityError } = await supabase.rpc('form_capacity', { p_form_id: formId });
  if (capacityError) return null;

  const capacity = toCapacity((Array.isArray(capacityData) ? capacityData[0] : capacityData) as FormCapacityRow | undefined);
  if (capacity.remaining !== null && capacity.remaining <= 0) return FULL_MESSAGE;
  if (!capacity.isOpen) return CLOSED_MESSAGE;

  return null;
}
