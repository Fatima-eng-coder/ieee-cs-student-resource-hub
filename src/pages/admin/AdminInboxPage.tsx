import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Download, MapPinned, Mail, RefreshCw, ShieldAlert } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { adminAuthService } from '@/services/adminAuthService';
import {
  submissionsService,
  type ContactMessage,
  type ContactMessageStatus,
  type NavigationReport,
  type NavigationReportStatus,
} from '@/services/submissionsService';
import { csvFilename, downloadCsv, toCsv, type CsvColumn } from '@/utils/csv';

/**
 * The two queues students write into that nobody could read until now: the contact form and
 * the "this route is wrong" report. They share a page because they are the same job — read
 * what came in, act on it, mark it done — and separating them into two sidebar entries would
 * mean two places to remember to check.
 */
type Queue = 'messages' | 'reports';

/**
 * Status order is queue order, pending first, and it is the default filter on both tabs. An
 * inbox opened onto everything ever received buries the three rows that still need somebody.
 */
const messageStatuses: ContactMessageStatus[] = ['pending', 'handled', 'archived'];
const reportStatuses: NavigationReportStatus[] = ['pending', 'fixed', 'rejected'];

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  handled: 'Handled',
  archived: 'Archived',
  fixed: 'Fixed',
  rejected: 'Rejected',
};

/**
 * StatusBadge only knows the paper-request vocabulary (approved/noted/fulfilled), so handled,
 * archived and fixed would all render as the same grey there. Coloured here instead of
 * widening a shared component this page is the only caller of.
 */
const statusTone: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  handled: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  fixed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  archived: 'bg-slate-100 text-slate-600 border-slate-300',
  rejected: 'bg-rose-100 text-rose-800 border-rose-300',
};

/** Only the moves that make sense from where a row already is. */
const messageMoves: Record<ContactMessageStatus, ContactMessageStatus[]> = {
  pending: ['handled', 'archived'],
  handled: ['archived', 'pending'],
  archived: ['pending'],
};

const reportMoves: Record<NavigationReportStatus, NavigationReportStatus[]> = {
  pending: ['fixed', 'rejected'],
  fixed: ['pending'],
  rejected: ['pending'],
};

const primaryButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-60';

const quietButton =
  'flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-black/5 disabled:hover:text-slate-600';

function formatDateTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '—';
  return value.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Excel reads YYYY-MM-DD HH:MM as a timestamp; the display format above it as text. */
function csvDateTime(iso: string | null): string {
  if (!iso) return '';
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(
    value.getMinutes(),
  )}`;
}

function statusBadge(status: string) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        statusTone[status] ?? 'bg-slate-100 text-slate-700 border-slate-300'
      }`}
    >
      {statusLabels[status] ?? status}
    </span>
  );
}

/**
 * A read that failed and a queue with nothing in it look identical once the rows are an empty
 * array, and only one of the two means "there is nothing to do". Rows stay null until they
 * have actually been read, and every caller below has to say which of the two it is looking at.
 */
