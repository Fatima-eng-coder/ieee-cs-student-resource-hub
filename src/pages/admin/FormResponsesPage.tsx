import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, RefreshCw, ShieldAlert } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import { adminAuthService } from '@/services/adminAuthService';
import { formsService, subscribeFormResponsesChanged } from '@/services/formsService';
import { csvFilename, downloadCsv, toCsv, type CsvColumn } from '@/utils/csv';
import type { FormAnswer, FormCapacity, FormDef, FormFieldType, FormResponse } from '@/types';

/**
 * One collected answer set, flattened into a table column.
 *
 * Responses are stored against field ids plus a snapshot of the labels the
 * student actually saw. Columns are reconciled from both: the form gives the
 * order and the current wording, and the snapshots recover any question that
 * was renamed or deleted afterwards — so no answer ever drops out of the table
 * just because the form moved on.
 */
interface ResponseColumn {
  fieldId: string;
  label: string;
  type?: FormFieldType;
  /** False once the question no longer exists on the form. */
  onForm: boolean;
  /** Labels this question carried at submit time that differ from the header. */
  aliases: string[];
}

function buildColumns(form: FormDef | null, responses: FormResponse[]): ResponseColumn[] {
  const drafts = new Map<string, { column: ResponseColumn; aliases: Set<string> }>();

  for (const page of form?.pages ?? []) {
    for (const field of page.fields) {
      drafts.set(field.id, {
        column: { fieldId: field.id, label: field.label, type: field.type, onForm: true, aliases: [] },
        aliases: new Set(),
      });
    }
  }

  // Oldest first, so a deleted question keeps a stable position and takes the
  // earliest wording it was ever answered under.
  for (const response of [...responses].reverse()) {
    for (const [fieldId, label] of Object.entries(response.fieldLabels)) {
      const draft = drafts.get(fieldId);
      const snapshot = (label ?? '').trim();
      if (draft && snapshot && snapshot !== draft.column.label) draft.aliases.add(snapshot);
    }

    for (const fieldId of Object.keys(response.answers)) {
      if (drafts.has(fieldId)) continue;
      const snapshot = (response.fieldLabels[fieldId] ?? '').trim();
      drafts.set(fieldId, {
        column: {
          fieldId,
          // Without the id fragment two deleted questions that never carried a
          // label would collapse into one indistinguishable column.
          label: snapshot || `Question ${fieldId.slice(0, 8)}`,
          onForm: false,
          aliases: [],
        },
        aliases: new Set(),
      });
    }
  }

  return [...drafts.values()].map(({ column, aliases }) => ({ ...column, aliases: [...aliases] }));
}

function answerText(value: FormAnswer | undefined): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function formatDateTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '—';
  return value.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Excel reads YYYY-MM-DD HH:MM as a timestamp; the display format above it as text. */
function csvDateTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(
    value.getMinutes(),
  )}`;
}

const isHttpUrl = (text: string) => /^https?:\/\//i.test(text);

const quoteList = (labels: string[]) => labels.map((label) => `“${label}”`).join(', ');

const primaryButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-60';

const quietButton =
  'flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:cursor-not-allowed disabled:opacity-50';

function StatBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 font-display text-lg font-bold text-slate-900">{children}</div>
    </div>
  );
}

export default function FormResponsesPage() {
  const { id = '' } = useParams();
  // Responses are private: the database refuses them to anyone else, and the
  // page should say so rather than render an empty table.
  const canManage = adminAuthService.canManageContent();

  const [form, setForm] = useState<FormDef | null>(null);
  // Null until the rows are actually read. An empty array is a form nobody has answered,
  // and a page that cannot tell the two apart says "none" about a form holding forty.
  const [responses, setResponses] = useState<FormResponse[] | null>(null);
  const [capacity, setCapacity] = useState<FormCapacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responsesError, setResponsesError] = useState<string | null>(null);
  // The seat read is issued after the form resolves, so there is a window where capacity is
  // null because nothing has asked yet. Reporting that as "the database could not be asked"
  // put a failure on screen before the request had left.
  const [capacityRead, setCapacityRead] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setError(null);
    setResponsesError(null);
    setCapacityRead(false);
    setRefreshing(true);

    (async () => {
      try {
        const definition = await formsService.get(id);
        if (cancelled) return;
        setForm(definition);

        if (definition) {
          // Caught on its own: the form still describes itself truthfully when its answers
          // cannot be read, so the failure costs the table, not the whole page.
          try {
            const rows = await formsService.listResponses(id);
            if (!cancelled) setResponses(rows);
          } catch (err) {
            if (cancelled) return;
            setResponses(null);
            setResponsesError(err instanceof Error ? err.message : 'Responses could not be loaded.');
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'This form could not be loaded.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }

      // Read separately so a capacity failure costs the seat counter, not the
      // responses the admin came here for.
      try {
        const seats = await formsService.capacity(id);
        if (!cancelled) setCapacity(seats);
      } catch {
        if (!cancelled) setCapacity(null);
      } finally {
        if (!cancelled) setCapacityRead(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, canManage, reloadToken]);

  useEffect(() => {
    if (!canManage || !id) return;
    return subscribeFormResponsesChanged(id, () => setReloadToken((token) => token + 1));
  }, [id, canManage]);

  const columns = useMemo(() => buildColumns(form, responses ?? []), [form, responses]);

  const tableColumns = useMemo<AdminTableColumn<FormResponse>[]>(
    () => [
      {
        key: '__submitter',
        header: 'Submitted by',
        sortValue: (response) => response.studentEmail ?? '',
        render: (response) =>
          response.studentEmail ? (
            <span className="font-medium text-slate-900">{response.studentEmail}</span>
          ) : (
            <span className="text-slate-400">Anonymous</span>
          ),
      },
      {
        key: '__submittedAt',
        header: 'Submitted',
        sortValue: (response) => response.submittedAt,
        render: (response) => (
          <span className="whitespace-nowrap text-slate-500">{formatDateTime(response.submittedAt)}</span>
        ),
      },
      ...columns.map((column) => ({
        key: column.fieldId,
        header: column.label,
        sortValue: (response: FormResponse) => answerText(response.answers[column.fieldId]),
        render: (response: FormResponse) => {
          const text = answerText(response.answers[column.fieldId]);
          if (!text) return <span className="text-slate-300">—</span>;

          if (column.type === 'image' && isHttpUrl(text)) {
            return (
              <a href={text} target="_blank" rel="noreferrer" title={text}>
                <img src={text} alt="Response" className="h-10 w-10 rounded-lg border border-black/5 object-cover" />
              </a>
            );
          }

          if (isHttpUrl(text)) {
            return (
              <a
                href={text}
                target="_blank"
                rel="noreferrer"
                title={text}
                className="block max-w-[18rem] truncate font-medium text-ieee-orange hover:underline"
              >
                {text}
              </a>
            );
          }

          return (
            <span title={text} className="block max-w-[18rem] truncate">
              {text}
            </span>
          );
        },
      })),
    ],
    [columns],
  );

  const csvColumns = useMemo<CsvColumn<FormResponse>[]>(
    () => [
      { key: 'studentEmail', header: 'Submitted by', value: (response) => response.studentEmail || 'Anonymous' },
      { key: 'submittedAt', header: 'Submitted', value: (response) => csvDateTime(response.submittedAt) },
      ...columns.map((column) => ({
        key: column.fieldId,
        header: column.label,
        // Handed over raw rather than pre-joined so the encoder can run its
        // formula guard over every element of a multi-choice answer.
        value: (response: FormResponse) => response.answers[column.fieldId] ?? '',
      })),
    ],
    [columns],
  );

  const handleDownloadCsv = () => {
    if (!form || !responses?.length) return;
    downloadCsv(csvFilename(`${form.title}-responses`), toCsv(responses, csvColumns));
  };

  const removedColumns = columns.filter((column) => !column.onForm);
  const renamedColumns = columns.filter((column) => column.aliases.length > 0);

  // The RPC hides its counts on forms that do not show seats to students, but the cap
  // itself is on the form row either way.
  const maxResponses = capacity?.maxResponses ?? form?.maxResponses ?? null;

  // form_capacity() counts the rows inside the database, so its number is exact — but only
  // on a form that publishes its seats. The fetched array is not a count: listResponses asks
  // for no range and PostgREST caps what it hands back, so those rows are what the table
  // shows and never what a "full" or "seats left" verdict is drawn from.
  const countedResponses = capacity?.responseCount ?? null;
  const seatsLeft =
    maxResponses === null || countedResponses === null ? null : Math.max(0, maxResponses - countedResponses);
  const shownCount = countedResponses ?? responses?.length ?? null;
  const truncated = countedResponses !== null && responses !== null && countedResponses > responses.length;

  // Nothing to export means no button in the top bar at all. A disabled one up there is 60%
  // opacity with no explanation, which is how the export came to be reported as missing
  // altogether; the control beside the table stays put in every state and says what it is
  // waiting for.
  const canExport = Boolean(responses?.length);

  if (!canManage) {
    return (
      <div>
        <AdminTopbar title="Responses" subtitle="Form submissions" />
        <div className="p-4 sm:p-6">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-black/5 bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <h3 className="font-display text-base font-bold text-slate-700">You do not have access</h3>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Form responses carry what students wrote about themselves, so only the webmaster, chairperson, vice
              chairperson and general secretary can open them.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <AdminTopbar title="Responses" subtitle="Form submissions" />
        <div className="p-4 sm:p-6">
          <div className="h-20 animate-pulse rounded-2xl border border-black/5 bg-white" />
          <div className="mt-4 h-80 animate-pulse rounded-2xl border border-black/5 bg-white" />
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div>
        <AdminTopbar title="Responses" subtitle="Form submissions" />
        <div className="p-4 sm:p-6">
          <div className="rounded-2xl border border-black/5 bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            {/* A read that failed is not a form that is gone, and only one of the two is
                safe to tell an admin who is about to go looking for it. */}
            <h3 className="font-display text-base font-bold text-slate-700">
              {error ? 'This form could not be loaded' : 'Form not found'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {error ?? 'This form may have been deleted. Its responses stay in the database.'}
            </p>
            <Link to="/portal/forms" className="mt-4 inline-block text-sm font-semibold text-ieee-orange">
              Back to Forms
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Why the form is or is not taking answers, tested in the order the insert trigger tests
  // it — status, opening time, closing time, seats — so this reads the same as what a student
  // is being told. The first three are on the form row and can be worded precisely here; the
  // seat question belongs to the database, which counts every row behind form_capacity(), so
  // its is_open settles it. Without that read the page has nothing to say, and says so rather
  // than reporting a form it never asked about as open.
  const now = Date.now();
  const opensLater = Boolean(form.opensAt && new Date(form.opensAt).getTime() > now);
  const windowPassed = Boolean(form.closesAt && new Date(form.closesAt).getTime() <= now);
  const full = maxResponses !== null && countedResponses !== null && countedResponses >= maxResponses;

  const availability =
    form.status === 'draft'
      ? { label: 'Draft', open: false, detail: 'Students cannot see this form at all.' }
      : form.status === 'closed'
        ? { label: 'Closed', open: false, detail: 'Students are told it is no longer accepting responses.' }
        : opensLater
          ? { label: 'Not open yet', open: false, detail: `Opens ${formatDateTime(form.opensAt!)}.` }
          : windowPassed
            ? { label: 'Closed', open: false, detail: `Stopped accepting responses ${formatDateTime(form.closesAt!)}.` }
            : !capacityRead
              ? { label: 'Checking…', open: false, detail: 'Asking the database whether it is still open.' }
              : capacity === null
                ? { label: 'Unknown', open: false, detail: 'The database could not be asked whether it is still open.' }
                : capacity.isOpen
                  ? { label: 'Accepting responses', open: true, detail: null }
                  : full
                    ? { label: 'Full', open: false, detail: 'The response limit has been reached.' }
                    : { label: 'Not accepting', open: false, detail: 'The database is turning new responses away.' };

  return (
    <div>
      <AdminTopbar
        title={form.title}
        subtitle="Form responses"
        action={
          canExport ? (
            <button onClick={handleDownloadCsv} className={primaryButton}>
              <Download className="h-4 w-4" /> Download CSV
            </button>
          ) : undefined
        }
      />

      <div className="p-4 sm:p-6">
        <Link
          to="/portal/forms"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-ieee-orange"
        >
          <ArrowLeft className="h-4 w-4" /> All forms
        </Link>

        {/* The form-read failure has to be reachable here too. It is only rendered above when
            `form` is null, which never happens on a refresh: the previous definition is still
            in state, so a failed reload left everything on screen looking current and said
            nothing. What is shown is now stale, and the admin has to be told which. */}
        {error && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {error} What you see below is from the last successful read.
          </div>
        )}

        {responsesError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {responsesError}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-black/5 bg-white px-4 py-3.5 shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
          <StatBlock label="Responses">
            {shownCount === null ? (
              <span className="text-slate-400">Not read</span>
            ) : (
              <>
                {shownCount}
                {maxResponses !== null && <span className="text-slate-400"> / {maxResponses}</span>}
              </>
            )}
          </StatBlock>
          <StatBlock label="Capacity">
            {maxResponses === null ? (
              <span className="text-slate-500">Unlimited</span>
            ) : seatsLeft !== null ? (
              <span>
                {seatsLeft} <span className="text-sm font-semibold text-slate-400">left</span>
              </span>
            ) : (
              // The cap is known, the tally behind it is not: this form withholds its counts
              // from form_capacity(), and the rows below are not a count.
              <span>
                {maxResponses} <span className="text-sm font-semibold text-slate-400">max</span>
              </span>
            )}
          </StatBlock>
          <StatBlock label="Status">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                availability.open ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {availability.label}
            </span>
            {availability.detail && (
              <span className="ml-2 text-xs font-medium text-slate-400">{availability.detail}</span>
            )}
          </StatBlock>

          <button
            onClick={() => setReloadToken((token) => token + 1)}
            disabled={refreshing}
            className={`${quietButton} ml-auto`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {(removedColumns.length > 0 || renamedColumns.length > 0) && (
          <div className="mb-4 flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {removedColumns.length > 0 && (
              <p>
                {quoteList(removedColumns.map((column) => column.label))} answered before{' '}
                {removedColumns.length === 1 ? 'that question was' : 'those questions were'} removed from the form. The
                answers are kept here and in the export.
              </p>
            )}
            {renamedColumns.map((column) => (
              <p key={column.fieldId}>
                “{column.label}” was worded {quoteList(column.aliases)} when some of these responses came in.
              </p>
            ))}
          </div>
        )}

        {/* The topbar carries an export button only while there is something to export, so
            this one is the control that is always where the admin is looking — on the table
            it exports — and it states what it is waiting for instead of dimming. */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">Collected responses</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {responses === null
                ? 'These could not be read, so nothing on this page counts as the answers this form holds.'
                : responses.length === 0
                  ? 'Nothing submitted yet.'
                  : `${truncated ? `The newest ${responses.length} of ${countedResponses}` : `${responses.length} ${responses.length === 1 ? 'response' : 'responses'}, newest first`}. The export carries every column below, including answers to questions that have since been removed.`}
            </p>
          </div>

          {responses === null ? (
            <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600">
              <Download className="h-4 w-4" /> Nothing to export until the responses load
            </span>
          ) : responses.length === 0 ? (
            <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-500">
              <Download className="h-4 w-4" /> No responses to export yet
            </span>
          ) : (
            <button onClick={handleDownloadCsv} className={primaryButton}>
              <Download className="h-4 w-4" /> Export {responses.length}{' '}
              {responses.length === 1 ? 'response' : 'responses'} to CSV
            </button>
          )}
        </div>

        {responses === null ? (
          <div className="rounded-2xl border border-black/5 bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <h3 className="font-display text-base font-bold text-slate-700">Responses could not be loaded</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {responsesError ?? 'The answers could not be read.'} This form may still hold answers — an empty table
              here would be a guess, so there is none.
            </p>
            <button
              onClick={() => setReloadToken((token) => token + 1)}
              disabled={refreshing}
              className={`${primaryButton} mt-4`}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Try again
            </button>
          </div>
        ) : (
          <AdminTable
            columns={tableColumns}
            rows={responses}
            rowKey={(response) => response.id}
            pageSize={10}
            searchable={(response) =>
              [
                response.studentEmail ?? 'Anonymous',
                ...columns.map((column) => answerText(response.answers[column.fieldId])),
              ].join(' ')
            }
            emptyTitle="No responses yet"
            emptyMessage="Answers appear here as soon as students submit this form."
          />
        )}
      </div>
    </div>
  );
}
