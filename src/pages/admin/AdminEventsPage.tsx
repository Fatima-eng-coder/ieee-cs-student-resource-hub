import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ExternalLink, ImagePlus, Loader2, MapPin, Megaphone, Pencil, Plus, Trash2, X } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect, AdminTextarea } from '@/components/admin/AdminField';
import ConfirmLinkedDelete from '@/components/admin/ConfirmLinkedDelete';
import EmptyState from '@/components/ui/EmptyState';
import FormAttachmentField, { PromotionFields } from '@/components/admin/FormAttachmentField';
import { adminAuthService } from '@/services/adminAuthService';
import { announcementsService } from '@/services/announcementsService';
import { eventsService, subscribeEventsChanged, type AdminEvent, type EventSaveInput } from '@/services/eventsService';
import { formsService, type FormLinkImpact } from '@/services/formsService';
import type { EventCategory, EventImageLayout } from '@/types';
import { hasFile } from '@/utils/files';

const categories: EventCategory[] = ['workshop', 'competition', 'seminar', 'session', 'hackathon', 'other'];
const categoryLabels: Record<EventCategory, string> = {
  workshop: 'Workshop',
  competition: 'Competition',
  seminar: 'Seminar',
  session: 'Session',
  hackathon: 'Hackathon',
  other: 'Other',
};

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';