interface Queued<T> {
  rows: T[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  replace: (row: T) => void;
}

function useQueue<T extends { id: string }>(load: () => Promise<T[]>, enabled: boolean): Queued<T> {
  const [rows, setRows] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    load()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setRows(null);
        setError(err instanceof Error ? err.message : 'This queue could not be read.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [load, enabled, token]);

  const reload = useCallback(() => setToken((value) => value + 1), []);

  // A status change comes back as the saved row, so the table is corrected from what the
  // database actually stored rather than from what was asked for — a refused or partially
  // applied write cannot leave the screen claiming otherwise.
  const replace = useCallback(
    (row: T) => setRows((current) => current?.map((item) => (item.id === row.id ? row : item)) ?? current),
    [],
  );

  return { rows, loading, error, reload, replace };
}

/** Pending first, then newest first inside each status — the order a queue is worked in. */
function queueOrder<T extends { status: string; createdAt: string }>(order: readonly string[]) {
  return (a: T, b: T) => {
    const rank = order.indexOf(a.status) - order.indexOf(b.status);
    return rank !== 0 ? rank : b.createdAt.localeCompare(a.createdAt);
  };
}

const contactCsvColumns: CsvColumn<ContactMessage>[] = [
  { key: 'createdAt', header: 'Received', value: (row) => csvDateTime(row.createdAt) },
  { key: 'name', header: 'Name' },
  { key: 'email', header: 'Reply To' },
  { key: 'studentEmail', header: 'Signed In As', value: (row) => row.studentEmail ?? '' },
  { key: 'category', header: 'Category' },
  { key: 'message', header: 'Message' },
  { key: 'status', header: 'Status', value: (row) => statusLabels[row.status] ?? row.status },
  { key: 'handledAt', header: 'Handled', value: (row) => csvDateTime(row.handledAt) },
];

const reportCsvColumns: CsvColumn<NavigationReport>[] = [
  { key: 'createdAt', header: 'Reported', value: (row) => csvDateTime(row.createdAt) },
  { key: 'route', header: 'Route' },
  { key: 'issue', header: 'Issue' },
  { key: 'reporterName', header: 'Reporter', value: (row) => row.reporterName || 'Anonymous' },
  { key: 'studentEmail', header: 'Signed In As', value: (row) => row.studentEmail ?? '' },
  { key: 'status', header: 'Status', value: (row) => statusLabels[row.status] ?? row.status },
  { key: 'reviewedAt', header: 'Reviewed', value: (row) => csvDateTime(row.reviewedAt) },
];

type Reading =
  | { kind: 'message'; row: ContactMessage }
  | { kind: 'report'; row: NavigationReport };

export default function AdminInboxPage() {
  // Both tables are personal data — names, addresses, whatever a student typed into a contact
  // form — and the database refuses them to anyone else. Saying so beats an empty table that
  // reads as "nobody has written to us".
  const canManage = adminAuthService.canManageContent();

  const [queue, setQueue] = useState<Queue>('messages');
  const [messageFilter, setMessageFilter] = useState<ContactMessageStatus | 'all'>('pending');
  const [reportFilter, setReportFilter] = useState<NavigationReportStatus | 'all'>('pending');
  const [reading, setReading] = useState<Reading | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadMessages = useCallback(() => submissionsService.listContactMessages(), []);
  const loadReports = useCallback(() => submissionsService.listNavigationReports(), []);

  // Both queues load whichever tab is showing, so the tab labels can carry a pending count.
  // A committee member who only ever opens the tab they were sent to otherwise never learns
  // there are route reports waiting.
  const messages = useQueue<ContactMessage>(loadMessages, canManage);
  const reports = useQueue<NavigationReport>(loadReports, canManage);
  const { replace: replaceMessage } = messages;
  const { replace: replaceReport } = reports;

  const sortedMessages = useMemo(
    () => (messages.rows ? [...messages.rows].sort(queueOrder(messageStatuses)) : null),
    [messages.rows],
  );
  const sortedReports = useMemo(
    () => (reports.rows ? [...reports.rows].sort(queueOrder(reportStatuses)) : null),
    [reports.rows],
  );

  const visibleMessages = useMemo(
    () => (sortedMessages ?? []).filter((row) => messageFilter === 'all' || row.status === messageFilter),
    [sortedMessages, messageFilter],
  );
  const visibleReports = useMemo(
    () => (sortedReports ?? []).filter((row) => reportFilter === 'all' || row.status === reportFilter),
    [sortedReports, reportFilter],
  );

  const pendingMessages = sortedMessages?.filter((row) => row.status === 'pending').length ?? null;
  const pendingReports = sortedReports?.filter((row) => row.status === 'pending').length ?? null;

  const moveMessage = useCallback(
    async (row: ContactMessage, status: ContactMessageStatus) => {
      setNotice(null);
      setActionError(null);
      setSavingId(row.id);

      try {
        const updated = await submissionsService.updateContactMessageStatus(row.id, status);
        replaceMessage(updated);
        setReading((current) =>
          current?.kind === 'message' && current.row.id === updated.id ? { kind: 'message', row: updated } : current,
        );
        setNotice(`${row.name}'s message is now ${statusLabels[status].toLowerCase()}.`);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'That message could not be updated.');
      } finally {
        setSavingId(null);
      }
    },
    [replaceMessage],
  );

  const moveReport = useCallback(
    async (row: NavigationReport, status: NavigationReportStatus) => {
      setNotice(null);
      setActionError(null);
      setSavingId(row.id);

      try {
        const updated = await submissionsService.updateNavigationReportStatus(row.id, status);
        replaceReport(updated);
        setReading((current) =>
          current?.kind === 'report' && current.row.id === updated.id ? { kind: 'report', row: updated } : current,
        );
        setNotice(`The report on “${row.route}” is now ${statusLabels[status].toLowerCase()}.`);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'That report could not be updated.');
      } finally {
        setSavingId(null);
      }
    },
    [replaceReport],
  );

