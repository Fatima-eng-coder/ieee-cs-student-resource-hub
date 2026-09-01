import { useEffect, useState } from 'react';
import { Loader2, Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect, AdminTextarea } from '@/components/admin/AdminField';
import ConfirmLinkedDelete from '@/components/admin/ConfirmLinkedDelete';
import EmptyState from '@/components/ui/EmptyState';
import FormAttachmentField, { PromotionFields } from '@/components/admin/FormAttachmentField';
import { adminAuthService } from '@/services/adminAuthService';
import { announcementsService, type AdminAnnouncement } from '@/services/announcementsService';
import { eventsService } from '@/services/eventsService';
import { formsService, type FormLinkImpact } from '@/services/formsService';
import type { Announcement } from '@/types';

const categories: Announcement['category'][] = ['general', 'event', 'academic', 'navigation', 'projects'];

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Deleting a form takes its responses with it — form_responses cascades off forms — so the
 * number is put in front of the admin before the click, and an unreadable count says so
 * rather than reporting the zero it does not know.
 */
const describeFormLoss = (count: number | null) => {
  if (count === null) return 'Its questions and every response it holds go with it. The response count could not be read.';
  if (count === 0) return 'It has collected no responses yet.';
  return `${plural(count, 'response')} collected through it ${count === 1 ? 'is' : 'are'} deleted too, permanently.`;
};

const LOOKUP_FAILED =
  'We could not read the form attached to this announcement, so its responses cannot be counted here. Deleting the announcement leaves the form itself untouched.';

/**
 * PostgREST can answer with an empty message — a 401 on this project's form_responses count
 * does exactly that — and the banner below only renders a non-empty string. Without the
 * fallback a failed delete would look identical to a cancelled one.
 */
const getCleanError = (err: unknown, fallback: string) => (err instanceof Error && err.message) || fallback;

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';