const emptyEvent = (): AdminEvent => ({
  id: '',
  title: '',
  description: '',
  longDescription: '',
  date: new Date().toISOString().slice(0, 10),
  time: '',
  venue: '',
  category: 'workshop',
  timing: 'upcoming',
  registrationOpen: false,
  registrationUrl: '',
  capacity: 100,
  registered: 0,
  image: '',
  coverImagePath: null,
  organizers: [],
  isPublished: true,
  featured: false,
  imageLayout: 'poster',
  createdAt: '',
  updatedAt: '',
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

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Deleting a form takes its responses with it — form_responses cascades off forms — so the
 * number is put in front of the admin before the click. An unreadable count says so rather
 * than reporting the zero it does not know: "no responses" about a form holding forty is the
 * single worst thing this dialog could say.
 */
const describeFormLoss = (count: number | null) => {
  if (count === null) return 'Its questions and every response it holds go with it. The response count could not be read.';
  if (count === 0) return 'It has collected no responses yet.';
  return `${plural(count, 'response')} collected through it ${count === 1 ? 'is' : 'are'} deleted too, permanently.`;
};

const LOOKUP_FAILED =
  'We could not read the form attached to this event, so its responses cannot be counted here. Deleting the event leaves the form itself untouched.';

const parseOrganizers = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const getCleanError = (err: unknown, fallback: string) => {
  const message = err instanceof Error ? err.message : '';
  if (!message) return fallback;
  if (message.toLowerCase().includes('row-level security')) {
    return 'The event could not be saved because database access rules blocked this action.';
  }
  if (message.toLowerCase().includes('storage')) {
    return 'The event image could not be uploaded because storage access rules blocked this action.';
  }
  if (message.toLowerCase().includes('featured') || message.toLowerCase().includes('image_layout')) {
    return 'The events table needs the featured and image display fields before this event can be saved.';
  }
  if (message.includes('events_form_config_check')) {
    return 'The sign-up form is only half set up. Pick a form or a link, or choose "No form".';
  }
  if (message.includes('events_promo_window_check')) {
    return 'The homepage promotion must end after it starts.';
  }
  return message;
};

function EventImageField({
  imageUrl,
  selectedFile,
  imageLayout,
  onFileChange,
  onImageLayoutChange,
  onClearImage,
}: {
  imageUrl: string;
  selectedFile: File | null;
  imageLayout: EventImageLayout;
  onFileChange: (file: File | null) => void;
  onImageLayoutChange: (layout: EventImageLayout) => void;
  onClearImage: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (selectedFile ? URL.createObjectURL(selectedFile) : ''), [selectedFile]);
  const displayUrl = previewUrl || imageUrl;
  const hasArtwork = hasFile(displayUrl);
  const isBanner = imageLayout === 'banner';
  const modeDescription = isBanner
    ? 'Banner: Best for wide website covers.'
    : 'Poster: Best for Instagram-style event posters.';

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="space-y-3">
      <div
        className={`relative overflow-hidden rounded-xl border border-black/10 bg-ieee-ink transition hover:border-ieee-orange/60 ${
          isBanner ? 'aspect-[16/9]' : 'mx-auto aspect-[4/5] max-w-48'
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="group flex h-full w-full"
        >
        {hasArtwork ? (
          <img
            src={displayUrl}
            alt="Event artwork preview"
            className={`h-full w-full ${isBanner ? 'object-cover' : 'object-contain'}`}
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-300 bg-white text-slate-400 group-hover:border-ieee-orange/60 group-hover:text-ieee-orange">
            <ImagePlus className="h-5 w-5" />
            <span className="text-[11px] font-medium">Upload artwork</span>
          </span>
        )}
        </button>
        {hasArtwork && (
          <button
            type="button"
            onClick={onClearImage}
            aria-label="Remove selected event artwork"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ieee-ink/80 text-white shadow-sm backdrop-blur transition hover:bg-rose-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={actionBtn}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          Upload image
        </button>

        <div className="flex rounded-xl border border-black/10 bg-white p-1">
          {(['poster', 'banner'] as EventImageLayout[]).map((layout) => (
            <button
              key={layout}
              type="button"
              onClick={() => onImageLayoutChange(layout)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                imageLayout === layout
                  ? 'bg-ieee-orange text-white shadow-sm'
                  : 'text-slate-500 hover:text-ieee-orange'
              }`}
            >
              {layout === 'poster' ? 'Poster' : 'Banner'}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-black/5 bg-white px-3 py-2 text-xs font-medium text-slate-500">
        {selectedFile ? 'Selected image will be saved with this event. ' : ''}
        {modeDescription}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          onFileChange(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function EventPublicPreview({ event }: { event: AdminEvent }) {
  const isBanner = event.imageLayout === 'banner';

  return (
    <div className="space-y-4 text-sm text-slate-600">
      <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
        <div className={`relative overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(255,108,12,0.24),transparent_35%),linear-gradient(135deg,#1f1710,#0f1014)] ${isBanner ? 'h-56' : 'min-h-80'}`}>
          {hasFile(event.image) ? (
            <img
              src={event.image}
              alt={event.title}
              className={isBanner ? 'h-full w-full object-cover' : 'mx-auto max-h-[520px] w-full object-contain'}
            />
          ) : (
            <div className="flex h-56 items-center justify-center px-6 text-center text-white/70">
              Event image not uploaded yet.
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ieee-ink/60 to-transparent" />
          <div className="absolute bottom-4 left-4 flex gap-2">
            <span className="rounded-full bg-ieee-orange px-3 py-1 text-xs font-semibold text-white">
              {categoryLabels[event.category]}
            </span>
            {event.featured && (
              <span className="rounded-full bg-ieee-yellow px-3 py-1 text-xs font-semibold text-ieee-black">
                Featured
              </span>
            )}
          </div>
        </div>
        <div className="p-5">
          <h3 className="font-display text-xl font-bold text-slate-900">{event.title || 'Untitled event'}</h3>
          <p className="mt-2 leading-6 text-slate-600">{event.description || 'Short event description will appear here.'}</p>
          <div className="mt-4 grid gap-3 rounded-2xl border border-black/5 bg-cream p-4">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-ieee-orange" />
              {event.date} · {event.time || 'Time not set'}
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-ieee-orange" />
              {event.venue || 'Venue not set'}
            </span>
          </div>
          <div className="mt-4">
            <span className={`inline-flex rounded-xl px-4 py-2 text-sm font-semibold text-white ${event.registrationOpen ? 'bg-ieee-orange' : 'bg-slate-300'}`}>
              {event.registrationOpen ? 'Register Now' : 'Registration Closed'}
            </span>
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Preview uses the same event image mode and public event styling.
      </p>
    </div>
  );
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminEvent | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [selectedCover, setSelectedCover] = useState<File | null>(null);
  const [organizersText, setOrganizersText] = useState('');
  const [previewing, setPreviewing] = useState<AdminEvent | null>(null);
  const [deleting, setDeleting] = useState<AdminEvent | null>(null);
  const [impact, setImpact] = useState<FormLinkImpact | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  // The form the two above answer for. React commits the render that opens the dialog before
  // the effect below runs, so an untagged answer is read as this event's form — including
  // the absence of one, which reads as "nothing is attached" on the opening frame.
  const [impactFor, setImpactFor] = useState<string | null>(null);
  const canManage = adminAuthService.canManageContent();

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      setEvents(await eventsService.listAdmin());
    } catch (err) {
      setError(getCleanError(err, 'Failed to load events.'));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const applyEventChange = (change?: { type: 'insert' | 'update' | 'delete'; event?: AdminEvent; id?: string }) => {
    if (!change) {
      void load(false);
      return;
    }
    if (change.type === 'delete' && change.id) {
      setEvents((items) => items.filter((item) => item.id !== change.id));
      setPreviewing((current) => (current?.id === change.id ? null : current));
      return;
    }
    if (!change.event) return;
    setEvents((items) => {
      const exists = items.some((item) => item.id === change.event!.id);
      if (!exists) return [change.event!, ...items];
      return items.map((item) => (item.id === change.event!.id ? change.event! : item));
    });
    setPreviewing((current) => (current?.id === change.event!.id ? change.event! : current));
  };

  useEffect(() => {
    const unsubscribe = subscribeEventsChanged(applyEventChange);
    void load(true);
    return unsubscribe;
  }, []);

  const columns: AdminTableColumn<AdminEvent>[] = [
    {
      key: 'title',
      header: 'Title',
      sortValue: (event) => event.title,
      render: (event) => <span className="font-medium text-slate-900">{event.title}</span>,
    },
    {
      key: 'category',
      header: 'Type',
      sortValue: (event) => event.category,
      render: (event) => <span>{categoryLabels[event.category]}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      sortValue: (event) => event.date,
      render: (event) => (
        <span>
          {event.date} <span className="text-slate-400">{event.time}</span>
        </span>
      ),
    },
    {
      key: 'publish',
      header: 'Status',
      sortValue: (event) => (event.isPublished ? 'published' : 'draft'),
      render: (event) => (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${event.isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {event.isPublished ? 'Published' : 'Draft'}
        </span>
      ),
    },
    {
      key: 'timing',
      header: 'Timing',
      sortValue: (event) => event.timing,
      render: (event) => (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${event.timing === 'upcoming' ? 'bg-orange-50 text-ieee-orange' : 'bg-slate-100 text-slate-500'}`}>
          {event.timing === 'upcoming' ? 'Upcoming' : 'Past'}
        </span>
      ),
    },
    {
      key: 'featured',
      header: 'Feature',
      sortValue: (event) => (event.featured ? 'featured' : 'standard'),
      render: (event) => (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${event.featured ? 'bg-ieee-yellow/40 text-ieee-black' : 'bg-slate-100 text-slate-500'}`}>
          {event.featured ? 'Featured' : 'Standard'}
        </span>
      ),
    },
    {
      key: 'registration',
      header: 'Registration',
      sortValue: (event) => (event.registrationOpen ? 'open' : 'closed'),
      render: (event) => (
        <span className={event.registrationOpen ? 'font-semibold text-ieee-orange' : 'text-slate-400'}>
          {event.registrationOpen ? 'Open' : 'Closed'}
        </span>
      ),
    },
    {
      key: 'form',
      header: 'Form',
      sortValue: (event) => event.formSource,
      render: (event) =>
        event.formSource === 'none' ? (
          <span className="text-slate-400">None</span>
        ) : (
          <span className="font-medium text-slate-600">
            {event.formSource === 'internal' ? 'Site form' : 'Linked form'}
          </span>
        ),
    },
    {
      key: 'promoted',
      header: 'Homepage',
      sortValue: (event) => (event.promoted ? 'promoted' : 'no'),
      render: (event) =>
        event.promoted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-ieee-yellow/40 px-2.5 py-0.5 text-xs font-semibold text-ieee-black">
            <Megaphone className="h-3.5 w-3.5" /> Promoted
          </span>
        ) : (
          <span className="text-slate-400">No</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (event) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button type="button" className={actionBtn} onClick={() => setPreviewing(event)}>
            <ExternalLink className="h-3.5 w-3.5" /> Preview
          </button>
          {canManage && (
            <>
              <button
                type="button"
                className={actionBtn}
                onClick={() => {
                  setDraft(event);
                  setIsNew(false);
                  setSelectedCover(null);
                  setOrganizersText(event.organizers.join(', '));
                  setError(null);
                  setSuccess(null);
                }}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button type="button" className={dangerBtn} onClick={() => setDeleting(event)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const openNew = () => {
    setDraft(emptyEvent());
    setIsNew(true);
    setSelectedCover(null);
    setOrganizersText('');
    setError(null);
    setSuccess(null);
  };

  const save = async () => {
    if (!draft) return;
    if (!canManage) {
      setError('You do not have permission to manage events.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    let uploadedCover: { url: string; path: string } | null = null;
    const previousCoverPath = isNew
      ? null
      : events.find((event) => event.id === draft.id)?.coverImagePath ?? draft.coverImagePath;

    try {
      if (selectedCover) {
        uploadedCover = await eventsService.uploadCoverImage(selectedCover, draft.id || crypto.randomUUID());
      }

      const input: EventSaveInput = {
        title: draft.title,
        description: draft.description,
        longDescription: draft.longDescription,
        category: draft.category,
        date: draft.date,
        time: draft.time,
        venue: draft.venue,
        coverImageUrl: uploadedCover?.url ?? draft.image,
        coverImagePath: uploadedCover?.path ?? draft.coverImagePath,
        featured: Boolean(draft.featured),
        imageLayout: draft.imageLayout ?? 'poster',
        registrationOpen: draft.registrationOpen,
        capacity: draft.capacity,
        organizers: parseOrganizers(organizersText),
        isPublished: draft.isPublished,
        formSource: draft.formSource,
        externalFormUrl: draft.externalFormUrl,
        formId: draft.formId,
        promoted: draft.promoted,
        promoHeadline: draft.promoHeadline,
        promoCtaLabel: draft.promoCtaLabel,
        promoStartsAt: draft.promoStartsAt,
        promoEndsAt: draft.promoEndsAt,
        promoSort: draft.promoSort,
      };

      const saved = isNew ? await eventsService.create(input) : await eventsService.update(draft.id, input);
      const shouldRemovePreviousCover = previousCoverPath && previousCoverPath !== saved.coverImagePath;
      if (shouldRemovePreviousCover) {
        void eventsService.removeCoverImage(previousCoverPath).catch((err) => {
          console.warn('Previous event cover could not be removed', err);
        });
      }

      setEvents((items) => {
        const exists = items.some((item) => item.id === saved.id);
        const next = exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items];
        return next.sort((a, b) => b.date.localeCompare(a.date));
      });
      setDraft(null);
      setSelectedCover(null);
      setOrganizersText('');
      setSuccess(isNew ? 'Event added successfully.' : 'Event updated successfully.');
    } catch (err) {
      if (uploadedCover) {
        void eventsService.removeCoverImage(uploadedCover.path).catch((cleanupError) => {
          console.warn('Uploaded event cover cleanup failed', cleanupError);
        });
      }
      setError(getCleanError(err, 'Failed to save event.'));
    } finally {
      setSaving(false);
    }
  };

  // Only an internal form is a row in this database; an external link is a URL on the event
  // and disappears with it, so there is nothing to offer to delete.
  const attachedFormId = deleting?.formSource === 'internal' ? deleting.formId : null;

  // Looked up when the dialog opens rather than per list render: the table already shows
  // whether a form is attached, and the response count only matters at the moment the event
  // is about to go.
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

  // Until the lookup has answered for the form this event points at, the dialog is still
  // asking — and with nothing attached there is nothing to ask, so both are null and it is
  // settled.
  const impactSettled = impactFor === attachedFormId;
  const currentImpact = impactSettled ? impact : null;
  const impactLoading = !!attachedFormId && !impactSettled;

  /** Events and announcements other than this one that share the attached form. */
  const otherUsers = [
    ...(currentImpact?.events ?? []).filter((event) => event.id !== deleting?.id).map((event) => event.title),
    ...(currentImpact?.announcements ?? []).map((announcement) => announcement.title),
  ];

  /**
   * Ordering, in the order things can go wrong.
   *
   * The event row goes first. It is the reference: once it is gone nothing points at the
   * form, so a failure anywhere after this leaves a form that simply exists, attached to
   * whatever else was already using it. Deleting the form first would leave this event
   * pointing at a row that is no longer there — rescued only by a database trigger that has
   * to be deployed for the delete to even succeed, and not at all in the list on screen.
   *
   * The cover image goes second, and only as a courtesy. Removing it before the row, as this
   * did previously, means a refused row delete leaves a live event on the public site with a
   * broken poster; removing it after means the worst case is one orphaned storage object
   * nobody sees.
   *
   * Then, if the admin ticked the box: the other items sharing the form are put back to "no
   * form" before the form is deleted, so no surviving row is ever left pointing at it, and
   * only then does the form go.
   */
  const confirmDelete = async (cascade: boolean) => {
    const event = deleting;
    if (!event) return;
    if (!canManage) {
      setError('You do not have permission to manage events.');
      setDeleting(null);
      return;
    }

    const formId = event.formSource === 'internal' ? event.formId : null;
    const formTitle = currentImpact?.title ?? 'its sign-up form';
    let eventRemoved = false;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await eventsService.remove(event.id);
      eventRemoved = true;
      setEvents((items) => items.filter((item) => item.id !== event.id));

      if (event.coverImagePath) {
        void eventsService.removeCoverImage(event.coverImagePath).catch((cause) => {
          console.warn('Event cover could not be removed after the event was deleted', cause);
        });
      }

      if (cascade && formId) {
        if (otherUsers.length > 0) {
          await eventsService.detachForm(formId);
          await announcementsService.detachForm(formId);
        }
        await formsService.remove(formId);
      }

      setDeleting(null);
      setSuccess(
        cascade && formId ? `Event and the form "${formTitle}" deleted successfully.` : 'Event deleted successfully.'
      );
    } catch (err) {
      const reason = getCleanError(err, 'Failed to delete event.');
      // The event is the irreversible half. Once it is gone, say so, or the admin reads a
      // bare failure message and tries the whole thing again against a row that has left.
      setError(
        eventRemoved && cascade
          ? `${reason} The event was deleted, but "${formTitle}" was not — delete it from Forms if you still want it gone.`
          : reason
      );
      setDeleting(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <AdminTopbar
        title="Events"
        subtitle="Manage upcoming and past society events"
        action={
          canManage ? (
            <button
              type="button"
              onClick={openNew}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> Add Event
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
        {success && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {success}
          </div>
        )}
        {loading ? (
          <EmptyState title="Loading events" description="Fetching the latest event list." />
        ) : (
          <AdminTable
            columns={columns}
            rows={events}
            rowKey={(event) => event.id}
            searchable={(event) => `${event.title} ${event.category} ${event.venue} ${event.organizers.join(' ')}`}
            emptyTitle="No events yet"
            emptyMessage="Add the first society event when it is ready."
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'Add Event' : 'Edit Event'}
        subtitle="Saved changes appear according to publication and event date."
        onClose={() => {
          setDraft(null);
          setSelectedCover(null);
          setOrganizersText('');
        }}
        footer={
          <button
            type="button"
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
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}
            <AdminField label="Event artwork" hint="PNG, JPG, or WebP. Optional.">
              <EventImageField
                imageUrl={draft.image}
                selectedFile={selectedCover}
                imageLayout={draft.imageLayout ?? 'poster'}
                onFileChange={setSelectedCover}
                onImageLayoutChange={(imageLayout) => setDraft({ ...draft, imageLayout })}
                onClearImage={() => {
                  setSelectedCover(null);
                  setDraft({ ...draft, image: '', coverImagePath: null });
                }}
              />
            </AdminField>
            <AdminField label="Title" required>
              <AdminInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </AdminField>
            <AdminField label="Short description" required>
              <AdminInput value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </AdminField>
            <AdminField label="Full description">
              <AdminTextarea value={draft.longDescription} onChange={(e) => setDraft({ ...draft, longDescription: e.target.value })} />
            </AdminField>
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Event type">
                <AdminSelect value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as EventCategory })}>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {categoryLabels[category]}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Capacity">
                <AdminInput
                  type="number"
                  min={0}
                  value={draft.capacity}
                  onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })}
                />
              </AdminField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Date" required>
                <AdminInput type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </AdminField>
              <AdminField label="Time" required>
                <AdminInput value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} placeholder="10:00 AM - 4:00 PM" />
              </AdminField>
            </div>
            <AdminField label="Venue" required>
              <AdminInput value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} />
            </AdminField>
            <AdminField label="Organizers" hint="Comma-separated names">
              <AdminInput
                value={organizersText}
                onChange={(e) => setOrganizersText(e.target.value)}
                placeholder="IEEE CS Team, Graphics Team"
              />
            </AdminField>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })}
                className="accent-ieee-orange"
              />
              Published
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(draft.featured)}
                onChange={(e) => setDraft({ ...draft, featured: e.target.checked })}
                className="accent-ieee-orange"
              />
              Featured
            </label>
            <p className="-mt-2 text-xs text-slate-400">
              Upcoming and previous status is calculated automatically from the event date.
            </p>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={draft.registrationOpen}
                onChange={(e) => setDraft({ ...draft, registrationOpen: e.target.checked })}
                className="accent-ieee-orange"
              />
              Registration open
            </label>
            <p className="-mt-2 text-xs text-slate-400">
              Turn this off to hide the sign-up button while the event stays on the site.
            </p>
            <FormAttachmentField
              itemNoun="event"
              value={{
                formSource: draft.formSource,
                externalFormUrl: draft.externalFormUrl,
                formId: draft.formId,
              }}
              onChange={(attachment) => setDraft({ ...draft, ...attachment })}
            />
            <PromotionFields
              itemNoun="event"
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

      <AdminEditDrawer open={!!previewing} title="Public Preview" onClose={() => setPreviewing(null)}>
        {previewing && <EventPublicPreview event={previewing} />}
      </AdminEditDrawer>

      <ConfirmLinkedDelete
        open={!!deleting}
        title="Delete this event?"
        description="This event will be removed from the admin list and public event pages."
        losses={deleting?.coverImagePath ? ['Its uploaded artwork is deleted from storage.'] : undefined}
        loading={impactLoading}
        lookupError={impactSettled ? impactError : null}
        busy={saving}
        linked={
          currentImpact?.title
            ? {
                heading: 'People sign up for this event through a form built on the site.',
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