  const messageColumns = useMemo<AdminTableColumn<ContactMessage>[]>(
    () => [
      {
        key: 'createdAt',
        header: 'Received',
        sortValue: (row) => row.createdAt,
        render: (row) => <span className="whitespace-nowrap text-slate-500">{formatDateTime(row.createdAt)}</span>,
      },
      {
        key: 'name',
        header: 'From',
        sortValue: (row) => row.name,
        render: (row) => (
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{row.name}</p>
            <a href={`mailto:${row.email}`} className="text-xs text-ieee-orange hover:underline">
              {row.email}
            </a>
          </div>
        ),
      },
      {
        key: 'category',
        header: 'Category',
        sortValue: (row) => row.category,
        render: (row) => (
          <span className="whitespace-nowrap rounded-full bg-ieee-orange/10 px-2.5 py-0.5 text-xs font-semibold text-ieee-orange">
            {row.category}
          </span>
        ),
      },
      {
        key: 'message',
        header: 'Message',
        render: (row) => (
          // A message runs to 4000 characters, so the cell is a way into the full text rather
          // than an attempt to show it. Reading it is the point of the page.
          <button
            type="button"
            onClick={() => setReading({ kind: 'message', row })}
            className="block max-w-[22rem] truncate text-left text-slate-700 underline-offset-2 hover:text-ieee-orange hover:underline"
            title="Read the full message"
          >
            {row.message}
          </button>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        sortValue: (row) => messageStatuses.indexOf(row.status),
        render: (row) => statusBadge(row.status),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <div className="flex justify-end gap-1.5">
            {messageMoves[row.status].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => void moveMessage(row, status)}
                disabled={savingId === row.id}
                className={quietButton}
              >
                {status === 'pending' ? 'Reopen' : statusLabels[status]}
              </button>
            ))}
          </div>
        ),
      },
    ],
    [savingId, moveMessage],
  );

  const reportColumns = useMemo<AdminTableColumn<NavigationReport>[]>(
    () => [
      {
        key: 'createdAt',
        header: 'Reported',
        sortValue: (row) => row.createdAt,
        render: (row) => <span className="whitespace-nowrap text-slate-500">{formatDateTime(row.createdAt)}</span>,
      },
      {
        key: 'route',
        header: 'Route',
        sortValue: (row) => row.route,
        render: (row) => <span className="font-medium text-slate-900">{row.route}</span>,
      },
      {
        key: 'issue',
        header: 'What is wrong',
        render: (row) => (
          <button
            type="button"
            onClick={() => setReading({ kind: 'report', row })}
            className="block max-w-[22rem] truncate text-left text-slate-700 underline-offset-2 hover:text-ieee-orange hover:underline"
            title="Read the full report"
          >
            {row.issue}
          </button>
        ),
      },
      {
        key: 'reporterName',
        header: 'Reporter',
        sortValue: (row) => row.reporterName ?? '',
        render: (row) =>
          row.reporterName ? row.reporterName : <span className="text-slate-400">Anonymous</span>,
      },
      {
        key: 'status',
        header: 'Status',
        sortValue: (row) => reportStatuses.indexOf(row.status),
        render: (row) => statusBadge(row.status),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <div className="flex justify-end gap-1.5">
            {reportMoves[row.status].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => void moveReport(row, status)}
                disabled={savingId === row.id}
                className={quietButton}
              >
                {status === 'pending' ? 'Reopen' : statusLabels[status]}
              </button>
            ))}
          </div>
        ),
      },
    ],
    [savingId, moveReport],
  );

  if (!canManage) {
    return (
      <div>
        <AdminTopbar title="Inbox" subtitle="Contact messages and navigation reports" />
        <div className="p-4 sm:p-6">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-black/5 bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <h3 className="font-display text-base font-bold text-slate-700">You do not have access</h3>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Every row here carries somebody&rsquo;s name and address, so only the webmaster, chairperson, vice
              chairperson and general secretary can open the inbox.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const active = queue === 'messages' ? messages : reports;
  const activeRows = queue === 'messages' ? visibleMessages : visibleReports;
  const activeFilter = queue === 'messages' ? messageFilter : reportFilter;

  const handleExport = () => {
    const suffix = activeFilter === 'all' ? '' : `-${activeFilter}`;
    if (queue === 'messages') {
      downloadCsv(csvFilename(`contact-messages${suffix}`), toCsv(visibleMessages, contactCsvColumns));
    } else {
      downloadCsv(csvFilename(`navigation-reports${suffix}`), toCsv(visibleReports, reportCsvColumns));
    }
  };

  return (
    <div>
      <AdminTopbar
        title="Inbox"
        subtitle="Contact messages and navigation reports students have sent"
        action={
          <button onClick={active.reload} disabled={active.loading} className={primaryButton}>
            <RefreshCw className={`h-4 w-4 ${active.loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      <div className="p-4 sm:p-6">
        {notice && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {notice}
          </div>
        )}
        {actionError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {actionError}
          </div>
        )}

        <div className="mb-4 inline-flex rounded-xl border border-black/5 bg-white p-1 shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
          <QueueTab
            active={queue === 'messages'}
            onClick={() => setQueue('messages')}
            icon={<Mail className="h-4 w-4" />}
            label="Contact Messages"
            pending={pendingMessages}
          />
          <QueueTab
            active={queue === 'reports'}
            onClick={() => setQueue('reports')}
            icon={<MapPinned className="h-4 w-4" />}
            label="Navigation Reports"
            pending={pendingReports}
          />
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {queue === 'messages'
              ? [...messageStatuses, 'all' as const].map((status) => (
                  <FilterChip
                    key={status}
                    active={messageFilter === status}
                    onClick={() => setMessageFilter(status)}
                    label={status === 'all' ? 'All' : statusLabels[status]}
                    count={
                      sortedMessages === null
                        ? null
                        : status === 'all'
                          ? sortedMessages.length
                          : sortedMessages.filter((row) => row.status === status).length
                    }
                  />
                ))
              : [...reportStatuses, 'all' as const].map((status) => (
                  <FilterChip
                    key={status}
                    active={reportFilter === status}
                    onClick={() => setReportFilter(status)}
                    label={status === 'all' ? 'All' : statusLabels[status]}
                    count={
                      sortedReports === null
                        ? null
                        : status === 'all'
                          ? sortedReports.length
                          : sortedReports.filter((row) => row.status === status).length
                    }
                  />
                ))}
          </div>

          {/* Exports what the filter is showing, and the filename says which cut it was — an
              archive of everything and this week's pending pile are different documents. */}
          {activeRows.length > 0 ? (
            <button onClick={handleExport} className={primaryButton}>
              <Download className="h-4 w-4" /> Export {activeRows.length}{' '}
              {activeRows.length === 1 ? 'row' : 'rows'} to CSV
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-500">
              <Download className="h-4 w-4" /> Nothing in this view to export
            </span>
          )}
        </div>

        {queue === 'reports' && (
          <p className="mb-4 rounded-xl border border-black/5 bg-white px-4 py-3 text-sm text-slate-600 shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            A route is corrected by editing the surveyed dataset in the repository, not from this screen. Marking a
            report <span className="font-semibold">fixed</span> records that the correction has been made there.{' '}
            <Link to="/portal/navigation" className="font-semibold text-ieee-orange hover:underline">
              What the map currently holds
            </Link>
          </p>
        )}

        {active.loading && active.rows === null ? (
          <div className="h-80 animate-pulse rounded-2xl border border-black/5 bg-white" />
        ) : active.rows === null ? (
          <div className="rounded-2xl border border-black/5 bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <h3 className="font-display text-base font-bold text-slate-700">This queue could not be read</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {active.error ?? 'The rows could not be loaded.'} There may well be submissions waiting — an empty table
              here would be a guess, so there is none.
            </p>
            <button onClick={active.reload} disabled={active.loading} className={`${primaryButton} mt-4`}>
              <RefreshCw className={`h-4 w-4 ${active.loading ? 'animate-spin' : ''}`} /> Try again
            </button>
          </div>
        ) : queue === 'messages' ? (
          <AdminTable
            columns={messageColumns}
            rows={visibleMessages}
            rowKey={(row) => row.id}
            pageSize={10}
            searchable={(row) => `${row.name} ${row.email} ${row.category} ${row.message}`}
            emptyTitle={messageFilter === 'pending' ? 'Nothing waiting' : 'No messages here'}
            emptyMessage={
              messageFilter === 'pending'
                ? 'Every message that has come in has been handled or archived. Switch to All to read them back.'
                : 'Messages sent through the contact form arrive here.'
            }
          />
        ) : (
          <AdminTable
            columns={reportColumns}
            rows={visibleReports}
            rowKey={(row) => row.id}
            pageSize={10}
            searchable={(row) => `${row.route} ${row.issue} ${row.reporterName ?? 'anonymous'}`}
            emptyTitle={reportFilter === 'pending' ? 'Nothing waiting' : 'No reports here'}
            emptyMessage={
              reportFilter === 'pending'
                ? 'No route corrections are outstanding. Switch to All to see the ones already dealt with.'
                : 'Reports sent from the navigation page arrive here.'
            }
          />
        )}
      </div>

      <AdminEditDrawer
        open={reading !== null}
        title={reading?.kind === 'report' ? 'Route report' : 'Contact message'}
        subtitle={reading ? formatDateTime(reading.row.createdAt) : undefined}
        onClose={() => {
          if (!savingId) setReading(null);
        }}
        footer={
          reading && (
            <div className="flex flex-wrap gap-2">
              {reading.kind === 'message'
                ? messageMoves[reading.row.status].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void moveMessage(reading.row, status)}
                      disabled={savingId === reading.row.id}
                      className={quietButton}
                    >
                      {status === 'pending' ? 'Reopen' : `Mark ${statusLabels[status].toLowerCase()}`}
                    </button>
                  ))
                : reportMoves[reading.row.status].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void moveReport(reading.row, status)}
                      disabled={savingId === reading.row.id}
                      className={quietButton}
                    >
                      {status === 'pending' ? 'Reopen' : `Mark ${statusLabels[status].toLowerCase()}`}
                    </button>
                  ))}
            </div>
          )
        }
      >
        {reading?.kind === 'message' && (
          <div className="flex flex-col gap-4">
            <DrawerRow label="From">{reading.row.name}</DrawerRow>
            <DrawerRow label="Reply to">
              <a href={`mailto:${reading.row.email}`} className="text-ieee-orange hover:underline">
                {reading.row.email}
              </a>
            </DrawerRow>
            {/* The address above is whatever they typed into the form. This one is the account
                they were signed in to, stamped by the database, and is the only one of the two
                that proves who wrote the message. */}
            <DrawerRow label="Signed in as">
              {reading.row.studentEmail ?? <span className="text-slate-400">Not signed in</span>}
            </DrawerRow>
            <DrawerRow label="Category">{reading.row.category}</DrawerRow>
            <DrawerRow label="Status">{statusBadge(reading.row.status)}</DrawerRow>
            {reading.row.handledAt && (
              <DrawerRow label="Handled">{formatDateTime(reading.row.handledAt)}</DrawerRow>
            )}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Message</p>
              <p className="mt-1.5 whitespace-pre-wrap break-words rounded-xl border border-black/5 bg-white px-3.5 py-3 text-sm text-slate-700">
                {reading.row.message}
              </p>
            </div>
          </div>
        )}

        {reading?.kind === 'report' && (
          <div className="flex flex-col gap-4">
            <DrawerRow label="Route">{reading.row.route}</DrawerRow>
            <DrawerRow label="Reporter">
              {reading.row.reporterName || <span className="text-slate-400">Anonymous</span>}
            </DrawerRow>
            <DrawerRow label="Signed in as">
              {reading.row.studentEmail ?? <span className="text-slate-400">Not signed in</span>}
            </DrawerRow>
            <DrawerRow label="Status">{statusBadge(reading.row.status)}</DrawerRow>
            {reading.row.reviewedAt && (
              <DrawerRow label="Reviewed">{formatDateTime(reading.row.reviewedAt)}</DrawerRow>
            )}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-slate-400">What is wrong</p>
              <p className="mt-1.5 whitespace-pre-wrap break-words rounded-xl border border-black/5 bg-white px-3.5 py-3 text-sm text-slate-700">
                {reading.row.issue}
              </p>
            </div>
          </div>
        )}
      </AdminEditDrawer>
    </div>
  );
}

function QueueTab({
  active,
  onClick,
  icon,
  label,
  pending,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  /** Null while the queue has not been read — a zero there would be a claim, not a count. */
  pending: number | null;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
        active ? 'bg-ieee-orange text-white shadow-sm' : 'text-slate-500 hover:text-ieee-orange'
      }`}
    >
      {icon}
      {label}
      {pending !== null && pending > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
            active ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {pending}
        </span>
      )}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number | null;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? 'border-ieee-orange bg-ieee-orange/10 text-ieee-orange'
          : 'border-black/5 bg-white text-slate-500 hover:border-ieee-orange/40 hover:text-ieee-orange'
      }`}
    >
      {label}
      {count !== null && <span className="ml-1.5 font-mono text-[10px] opacity-60">{count}</span>}
    </button>
  );
}

function DrawerRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}
