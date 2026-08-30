import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileCheck2, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect, AdminTextarea } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import { adminAuthService } from '@/services/adminAuthService';
import { eventsService, subscribeEventsChanged, type AdminEvent, type EventSaveInput } from '@/services/eventsService';
import type { EventCategory } from '@/types';
import { hasFile } from '@/utils/files';

const categories: EventCategory[] = ['workshop', 'competition', 'seminar', 'hackathon', 'other'];

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
  createdAt: '',
  updatedAt: '',
});

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
  return message;
};

function EventImageField({
  imageUrl,
  selectedFile,
  onFileChange,
  onRemove,
}: {
  imageUrl: string;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (selectedFile ? URL.createObjectURL(selectedFile) : ''), [selectedFile]);
  const displayUrl = previewUrl || imageUrl;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="flex items-center gap-3">
      {hasFile(displayUrl) ? (
        <img src={displayUrl} alt="Event cover preview" className="h-24 w-32 rounded-xl border border-black/10 object-cover" />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-24 w-32 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-ieee-orange/60 hover:text-ieee-orange"
        >
          <ImagePlus className="h-5 w-5" />
          <span className="text-[11px] font-medium">Upload</span>
        </button>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={actionBtn}
        >
          {hasFile(displayUrl) ? <FileCheck2 className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {hasFile(displayUrl) ? 'Change image' : 'Upload image'}
        </button>
        {hasFile(displayUrl) && (
          <button type="button" onClick={onRemove} className={dangerBtn}>
            <X className="h-3.5 w-3.5" /> Remove image
          </button>
        )}
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

function EventDetails({ event }: { event: AdminEvent }) {
  return (
    <div className="space-y-4 text-sm text-slate-600">
      {hasFile(event.image) && <img src={event.image} alt={event.title} className="max-h-64 w-full rounded-2xl object-cover" />}
      <div>
        <p className="font-display text-xl font-bold text-slate-900">{event.title}</p>
        <p className="mt-1 text-slate-500">{event.description}</p>
      </div>
      {event.longDescription && <p className="leading-6">{event.longDescription}</p>}
      <div className="rounded-2xl border border-black/5 bg-cream p-4">
        <p><span className="font-semibold text-slate-800">Type:</span> <span className="capitalize">{event.category}</span></p>
        <p><span className="font-semibold text-slate-800">Date:</span> {event.date}</p>
        <p><span className="font-semibold text-slate-800">Time:</span> {event.time}</p>
        <p><span className="font-semibold text-slate-800">Venue:</span> {event.venue}</p>
        <p><span className="font-semibold text-slate-800">Capacity:</span> {event.capacity}</p>
        <p><span className="font-semibold text-slate-800">Publication:</span> {event.isPublished ? 'Published' : 'Draft'}</p>
        <p><span className="font-semibold text-slate-800">Registration:</span> {event.registrationOpen ? 'Open' : 'Closed'}</p>
      </div>
      {event.organizers.length > 0 && (
        <div>
          <p className="font-semibold text-slate-800">Organizers</p>
          <p>{event.organizers.join(', ')}</p>
        </div>
      )}
      {event.registrationUrl && (
        <a href={event.registrationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-ieee-orange">
          Open registration link <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
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
  const [removedCoverPath, setRemovedCoverPath] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AdminEvent | null>(null);
  const [deleting, setDeleting] = useState<AdminEvent | null>(null);
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
      setViewing((current) => (current?.id === change.id ? null : current));
      return;
    }
    if (!change.event) return;
    setEvents((items) => {
      const exists = items.some((item) => item.id === change.event!.id);
      if (!exists) return [change.event!, ...items];
      return items.map((item) => (item.id === change.event!.id ? change.event! : item));
    });
    setViewing((current) => (current?.id === change.event!.id ? change.event! : current));
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
      render: (event) => <span className="capitalize">{event.category}</span>,
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
      key: 'actions',
      header: '',
      align: 'right',
      render: (event) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button type="button" className={actionBtn} onClick={() => setViewing(event)}>
            <ExternalLink className="h-3.5 w-3.5" /> View
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
                  setRemovedCoverPath(null);
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
    setRemovedCoverPath(null);
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
    const coverPathToRemove = removedCoverPath ?? draft.coverImagePath;

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
        registrationOpen: draft.registrationOpen,
        registrationUrl: draft.registrationUrl,
        capacity: draft.capacity,
        organizers: draft.organizers,
        isPublished: draft.isPublished,
      };

      const saved = isNew ? await eventsService.create(input) : await eventsService.update(draft.id, input);
      const shouldRemovePreviousCover = coverPathToRemove && coverPathToRemove !== saved.coverImagePath;
      if (shouldRemovePreviousCover) {
        void eventsService.removeCoverImage(coverPathToRemove).catch((err) => {
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
      setRemovedCoverPath(null);
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

  const confirmDelete = async () => {
    if (!deleting) return;
    if (!canManage) {
      setError('You do not have permission to manage events.');
      setDeleting(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await eventsService.remove(deleting.id);
      if (deleting.coverImagePath) {
        void eventsService.removeCoverImage(deleting.coverImagePath).catch((err) => {
          console.warn('Deleted event cover cleanup failed', err);
        });
      }
      setEvents((items) => items.filter((item) => item.id !== deleting.id));
      setDeleting(null);
      setSuccess('Event deleted successfully.');
    } catch (err) {
      setError(getCleanError(err, 'Failed to delete event.'));
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
          setRemovedCoverPath(null);
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
            <AdminField label="Cover image" hint="PNG, JPG, or WebP. Optional.">
              <EventImageField
                imageUrl={draft.image}
                selectedFile={selectedCover}
                onFileChange={setSelectedCover}
                onRemove={() => {
                  setSelectedCover(null);
                  if (draft.coverImagePath) setRemovedCoverPath(draft.coverImagePath);
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
                    <option key={category} value={category} className="capitalize">
                      {category}
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
                value={draft.organizers.join(', ')}
                onChange={(e) => setDraft({ ...draft, organizers: parseOrganizers(e.target.value) })}
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
                checked={draft.registrationOpen}
                onChange={(e) => setDraft({ ...draft, registrationOpen: e.target.checked })}
                className="accent-ieee-orange"
              />
              Registration open
            </label>
            <AdminField label="Registration link" hint="Optional">
              <AdminInput
                type="url"
                value={draft.registrationUrl}
                onChange={(e) => setDraft({ ...draft, registrationUrl: e.target.value })}
                placeholder="https://forms.gle/..."
              />
            </AdminField>
          </div>
        )}
      </AdminEditDrawer>

      <AdminEditDrawer open={!!viewing} title="Event Details" onClose={() => setViewing(null)}>
        {viewing && <EventDetails event={viewing} />}
      </AdminEditDrawer>

      <ConfirmModal
        open={!!deleting}
        title="Delete this event?"
        description="This event will be removed from the admin list and public event pages."
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
