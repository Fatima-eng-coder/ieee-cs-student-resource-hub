import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, BarChart3, Eye, EyeOff, Trash2, ClipboardList, Ticket } from 'lucide-react';
import type { FormDef, FormStatus } from '@/types';
import { formsService, type FormLinkImpact } from '@/services/formsService';
import { adminAuthService } from '@/services/adminAuthService';
import { announcementsService } from '@/services/announcementsService';
import { eventsService } from '@/services/eventsService';
import AdminTopbar from '@/components/admin/AdminTopbar';
import ConfirmLinkedDelete, { type LinkedItemRef } from '@/components/admin/ConfirmLinkedDelete';

/**
 * Three states, not two. 'draft' arrived with the database and used to render as "Disabled",
 * which read as "this was switched off" for a form that had simply never been published.
 */
const statusMeta: Record<FormStatus, { label: string; tone: string; action: string }> = {
  draft: { label: 'Draft', tone: 'bg-amber-50 text-amber-700', action: 'Publish' },
  open: { label: 'Open', tone: 'bg-emerald-50 text-emerald-700', action: 'Close' },
  closed: { label: 'Closed', tone: 'bg-slate-100 text-slate-500', action: 'Reopen' },
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Deleting a form always deletes its responses — form_responses cascades off it — so the
 * number is stated before the click rather than discovered afterwards. An unreadable count
 * says so instead of reporting the zero it does not know.
 */
const describeResponseLoss = (count: number | null) => {
  if (count === null) return 'Every response it has collected is deleted with it. The count could not be read.';
  if (count === 0) return 'It has collected no responses yet.';
  return `${plural(count, 'response')} collected through it ${count === 1 ? 'is' : 'are'} deleted with it, permanently.`;
};

const LOOKUP_FAILED =
  'We could not check which events or announcements use this form. Deleting it now will leave any of them without a sign-up form.';

export default function AdminFormsPage() {
  const [forms, setForms] = useState<FormDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<FormDef | null>(null);
  const [impact, setImpact] = useState<FormLinkImpact | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  // The form the two above answer for. React commits the render that opens the dialog
  // before the effect below runs, so an untagged answer is read as this form's: cancel on
  // one form and open another and the second dialog would show the first one's linked items
  // and response count, with Delete already enabled.
  const [impactFor, setImpactFor] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const refresh = () =>
    formsService
      .listAll()
      .then((data) => {
        setForms(data);
        setError('');
      })
      // Without this a failed read left the skeletons pulsing for ever, which reads as
      // "still loading" rather than "this did not work".
      .catch((cause: Error) => setError(cause.message || 'Forms could not be loaded right now.'))
      .finally(() => setLoading(false));

  useEffect(() => {
    refresh();
  }, []);

  const toggle = async (form: FormDef) => {
    try {
      await (form.status === 'open' ? formsService.close(form.id) : formsService.publish(form.id));
      await refresh();
    } catch (cause) {
      // `|| fallback` rather than `instanceof` alone: an Error carrying an empty message
      // passes the type check and then shows the admin a blank banner.
      setError((cause instanceof Error && cause.message) || 'Could not change that form.');
    }
  };

  // The links are looked up when the dialog opens, not while the list renders: the answer is
  // read once, by one dialog, and asking per row would be two extra queries per form on
  // every visit to a page where nothing is being deleted.
  useEffect(() => {
    setImpact(null);
    setImpactError(null);
    setImpactFor(null);
    if (!deleting) return;

    const formId = deleting.id;
    let alive = true;

    formsService
      .linkImpact(formId)
      .then((next) => {
        if (alive) {
          setImpact(next);
          setImpactFor(formId);
        }
      })
      .catch(() => {
        if (alive) {
          setImpactError(LOOKUP_FAILED);
          setImpactFor(formId);
        }
      });

    return () => {
      alive = false;
    };
  }, [deleting]);

  // Until the lookup has answered for the form on screen, the dialog is still asking —
  // which is the state it has to be in on its very first frame too, before the effect above
  // has had a chance to run.
  const impactSettled = !!deleting && impactFor === deleting.id;
  const currentImpact = impactSettled ? impact : null;
  const impactLoading = !!deleting && !impactSettled;

  /**
   * Ordering, which is the whole of this function.
   *
   * Cascading: the linked events and announcements go first, one at a time, and the form
   * goes last. Every item deleted removes a reference, so a refusal part-way through leaves
   * the form alive with the remaining items still attached to it — which is exactly what the
   * list shows on the next refresh and what clicking Delete again finishes. Deleting the
   * form first would instead strip the attachment off items the admin asked to have deleted,
   * not detached, and leave no record of which ones they were.
   *
   * Not cascading: the survivors are put back to "no form" before the form goes, so nothing
   * is ever left pointing at a row that does not exist. The database would cover this on its
   * own — form_id is ON DELETE SET NULL and a trigger resets form_source with it — but only
   * where that trigger is deployed, and it would not correct the admin's open list. Doing it
   * first also means the destructive step is last: if the form delete is refused, the items
   * still exist and are merely unattached, and the message below says so by name rather than
   * leaving the admin to find out from a Register button that vanished.
   */
  const confirmDelete = async (cascade: boolean) => {
    const form = deleting;
    if (!form) return;
    // Defence in depth behind the same check the events and announcements pages make: the
    // policies refuse a non-manager anyway, and refusing here says so in words.
    if (!canManage) {
      setError('You do not have permission to manage forms.');
      setDeleting(null);
      return;
    }

    const linkedEvents = currentImpact?.events ?? [];
    const linkedAnnouncements = currentImpact?.announcements ?? [];
    const linkedCount = linkedEvents.length + linkedAnnouncements.length;
    let itemsRemoved = 0;
    let detached = false;
    let failure = '';

    setDeleteBusy(true);
    setError('');
    try {
      if (cascade) {
        for (const event of linkedEvents) {
          await eventsService.remove(event.id);
          itemsRemoved += 1;
          // Artwork after the row, and only as a courtesy: had the row delete been refused,
          // an already-deleted image would leave a live event showing a broken poster. A
          // leaked storage object is the cheaper of the two failures.
          if (event.coverImagePath) {
            void eventsService.removeCoverImage(event.coverImagePath).catch((cause) => {
              console.warn('Event cover could not be removed after a cascading delete', cause);
            });
          }
        }
        for (const announcement of linkedAnnouncements) {
          await announcementsService.remove(announcement.id);
          itemsRemoved += 1;
        }
      } else if (linkedCount > 0) {
        if (linkedEvents.length > 0) await eventsService.detachForm(form.id);
        if (linkedAnnouncements.length > 0) await announcementsService.detachForm(form.id);
        detached = true;
      }

      await formsService.remove(form.id);
    } catch (cause) {
      const reason = (cause instanceof Error && cause.message) || 'Could not delete that form.';
      // Whatever went wrong, say what did happen before it did — half a cascade with no
      // account of it is the state an admin cannot reason about.
      failure = detached
        ? `${reason} The form was not deleted, and ${plural(linkedCount, 'item')} no longer use it — re-attach it from each one if you still need it.`
        : itemsRemoved > 0
          ? `${reason} ${plural(itemsRemoved, 'linked item')} had already been deleted; the rest, and the form itself, are untouched.`
          : reason;
    }

    // Closed and reloaded either way: the list behind the dialog is the honest record of
    // what survived. The message is set after the reload because a successful refresh
    // clears the error banner.
    setDeleting(null);
    setDeleteBusy(false);
    await refresh();
    if (failure) setError(failure);
  };

  const fieldCount = (f: FormDef) => f.pages.reduce((n, p) => n + p.fields.length, 0);

  const linkedItems: LinkedItemRef[] = [
    ...(currentImpact?.events ?? []).map((event) => ({
      id: `event-${event.id}`,
      title: event.title,
      detail: `Event · ${event.date}`,
    })),
    ...(currentImpact?.announcements ?? []).map((announcement) => ({
      id: `announcement-${announcement.id}`,
      title: announcement.title,
      detail: `Announcement · ${announcement.date}`,
    })),
  ];

  return (
    <>
      <AdminTopbar title="Forms" />
      <div className="p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm text-slate-500">Create forms for students to fill — responses collect here.</p>
          <Link
            to="/portal/forms/new"
            className="flex items-center gap-1.5 rounded-lg bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
          >
            <Plus className="h-4 w-4" /> New Form
          </Link>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">No forms yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Build one here and you can attach it to an event or an announcement, cap the number
              of seats, and export every response as a spreadsheet.
            </p>
            <Link
              to="/portal/forms/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> New Form
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {forms.map((form) => (
              <div
                key={form.id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ieee-orange/10 text-ieee-orange">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{form.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta[form.status].tone}`}>
                      {statusMeta[form.status].label}
                    </span>
                    {form.isDefault && (
                      <span className="rounded-full bg-ieee-orange/10 px-2 py-0.5 text-[11px] font-semibold text-ieee-orange">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-500">{form.description || 'No description'}</p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-slate-400">
                    {fieldCount(form)} fields · {form.pages.length} {form.pages.length === 1 ? 'page' : 'pages'} ·{' '}
                    {/* null means the count could not be read. React renders null as nothing,
                        so without this the line read "… · responses" — a gap that looks like a
                        rendering bug rather than the honest "we do not know" it stands for. */}
                    {formsService.responseCount(form.id) ?? '—'} responses
                    {form.maxResponses != null && (
                      <span className="ml-1 inline-flex items-center gap-1 text-ieee-orange">
                        <Ticket className="h-3 w-3" /> capped at {form.maxResponses}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/portal/forms/${form.id}/responses`}
                    className="flex items-center gap-1.5 rounded-lg border border-ieee-orange/30 bg-ieee-orange/5 px-3 py-2 text-xs font-semibold text-ieee-orange hover:border-ieee-orange"
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> Responses
                    <span className="rounded-full bg-ieee-orange/10 px-1.5 py-0.5 font-mono text-[10px]">
                      {formsService.responseCount(form.id) ?? '—'}
                    </span>
                  </Link>
                  <Link
                    to={`/portal/forms/${form.id}/edit`}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-ieee-orange hover:text-ieee-orange"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Link>
                  <button
                    onClick={() => toggle(form)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300"
                  >
                    {form.status === 'open' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {statusMeta[form.status].action}
                  </button>
                  <button
                    onClick={() => setDeleting(form)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmLinkedDelete
        open={!!deleting}
        title={deleting ? `Delete "${deleting.title}"?` : 'Delete this form?'}
        description="The form and its questions are removed from the site."
        // Withheld until the lookup lands, so "the count could not be read" is never shown
        // for a count that is merely still in flight.
        losses={impactLoading ? undefined : [describeResponseLoss(currentImpact?.responseCount ?? null)]}
        loading={impactLoading}
        lookupError={impactSettled ? impactError : null}
        busy={deleteBusy}
        linked={
          linkedItems.length > 0
            ? {
                heading: `${plural(linkedItems.length, 'item')} on the site ${
                  linkedItems.length === 1 ? 'collects' : 'collect'
                } sign-ups through this form.`,
                items: linkedItems,
                cascadeLabel: `Delete ${linkedItems.length === 1 ? 'it' : 'them'} as well`,
                cascadeHint: `Leave this off to keep ${
                  linkedItems.length === 1 ? 'it' : 'them'
                } on the site with no sign-up form.`,
                cascadeWarning: `${
                  linkedItems.length === 1 ? 'This item' : 'These items'
                } will be removed from the public site too, along with any artwork uploaded for ${
                  linkedItems.length === 1 ? 'it' : 'them'
                }.`,
              }
            : null
        }
        onCancel={() => setDeleting(null)}
        onConfirm={(cascade) => void confirmDelete(cascade)}
      />
    </>
  );
}