const emptyAnnouncement = (): AdminAnnouncement => ({
  id: '',
  title: '',
  summary: '',
  body: '',
  date: new Date().toISOString().slice(0, 10),
  category: 'general',
  pinned: false,
  formSource: 'none',
  externalFormUrl: null,
  formId: null,
  promoted: false,
  promoHeadline: '',
  promoCtaLabel: '',
  promoStartsAt: null,
  promoEndsAt: null,
  promoSort: 0,
});

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminAnnouncement | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleting, setDeleting] = useState<AdminAnnouncement | null>(null);
  const [impact, setImpact] = useState<FormLinkImpact | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  // The form the two above answer for. React commits the render that opens the dialog before
  // the effect below runs, so an untagged answer is read as this announcement's form —
  // including the absence of one, which reads as "nothing is attached" on the opening frame.
  const [impactFor, setImpactFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setAnnouncements(await announcementsService.list());
    } catch (err) {
      setError(getCleanError(err, 'Failed to load announcements.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!draft || !draft.title.trim() || !draft.summary.trim()) {
      setError('Title and summary are required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await announcementsService.create(draft);
        setAnnouncements((items) => [created, ...items]);
      } else {
        const updated = await announcementsService.update(draft.id, draft);
        setAnnouncements((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      }
      setDraft(null);
    } catch (err) {
      setError(getCleanError(err, 'Failed to save announcement.'));
    } finally {
      setSaving(false);
    }
  };

  // Only an internal form is a row in this database; an external link is a URL on the
  // announcement and disappears with it, so there is nothing to offer to delete.
  const attachedFormId = deleting?.formSource === 'internal' ? deleting.formId : null;

  // Read when the dialog opens, not per list render: the table already shows whether a form
  // is attached, and the response count only matters at the moment one is about to go.
  useEffect(() => {
    setImpact(null);
    setImpactError(null);
    setImpactFor(null);
    if (!attachedFormId) return;

    let alive = true;

    formsService
      .linkImpact(attachedFormId)
      .then((next) => {
        if (alive) {
          setImpact(next);
          setImpactFor(attachedFormId);
        }
      })
      .catch(() => {
        if (alive) {
          setImpactError(LOOKUP_FAILED);
          setImpactFor(attachedFormId);
        }
      });

    return () => {
      alive = false;
    };
  }, [attachedFormId]);

  // Until the lookup has answered for the form this announcement points at, the dialog is
  // still asking — and with nothing attached there is nothing to ask, so both are null and
  // it is settled.
  const impactSettled = impactFor === attachedFormId;
  const currentImpact = impactSettled ? impact : null;
  const impactLoading = !!attachedFormId && !impactSettled;

  /** Items other than this one that share the attached form. */
  const otherUsers = [
    ...(currentImpact?.events ?? []).map((event) => event.title),
    ...(currentImpact?.announcements ?? [])
      .filter((announcement) => announcement.id !== deleting?.id)
      .map((announcement) => announcement.title),
  ];

  /**
   * The announcement row goes first: it is the reference, so once it is gone nothing points
   * at the form and any later failure leaves a form that merely exists. Deleting the form
   * first would leave this announcement pointing at a row that is not there, saved only by a
   * database trigger — and not saved at all in the list on screen.
   *
   * Then, if the admin ticked the box, every other item sharing the form is put back to "no
   * form" before the form itself is deleted, so no surviving row is left pointing at it.
   */
  const confirmDelete = async (cascade: boolean) => {
    const announcement = deleting;
    if (!announcement) return;
    // Defence in depth behind the same check the events page makes: the policies refuse a
    // non-manager anyway, and refusing here says so in words.
    if (!canManage) {
      setError('You do not have permission to manage announcements.');
      setDeleting(null);
      return;
    }

    const formId = announcement.formSource === 'internal' ? announcement.formId : null;
    const formTitle = currentImpact?.title ?? 'its sign-up form';
    let announcementRemoved = false;
    let detachedSiblings = false;
    let failure = '';

    setSaving(true);
    setError(null);
    try {
      await announcementsService.remove(announcement.id);
      announcementRemoved = true;
      setAnnouncements((items) => items.filter((item) => item.id !== announcement.id));

      if (cascade && formId) {
        if (otherUsers.length > 0) {
          await eventsService.detachForm(formId);
          await announcementsService.detachForm(formId);
          detachedSiblings = true;
        }
        await formsService.remove(formId);
      }
    } catch (err) {
      const reason = getCleanError(err, 'Failed to delete announcement.');
      failure =
        announcementRemoved && cascade
          ? `${reason} The announcement was deleted, but "${formTitle}" was not — delete it from Forms if you still want it gone.`
          : reason;
    }

    setDeleting(null);
    setSaving(false);

    // Sibling announcements that just lost their form still say "Site form" in state, and
    // unlike the events list this one has no realtime subscription to correct them. The
    // reload comes before the message because load() clears the error banner on its way in.
    if (detachedSiblings) await load();
    if (failure) setError(failure);
  };

  const columns: AdminTableColumn<AdminAnnouncement>[] = [
    {
      key: 'title',
      header: 'Title',
      sortValue: (a) => a.title,
      render: (a) => (
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-900">{a.title}</span>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sortValue: (a) => a.category, render: (a) => <span className="capitalize">{a.category}</span> },
    { key: 'date', header: 'Date', sortValue: (a) => a.date, render: (a) => a.date },
    {
      key: 'pinned',
      header: 'Pinned',
      render: (a) =>
        a.pinned ? (
          <span className="inline-flex items-center gap-1 text-ieee-orange">
            <Pin className="h-3.5 w-3.5" /> Yes
          </span>
        ) : (
          <span className="text-slate-400">No</span>
        ),
    },
    {
      key: 'promoted',
      header: 'Homepage',
      sortValue: (a) => (a.promoted ? 'promoted' : 'no'),
      render: (a) =>
        a.promoted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-ieee-yellow/40 px-2.5 py-0.5 text-xs font-semibold text-ieee-black">
            <Megaphone className="h-3.5 w-3.5" /> Promoted
          </span>
        ) : (
          <span className="text-slate-400">No</span>
        ),
    },
    {
      key: 'form',
      header: 'Form',
      sortValue: (a) => a.formSource,
      render: (a) =>
        a.formSource === 'none' ? (
          <span className="text-slate-400">None</span>
        ) : (
          <span className="font-medium text-slate-600">
            {a.formSource === 'internal' ? 'Site form' : 'Linked form'}
          </span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) =>
        canManage ? (
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                setDraft(a);
                setIsNew(false);
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button type="button" className={dangerBtn} onClick={() => setDeleting(a)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Read only</span>
        ),
    },
  ];

  return (
    <div>
      <AdminTopbar
        title="Announcements"
        subtitle="Posts shown on the public Announcements page"
        action={
          canManage ? (
            <button
              onClick={() => {
                setDraft(emptyAnnouncement());
                setIsNew(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> New Announcement
            </button>
          ) : undefined
        }
      />

      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
        {loading ? (
          <EmptyState title="Loading announcements" description="Fetching the latest published posts." />
        ) : (
          <AdminTable
            columns={columns}
            rows={announcements}
            rowKey={(a) => a.id}
            searchable={(a) => `${a.title} ${a.summary} ${a.category}`}
            emptyMessage="No announcements have been published yet."
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'New Announcement' : 'Edit Announcement'}
        subtitle="Saved changes appear on the public announcements page."
        onClose={() => setDraft(null)}
        footer={
          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-70"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <AdminField label="Title" required>
              <AdminInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </AdminField>
            <AdminField label="Summary" required hint="Shown in the list">
              <AdminInput value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
            </AdminField>
            <AdminField label="Body">
              <AdminTextarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </AdminField>
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Category">
                <AdminSelect value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Announcement['category'] })}>
                  {categories.map((c) => (
                    <option key={c} value={c} className="capitalize">
                      {c}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Date">
                <AdminInput type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </AdminField>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={!!draft.pinned}
                onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
                className="accent-ieee-orange"
              />
              Pin to top
            </label>
            <FormAttachmentField
              itemNoun="announcement"
              value={{
                formSource: draft.formSource,
                externalFormUrl: draft.externalFormUrl,
                formId: draft.formId,
              }}
              onChange={(attachment) => setDraft({ ...draft, ...attachment })}
            />
            <PromotionFields
              itemNoun="announcement"
              fallbackHeadline={draft.title}
              value={{
                promoted: draft.promoted,
                promoHeadline: draft.promoHeadline,
                promoCtaLabel: draft.promoCtaLabel,
                promoStartsAt: draft.promoStartsAt,
                promoEndsAt: draft.promoEndsAt,
                promoSort: draft.promoSort,
              }}
              onChange={(promotion) => setDraft({ ...draft, ...promotion })}
            />
          </div>
        )}
      </AdminEditDrawer>

      <ConfirmLinkedDelete
        open={!!deleting}
        title="Delete this announcement?"
        description="This announcement will no longer appear on the public site."
        loading={impactLoading}
        lookupError={impactSettled ? impactError : null}
        busy={saving}
        linked={
          currentImpact?.title
            ? {
                heading: 'People sign up through a form built on the site.',
                items: [
                  {
                    id: currentImpact.formId,
                    title: currentImpact.title,
                    detail: [
                      currentImpact.status ? `Form · ${currentImpact.status}` : 'Form',
                      currentImpact.responseCount === null
                        ? 'response count unavailable'
                        : plural(currentImpact.responseCount, 'response'),
                    ].join(' · '),
                  },
                ],
                cascadeLabel: 'Delete that form as well',
                cascadeHint: describeFormLoss(currentImpact.responseCount),
                cascadeWarning:
                  otherUsers.length > 0
                    ? `${plural(otherUsers.length, 'other item')} on the site use this form and will be left with no sign-up form: ${otherUsers.join(', ')}.`
                    : undefined,
              }
            : null
        }
        onCancel={() => setDeleting(null)}
        onConfirm={(cascade) => void confirmDelete(cascade)}
      />
    </div>
  );
}
