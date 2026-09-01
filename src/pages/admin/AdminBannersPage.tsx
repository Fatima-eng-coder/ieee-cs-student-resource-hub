import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import { adminAuthService } from '@/services/adminAuthService';
import {
  bannersService,
  BANNER_TYPES,
  type AdminBanner,
  type BannerSaveInput,
  type BannerType,
} from '@/services/bannersService';
import { hasFile } from '@/utils/files';

/**
 * PostgREST can answer with an empty message, and the banner below only renders a non-empty
 * string. Without the fallback a failed save would look identical to a cancelled one.
 */
const getCleanError = (err: unknown, fallback: string) => (err instanceof Error && err.message) || fallback;

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';

const emptyBanner = (): AdminBanner => ({
  id: '',
  title: '',
  subtitle: '',
  image: '',
  imagePath: null,
  ctaLabel: '',
  ctaLink: '',
  type: 'announcement',
  isPublished: true,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
});

/** Artwork is chosen here and uploaded on save, so a cancelled drawer leaves nothing behind. */
function BannerImageField({
  imageUrl,
  selectedFile,
  onFileChange,
}: {
  imageUrl: string;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
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
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group flex aspect-[16/9] w-full overflow-hidden rounded-xl border border-black/10 bg-ieee-ink transition hover:border-ieee-orange/60"
      >
        {hasFile(displayUrl) ? (
          <img src={displayUrl} alt="Banner preview" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-300 bg-white text-slate-400 group-hover:border-ieee-orange/60 group-hover:text-ieee-orange">
            <ImagePlus className="h-5 w-5" />
            <span className="text-[11px] font-medium">Upload artwork</span>
          </span>
        )}
      </button>

      {selectedFile && (
        <p className="rounded-xl border border-black/5 bg-white px-3 py-2 text-xs font-medium text-slate-500">
          Selected artwork will be saved with this banner.
        </p>
      )}

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

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminBanner | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [deleting, setDeleting] = useState<AdminBanner | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setBanners(await bannersService.list());
    } catch (err) {
      setError(getCleanError(err, 'Failed to load banners.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const closeDraft = () => {
    setDraft(null);
    setSelectedImage(null);
    setIsNew(false);
  };

  // site_banners_cta_check refuses a half-filled call to action outright. Naming the missing
  // half here, while the drawer is still open, beats bouncing the whole save off the database.
  const ctaLabel = draft?.ctaLabel.trim() ?? '';
  const ctaLink = draft?.ctaLink.trim() ?? '';
  const ctaProblem = ctaLabel && !ctaLink
    ? 'Add the link this button should open, or clear the label.'
    : ctaLink && !ctaLabel
      ? 'Add the button label for this link, or clear the link.'
      : '';

  const save = async () => {
    if (!draft) return;
    if (!canManage) {
      setError('You do not have permission to manage banners.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    let uploaded: { url: string; path: string } | null = null;
    const previousPath = draft.imagePath;

    try {
      if (selectedImage) {
        uploaded = await bannersService.uploadImage(selectedImage, draft.id || crypto.randomUUID());
      }

      const input: BannerSaveInput = {
        title: draft.title,
        subtitle: draft.subtitle,
        image: uploaded?.url ?? draft.image,
        imagePath: uploaded?.path ?? draft.imagePath,
        ctaLabel: draft.ctaLabel,
        ctaLink: draft.ctaLink,
        type: draft.type,
        isPublished: draft.isPublished,
        sortOrder: draft.sortOrder,
      };

      const saved = isNew ? await bannersService.create(input) : await bannersService.update(draft.id, input);

      // Only once the row actually points at the new file. Swept before the write lands, a
      // failed save would leave the banner pointing at artwork that no longer exists.
      if (previousPath && previousPath !== saved.imagePath) {
        void bannersService.removeImage(previousPath);
      }

      setBanners((items) => {
        const exists = items.some((item) => item.id === saved.id);
        const next = exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved];
        return next.sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt));
      });

      closeDraft();
      setSuccess(isNew ? 'Banner created successfully.' : 'Banner updated successfully.');
    } catch (err) {
      if (uploaded) void bannersService.removeImage(uploaded.path);
      setError(getCleanError(err, 'Failed to save the banner.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    // Defence in depth behind the policy: it refuses a non-manager anyway, and refusing here
    // says so in words instead of as a silent no-op.
    if (!canManage) {
      setError('You do not have permission to manage banners.');
      setDeleting(null);
      return;
    }

    const banner = deleting;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await bannersService.remove(banner.id);
      setBanners((items) => items.filter((item) => item.id !== banner.id));
      setSuccess('Banner deleted.');
    } catch (err) {
      setError(getCleanError(err, 'Failed to delete the banner.'));
    } finally {
      setDeleting(null);
      setSaving(false);
    }
  };

  const columns: AdminTableColumn<AdminBanner>[] = [
    {
      key: 'preview',
      header: 'Preview',
      render: (b) =>
        hasFile(b.image) ? (
          <img src={b.image} alt={b.title} className="h-10 w-16 rounded-lg object-cover" />
        ) : (
          <div className="flex h-10 w-16 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">
            none
          </div>
        ),
    },
    {
      key: 'title',
      header: 'Title',
      sortValue: (b) => b.title,
      render: (b) => <span className="font-medium text-slate-900">{b.title}</span>,
    },
    { key: 'type', header: 'Type', sortValue: (b) => b.type, render: (b) => <span className="capitalize">{b.type}</span> },
    {
      key: 'cta',
      header: 'CTA',
      render: (b) => (b.ctaLabel ? b.ctaLabel : <span className="text-slate-400">None</span>),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (b) => (b.isPublished ? 'published' : 'draft'),
      render: (b) => (
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            b.isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {b.isPublished ? 'Published' : 'Draft'}
        </span>
      ),
    },
    { key: 'order', header: 'Order', sortValue: (b) => b.sortOrder, render: (b) => b.sortOrder },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (b) =>
        canManage ? (
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                setDraft(b);
                setSelectedImage(null);
                setIsNew(false);
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button type="button" className={dangerBtn} onClick={() => setDeleting(b)}>
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
        title="Banners"
        subtitle="Promotional banners stored on the site database"
        action={
          canManage ? (
            <button
              onClick={() => {
                setDraft(emptyBanner());
                setSelectedImage(null);
                setIsNew(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> Add Banner
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
          <EmptyState title="Loading banners" description="Fetching the stored banners." />
        ) : (
          <AdminTable
            columns={columns}
            rows={banners}
            rowKey={(b) => b.id}
            searchable={(b) => `${b.title} ${b.subtitle} ${b.type} ${b.ctaLabel}`}
            emptyMessage="No banners have been added yet."
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'Add Banner' : 'Edit Banner'}
        subtitle="Stored centrally, so every editor sees the same banners."
        onClose={closeDraft}
        footer={
          <button
            onClick={save}
            disabled={saving || !!ctaProblem}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-70"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <AdminField label="Banner artwork" hint="PNG, JPG or WebP, up to 5 MB. Optional.">
              <BannerImageField
                imageUrl={draft.image}
                selectedFile={selectedImage}
                onFileChange={setSelectedImage}
              />
            </AdminField>
            <AdminField label="Title" required>
              <AdminInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </AdminField>
            <AdminField label="Subtitle">
              <AdminInput value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
            </AdminField>
            <AdminField label="Type">
              <AdminSelect
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as BannerType })}
              >
                {BANNER_TYPES.map((type) => (
                  <option key={type} value={type} className="capitalize">
                    {type}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>

            <div className="rounded-xl border border-black/5 bg-white p-3">
              <p className="mb-3 text-sm font-semibold text-slate-700">Call to action</p>
              <div className="flex flex-col gap-3">
                <AdminField label="Button label">
                  <AdminInput
                    value={draft.ctaLabel}
                    onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
                    placeholder="Learn more"
                  />
                </AdminField>
                <AdminField label="Button link">
                  <AdminInput
                    value={draft.ctaLink}
                    onChange={(e) => setDraft({ ...draft, ctaLink: e.target.value })}
                    placeholder="/events"
                  />
                </AdminField>
              </div>
              <p className={`mt-2 text-xs ${ctaProblem ? 'font-medium text-rose-600' : 'text-slate-400'}`}>
                {ctaProblem || 'Fill in both to show a button, or leave both empty for a banner with no button.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Sort order" hint="Lower numbers show first.">
                <AdminInput
                  type="number"
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                />
              </AdminField>
              <label className="flex items-end gap-2 pb-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.isPublished}
                  onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })}
                  className="accent-ieee-orange"
                />
                Published
              </label>
            </div>
          </div>
        )}
      </AdminEditDrawer>

      <ConfirmModal
        open={!!deleting}
        title="Delete this banner?"
        description="The banner and its artwork are removed permanently."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
