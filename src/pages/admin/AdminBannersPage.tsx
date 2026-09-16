import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Images, Loader2, Monitor, Pencil, Plus, Smartphone, Trash2, X } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminTextarea, AdminSelect } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import GalleryPhotoPicker, { type PickedPhoto } from '@/components/admin/GalleryPhotoPicker';
import { adminAuthService } from '@/services/adminAuthService';
import {
  bannersService,
  BANNER_TYPES,
  isOpenableBannerLink,
  type AdminBanner,
  type BannerSaveInput,
  type BannerType,
} from '@/services/bannersService';
import { hasFile } from '@/utils/files';
import { readImageOrientation } from '@/utils/imageSize';

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
  mobileImage: '',
  mobileImagePath: null,
  ctaLabel: '',
  ctaLink: '',
  type: 'announcement',
  orientation: 'landscape',
  isPublished: true,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
});

/**
 * One picture slot: upload, or reuse a photo from the gallery.
 *
 * Artwork is chosen here and uploaded on save, so a cancelled drawer leaves nothing behind. Used
 * twice -- for the desktop picture and for the optional phone picture -- with the frame shaped the
 * way each will actually be seen.
 */
function BannerImageField({
  imageUrl,
  selectedFile,
  onFileChange,
  onPickExisting,
  frame,
  emptyLabel,
  pickerTitle,
  disabled = false,
  fallbackUrl,
  fallbackCaption,
  clearLabel,
  onClear,
}: {
  imageUrl: string;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  onPickExisting: (photo: PickedPhoto) => void;
  /** 'wide' previews like a desktop screen, 'tall' like a phone. */
  frame: 'wide' | 'tall';
  emptyLabel: string;
  pickerTitle: string;
  disabled?: boolean;
  /** Shown dimmed when this slot is empty, to say what will be used instead. */
  fallbackUrl?: string;
  fallbackCaption?: string;
  clearLabel?: string;
  onClear?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const previewUrl = useMemo(() => (selectedFile ? URL.createObjectURL(selectedFile) : ''), [selectedFile]);
  const displayUrl = previewUrl || imageUrl;
  const showingFallback = !hasFile(displayUrl) && hasFile(fallbackUrl ?? '');

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const shown = hasFile(displayUrl) ? displayUrl : showingFallback ? (fallbackUrl as string) : '';

  return (
    <div className={`space-y-2.5 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={`group relative flex w-full overflow-hidden rounded-xl border border-black/10 bg-ieee-ink transition hover:border-ieee-orange/60 ${
          frame === 'tall' ? 'mx-auto aspect-[4/5] max-w-[13rem]' : 'aspect-[16/9]'
        }`}
      >
        {shown ? (
          // The whole image on a dark ground, as the homepage popup shows it. Previewing a
          // cropped fill here would show a framing the site never produces.
          <>
            <img
              src={shown}
              alt={showingFallback ? '' : 'Banner preview'}
              className={`relative m-auto max-h-full max-w-full object-contain ${showingFallback ? 'opacity-40' : ''}`}
            />
            {showingFallback && fallbackCaption && (
              <span className="absolute inset-x-2 bottom-2 rounded-lg bg-ieee-ink/70 px-2 py-1 text-center text-[10px] font-medium text-white">
                {fallbackCaption}
              </span>
            )}
          </>
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-300 bg-white text-slate-400 group-hover:border-ieee-orange/60 group-hover:text-ieee-orange">
            <ImagePlus className="h-5 w-5" />
            <span className="text-[11px] font-medium">{emptyLabel}</span>
          </span>
        )}
      </button>

      <div className="flex flex-wrap gap-2">
        {/* Reuse rather than re-upload: a poster already in a gallery album is the same bytes,
            and a second copy is how two versions of one picture start to drift. */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPicking(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-ieee-orange/30 px-3 py-2 text-xs font-semibold text-ieee-orange transition hover:bg-ieee-orange/5"
        >
          <Images className="h-3.5 w-3.5" /> Choose from the gallery
        </button>
        {onClear && (hasFile(displayUrl) || selectedFile) && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-black/10 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
          >
            <X className="h-3.5 w-3.5" /> {clearLabel ?? 'Remove'}
          </button>
        )}
      </div>

      <GalleryPhotoPicker
        open={picking}
        title={pickerTitle}
        onClose={() => setPicking(false)}
        onPick={(photo) => {
          onFileChange(null);
          onPickExisting(photo);
        }}
      />

      {selectedFile && (
        <p className="rounded-xl border border-black/5 bg-white px-3 py-2 text-xs font-medium text-slate-500">
          {selectedFile.name} will be uploaded when you save.
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
  const [selectedDesktop, setSelectedDesktop] = useState<File | null>(null);
  const [selectedMobile, setSelectedMobile] = useState<File | null>(null);
  // The chosen website file, so the phone slot's "phones will show this" preview shows the
  // picture that will actually be saved rather than the one it replaces.
  const desktopPreview = useMemo(
    () => (selectedDesktop ? URL.createObjectURL(selectedDesktop) : ''),
    [selectedDesktop]
  );
  useEffect(() => {
    return () => {
      if (desktopPreview) URL.revokeObjectURL(desktopPreview);
    };
  }, [desktopPreview]);
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
    setSelectedDesktop(null);
    setSelectedMobile(null);
    setIsNew(false);
  };

  const openDraft = (banner: AdminBanner, fresh: boolean) => {
    setDraft(banner);
    setSelectedDesktop(null);
    setSelectedMobile(null);
    setIsNew(fresh);
  };

  // site_banners_cta_check refuses a half-filled call to action outright. Naming the missing
  // half here, while the drawer is still open, beats bouncing the whole save off the database.
  const ctaLabel = draft?.ctaLabel.trim() ?? '';
  const ctaLink = draft?.ctaLink.trim() ?? '';
  const ctaProblem = ctaLabel && !ctaLink
    ? 'Add the link this button should open, or clear the label.'
    : ctaLink && !ctaLabel
      ? 'Add the button label for this link, or clear the link.'
      : ctaLink && !isOpenableBannerLink(ctaLink)
        ? 'The homepage will not open a link like this. Use a site path such as /events, or a full https:// address.'
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

    /*
     * Which files this save makes redundant is decided from the banner as it is STORED, never from
     * the draft. Choosing a gallery photo rewrites the draft's path, so a draft-driven sweep would
     * either chase a path the row never held or miss the uploaded file that really was replaced.
     */
    const stored = isNew ? null : banners.find((banner) => banner.id === draft.id) ?? null;
    const previous = [stored?.imagePath ?? null, stored?.mobileImagePath ?? null];
    const uploaded: string[] = [];

    try {
      // One folder for both of this save's uploads -- computed once, or a new banner's two
      // pictures would land in two different folders. Only when something is uploaded, and
      // inside the try: randomUUID is missing on a non-https page, and a throw out here would
      // leave the button spinning with no message.
      const folderId = selectedDesktop || selectedMobile ? draft.id || crypto.randomUUID() : '';

      let image = draft.image;
      let imagePath = draft.imagePath;
      let mobileImage = draft.mobileImage;
      let mobileImagePath = draft.mobileImagePath;

      if (selectedDesktop) {
        const result = await bannersService.uploadImage(selectedDesktop, folderId, 'desktop');
        uploaded.push(result.path);
        image = result.url;
        imagePath = result.path;
      }
      if (selectedMobile) {
        const result = await bannersService.uploadImage(selectedMobile, folderId, 'mobile');
        uploaded.push(result.path);
        mobileImage = result.url;
        mobileImagePath = result.path;
      }

      // A phone picture only exists beside a desktop one (site_banners_mobile_image_check).
      if (!image) {
        mobileImage = '';
        mobileImagePath = null;
      }

      // Shape is read from the desktop picture itself rather than asked for. It stopped being an
      // editor setting when phones got a picture of their own, but the column is kept true.
      let orientation = draft.orientation;
      if (image) {
        orientation = await readImageOrientation(selectedDesktop ?? image).catch(() => draft.orientation);
      }

      const input: BannerSaveInput = {
        title: draft.title,
        subtitle: draft.subtitle,
        image,
        imagePath,
        mobileImage,
        mobileImagePath,
        ctaLabel: draft.ctaLabel,
        ctaLink: draft.ctaLink,
        type: draft.type,
        orientation,
        isPublished: draft.isPublished,
        sortOrder: draft.sortOrder,
      };

      const saved = isNew ? await bannersService.create(input) : await bannersService.update(draft.id, input);

      // Only once the row points at the new files. Swept before the write lands, a failed save
      // would leave the banner pointing at artwork that no longer exists. Pictures chosen from the
      // gallery are never swept -- they belong to their album (see isOwnedBannerPath).
      void bannersService.sweepReplaced(previous, [saved.imagePath, saved.mobileImagePath]);

      setBanners((items) => {
        const exists = items.some((item) => item.id === saved.id);
        const next = exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved];
        return next.sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt));
      });

      closeDraft();
      setSuccess(isNew ? 'Banner created successfully.' : 'Banner updated successfully.');
    } catch (err) {
      // Every file this save uploaded, not just the last: if the desktop upload landed and the
      // phone upload or the write then failed, the desktop file would otherwise be left behind.
      for (const path of uploaded) void bannersService.removeImage(path);
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
          <div className="relative w-max">
            <img src={b.image} alt={b.title} className="h-10 w-16 rounded-lg object-cover" />
            {hasFile(b.mobileImage) && (
              <span
                title="Has a separate phone picture"
                className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-ieee-orange text-white ring-2 ring-white"
              >
                <Smartphone className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
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
              onClick={() => openDraft(b, false)}
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
        subtitle="Shown on the homepage below the hero, in rotation with promoted events and announcements"
        action={
          canManage ? (
            <button
              onClick={() => openDraft(emptyBanner(), true)}
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
        subtitle="Published banners appear on the homepage, one at a time, rotating every 18 seconds."
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
            {/*
              Two pictures, one per screen size. Not wrapped in AdminField: that renders a <label>,
              which would make each slot's hidden file input the labelled control and reopen the
              picker on any click inside the block.
            */}
            <div className="flex flex-col gap-4 rounded-2xl border border-black/10 bg-cream/60 p-4">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Monitor className="h-4 w-4 text-ieee-orange" /> Website picture
                </p>
                <p className="mb-2.5 mt-0.5 text-xs text-slate-500">
                  Shown on laptops and tablets, and on phones when there is no phone picture.
                  PNG, JPG or WebP, up to 5 MB; about 1600 × 900 works well. Optional — without
                  it the banner is text only.
                </p>
                <BannerImageField
                  frame="wide"
                  emptyLabel="Upload the website picture"
                  pickerTitle="Pick the website picture"
                  imageUrl={draft.image}
                  selectedFile={selectedDesktop}
                  onFileChange={setSelectedDesktop}
                  onPickExisting={(photo) =>
                    setDraft((current) =>
                      current ? { ...current, image: photo.url, imagePath: photo.path } : current
                    )
                  }
                  clearLabel="Remove"
                  onClear={() => {
                    // The phone picture cannot outlive the website one, so it goes too.
                    setSelectedDesktop(null);
                    setSelectedMobile(null);
                    setDraft((current) =>
                      current
                        ? { ...current, image: '', imagePath: null, mobileImage: '', mobileImagePath: null }
                        : current
                    );
                  }}
                />
              </div>

              <div className="border-t border-black/5 pt-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Smartphone className="h-4 w-4 text-ieee-orange" /> Phone picture
                  <span className="font-normal text-slate-400">(optional)</span>
                </p>
                <p className="mb-2.5 mt-0.5 text-xs text-slate-500">
                  {hasFile(draft.image) || selectedDesktop
                    ? 'Replaces the website picture on screens narrower than 640px. A tall image, about 1080 × 1350, fits a phone best.'
                    : 'Add the website picture first — the phone picture replaces it on small screens.'}
                </p>
                <BannerImageField
                  frame="tall"
                  emptyLabel="Upload the phone picture"
                  pickerTitle="Pick the phone picture"
                  disabled={!hasFile(draft.image) && !selectedDesktop}
                  imageUrl={draft.mobileImage}
                  selectedFile={selectedMobile}
                  onFileChange={setSelectedMobile}
                  onPickExisting={(photo) =>
                    setDraft((current) =>
                      current ? { ...current, mobileImage: photo.url, mobileImagePath: photo.path } : current
                    )
                  }
                  fallbackUrl={desktopPreview || draft.image}
                  fallbackCaption="Phones will show the website picture"
                  clearLabel="Use the website picture"
                  onClear={() => {
                    setSelectedMobile(null);
                    setDraft((current) =>
                      current ? { ...current, mobileImage: '', mobileImagePath: null } : current
                    );
                  }}
                />
              </div>
            </div>
            <AdminField label="Title" required>
              <AdminInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </AdminField>
            {/*
              A textarea, not an input. This is the popup's body copy, and admins paste real
              prose into it -- paragraphs, "* " bullets, a couple of links. A browser silently
              strips newlines when multi-line text is pasted into <input>, so the structure was
              being destroyed here, before it ever reached Postgres. Rendering it faithfully
              downstream could not have brought back what the field had already thrown away.
            */}
            <AdminField
              label="Subtitle"
              hint="Shown as the popup's body. Blank lines start a new paragraph, lines starting with * become bullets, and links are made clickable."
            >
              <AdminTextarea
                rows={7}
                value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
              />
            </AdminField>
            {/* No "Shape" setting any more: the website and phone pictures each take their own
                shape, and the stored orientation is read from the website picture on save. */}
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

            <AdminField
              label="Sort order"
              hint="Lower numbers show first. The homepage rotates these together with promoted events and announcements, which bring their own order from their own screens; banners lead when the numbers tie."
            >
              <AdminInput
                type="number"
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
              />
            </AdminField>

            {/* The consequence, not just the flag. A banner saved as a draft is invisible to
                everyone but the team, and "I saved it and nothing happened" is the only
                symptom that state has. */}
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                draft.isPublished ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
              }`}
            >
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })}
                className="mt-0.5 accent-ieee-orange"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Published</span>
                <span className="block text-xs text-slate-600">
                  {draft.isPublished
                    ? 'Visitors see this on the homepage as soon as it is saved.'
                    : 'Kept as a draft. Nobody outside the team sees it until this is ticked.'}
                </span>
              </span>
            </label>
          </div>
        )}
      </AdminEditDrawer>

      <ConfirmModal
        open={!!deleting}
        title="Delete this banner?"
        description="The banner and the pictures uploaded for it are removed permanently. Pictures chosen from the gallery stay in their albums."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
