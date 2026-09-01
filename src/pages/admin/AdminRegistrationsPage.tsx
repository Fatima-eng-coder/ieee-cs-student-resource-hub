import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, Download, ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import { AdminField, AdminSelect } from '@/components/admin/AdminField';
import { adminAuthService } from '@/services/adminAuthService';
import { eventsService, type AdminEvent } from '@/services/eventsService';
import { submissionsService, type EventRegistration } from '@/services/submissionsService';
import { csvFilename, downloadCsv, toCsv, type CsvColumn } from '@/utils/csv';

const primaryButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-60';

const quietButton =
  'flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:cursor-not-allowed disabled:opacity-50';

function formatEventDate(date: string): string {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return date;
  return value.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
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

const registrationCsvColumns: CsvColumn<EventRegistration>[] = [
  { key: 'name', header: 'Name' },
  { key: 'email', header: 'Email' },
  { key: 'rollNumber', header: 'Roll Number', value: (row) => row.rollNumber ?? '' },
  { key: 'batch', header: 'Batch', value: (row) => row.batch ?? '' },
  { key: 'studentEmail', header: 'Signed In As', value: (row) => row.studentEmail ?? '' },
  { key: 'createdAt', header: 'Registered', value: (row) => csvDateTime(row.createdAt) },
];

export default function AdminRegistrationsPage() {
  // Registrations carry names, addresses and roll numbers, and the database refuses them to
  // anyone but a content manager. Say so rather than render an empty table.
  const canManage = adminAuthService.canManageContent();

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('event') ?? '';

  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Null until the rows have actually been read. An empty array is an event nobody signed up
  // for, and a page that cannot tell the two apart reports "no sign-ups" about a full room.
  const [registrations, setRegistrations] = useState<EventRegistration[] | null>(null);
  const [registrationsError, setRegistrationsError] = useState<string | null>(null);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  // `registrations === null` meant two different things — "no read has happened" and "the read
  // failed" — and the failure panel keyed on the null. So arriving with no event chosen, or
  // with no events in the database at all, announced that sign-ups could not be loaded when
  // nothing had been asked for. This separates the two.
  const [attempted, setAttempted] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!canManage) {
      setEventsLoading(false);
      return;
    }

    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);

    eventsService
      .listAdmin()
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setEvents(null);
        setEventsError(err instanceof Error ? err.message : 'The events list could not be read.');
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canManage]);

  const selected = useMemo(
    () => events?.find((event) => event.id === selectedId) ?? null,
    [events, selectedId],
  );

  // Land on the newest event rather than on nothing. listAdmin sorts by date descending, so
  // that is the row an admin has most likely come here about.
  useEffect(() => {
    if (!events?.length || selected) return;
    setSearchParams({ event: events[0].id }, { replace: true });
  }, [events, selected, setSearchParams]);

  useEffect(() => {
    if (!canManage || !selectedId) return;

    let cancelled = false;
    // Dropped before the new read rather than after it: keeping the previous event's rows on
    // screen while another event's heading is above them attributes one event's attendees to
    // another, which is exactly the list somebody prints and takes to the door.
    setRegistrations(null);
    setRegistrationsLoading(true);
    setRegistrationsError(null);
    setAttempted(true);

    submissionsService
      .listRegistrations(selectedId)
      .then((rows) => {
        if (!cancelled) setRegistrations(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setRegistrations(null);
        setRegistrationsError(err instanceof Error ? err.message : 'The sign-ups could not be read.');
      })
      .finally(() => {
        if (!cancelled) setRegistrationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canManage, selectedId, reloadToken]);

  const columns = useMemo<AdminTableColumn<EventRegistration>[]>(
    () => [
      {
        key: 'name',
        header: 'Name',
        sortValue: (row) => row.name,
        render: (row) => <span className="font-medium text-slate-900">{row.name}</span>,
      },
      {
        key: 'email',
        header: 'Email',
        sortValue: (row) => row.email,
        render: (row) => (
          <a href={`mailto:${row.email}`} className="text-ieee-orange hover:underline">
            {row.email}
          </a>
        ),
      },
      {
        key: 'rollNumber',
        header: 'Roll Number',
        sortValue: (row) => row.rollNumber ?? '',
        render: (row) => row.rollNumber || <span className="text-slate-300">—</span>,
      },
      {
        key: 'batch',
        header: 'Batch',
        sortValue: (row) => row.batch ?? '',
        render: (row) => row.batch || <span className="text-slate-300">—</span>,
      },
      {
        key: 'createdAt',
        header: 'Registered',
        sortValue: (row) => row.createdAt,
        render: (row) => <span className="whitespace-nowrap text-slate-500">{formatDateTime(row.createdAt)}</span>,
      },
    ],
    [],
  );

  if (!canManage) {
    return (
      <div>
        <AdminTopbar title="Registrations" subtitle="Who signed up for an event" />
        <div className="p-4 sm:p-6">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-black/5 bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <h3 className="font-display text-base font-bold text-slate-700">You do not have access</h3>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Sign-ups carry names, addresses and roll numbers, so only the webmaster, chairperson, vice chairperson
              and general secretary can read them.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleExport = () => {
    if (!selected || !registrations?.length) return;
    downloadCsv(csvFilename(`${selected.title}-registrations`), toCsv(registrations, registrationCsvColumns));
  };

  // Where an event's sign-ups actually go. An internal form collects into form_responses and
  // an external link collects on somebody else's server; in both cases event_registrations is
  // the wrong place to look, and an empty table here would read as "nobody came".
  const collectsElsewhere =
    selected?.formSource === 'internal' && selected.formId
      ? ('internal' as const)
      : selected?.formSource === 'external' && selected.externalFormUrl
        ? ('external' as const)
        : null;

  // Rows can exist even on an event that has since had a form attached — anyone who signed up
  // before the switch, or who reached /events/:id/register directly, is in this table. Those
  // are real people and are still shown; what changes is that the pointer above comes first.
  const hasDirectRows = Boolean(registrations?.length);

  return (
    <div>
      <AdminTopbar
        title="Registrations"
        subtitle="Who signed up for an event"
        action={
          <button
            onClick={() => setReloadToken((token) => token + 1)}
            disabled={registrationsLoading || !selectedId}
            className={primaryButton}
          >
            <RefreshCw className={`h-4 w-4 ${registrationsLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      <div className="p-4 sm:p-6">
        {eventsError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {eventsError}
          </div>
        )}

        <section className="mb-4 rounded-2xl border border-black/5 bg-white p-4 shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
          <AdminField label="Event">
            <AdminSelect
              value={selectedId}
              disabled={eventsLoading || !events?.length}
              onChange={(event) => setSearchParams({ event: event.target.value })}
            >
              {eventsLoading && <option value="">Loading events…</option>}
              {!eventsLoading && !events?.length && <option value="">No events to choose from</option>}
              {events?.map((event) => (
                <option key={event.id} value={event.id}>
                  {formatEventDate(event.date)} · {event.title}
                  {event.isPublished ? '' : ' (draft)'}
                </option>
              ))}
            </AdminSelect>
          </AdminField>

          {selected && (
            <p className="mt-3 text-sm text-slate-500">
              {selected.venue} · {selected.time}
              {selected.capacity > 0 && ` · ${selected.capacity} seats`}
              {' · '}
              <Link to="/portal/events" className="font-semibold text-ieee-orange hover:underline">
                Edit event
              </Link>
            </p>
          )}
        </section>

        {collectsElsewhere === 'internal' && selected?.formId && (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-ieee-orange/30 bg-ieee-orange/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ieee-orange/15 text-ieee-orange">
                <ClipboardList className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="font-display text-sm font-bold text-slate-900">This event signs people up through a form</p>
                <p className="mt-0.5 text-sm text-slate-600">
                  Its sign-ups are form responses, not rows in this table. Open the form to read and export them.
                </p>
              </div>
            </div>
            <Link to={`/portal/forms/${selected.formId}/responses`} className={primaryButton}>
              Open the responses
            </Link>
          </div>
        )}

        {collectsElsewhere === 'external' && selected?.externalFormUrl && (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <ExternalLink className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="font-display text-sm font-bold text-slate-900">
                  This event registers people on another site
                </p>
                <p className="mt-0.5 text-sm text-amber-900">
                  Nothing about those sign-ups reaches this database, so there is no list here to export. They are
                  wherever that form keeps them.
                </p>
              </div>
            </div>
            <a
              href={selected.externalFormUrl}
              target="_blank"
              rel="noreferrer"
              className={`${quietButton} whitespace-nowrap`}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open the form
            </a>
          </div>
        )}

        {registrationsError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {registrationsError}
          </div>
        )}

        {/* An event that collects elsewhere and has no direct rows gets no table at all: the
            pointer above is the whole answer, and an empty grid under it would only invite the
            conclusion that nobody signed up. */}
        {(!collectsElsewhere || hasDirectRows || registrations === null) && (
          <>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  {collectsElsewhere ? 'Also signed up directly' : 'Sign-ups'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {registrations === null && !attempted
                    ? 'Pick an event to see who has signed up.'
                    : registrations === null
                    ? 'These could not be read, so nothing below counts as this event’s sign-ups.'
                    : collectsElsewhere
                      ? `${registrations.length} ${
                          registrations.length === 1 ? 'person' : 'people'
                        } registered through the site’s own form, most likely before the form above was attached.`
                      : registrations.length === 0
                        ? 'Nobody has signed up yet.'
                        : `${registrations.length} ${registrations.length === 1 ? 'person' : 'people'}, newest first.`}
                </p>
              </div>

              {registrations?.length ? (
                <button onClick={handleExport} className={primaryButton}>
                  <Download className="h-4 w-4" /> Export {registrations.length}{' '}
                  {registrations.length === 1 ? 'sign-up' : 'sign-ups'} to CSV
                </button>
              ) : (
                <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-500">
                  <Download className="h-4 w-4" /> Nothing to export yet
                </span>
              )}
            </div>

            {(registrationsLoading || !attempted) && registrations === null ? (
              <div className="h-80 animate-pulse rounded-2xl border border-black/5 bg-white" />
            ) : registrations === null ? (
              <div className="rounded-2xl border border-black/5 bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                  <ShieldAlert className="h-6 w-6" />
                </span>
                <h3 className="font-display text-base font-bold text-slate-700">Sign-ups could not be loaded</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                  {registrationsError ?? 'The rows could not be read.'} This event may well have sign-ups — an empty
                  table here would be a guess, so there is none.
                </p>
                <button
                  onClick={() => setReloadToken((token) => token + 1)}
                  disabled={registrationsLoading}
                  className={`${primaryButton} mt-4`}
                >
                  <RefreshCw className={`h-4 w-4 ${registrationsLoading ? 'animate-spin' : ''}`} /> Try again
                </button>
              </div>
            ) : (
              <AdminTable
                columns={columns}
                rows={registrations}
                rowKey={(row) => row.id}
                pageSize={10}
                searchable={(row) => `${row.name} ${row.email} ${row.rollNumber ?? ''} ${row.batch ?? ''}`}
                emptyTitle="No sign-ups yet"
                emptyMessage="People who register on the event page appear here straight away."
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
