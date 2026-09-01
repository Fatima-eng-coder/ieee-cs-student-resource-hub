import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminTextarea } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import { adminAuthService } from '@/services/adminAuthService';
import {
  galleryService,
  type AdminGalleryAlbum,
  type AdminGalleryPhoto,
  type AlbumSaveInput,
} from '@/services/galleryService';
import { hasFile } from '@/utils/files';

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';
const iconBtn =
  'flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 bg-white text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-40';

const emptyAlbum = (): AdminGalleryAlbum => ({
  id: '',
  title: '',
  date: new Date().toISOString().slice(0, 10),
  description: '',
  coverImage: '',
  coverImagePath: null,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
  images: [],
});

const getCleanError = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

function AlbumCoverField({
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
          <img src={displayUrl} alt="Album cover preview" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-300 bg-white text-slate-400 group-hover:border-ieee-orange/60 group-hover:text-ieee-orange">
            <ImagePlus className="h-5 w-5" />
            <span className="text-[11px] font-medium">Upload cover</span>
          </span>
        )}
      </button>

      {selectedFile && (
        <p className="rounded-xl border border-black/5 bg-white px-3 py-2 text-xs font-medium text-slate-500">
          Selected cover will be saved with this album.
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

/**
 * One photo in the drawer. The caption is drafted locally and committed on blur — the only
 * photo edit that would otherwise fire a write per keystroke.
 *
 * The reset is keyed off the row itself rather than off its caption text, because a rejected
 * edit is exactly the case where the stored caption did not change: a value dependency would
 * see the same string, skip, and leave the input showing text the database refused. Every photo
 * write re-reads the album afterwards, the rejected path included, and hands down a fresh row.
 * Nothing being typed is lost to it — reaching any control that starts a write blurs this field
 * first, and the row is disabled while one is in flight.
 */
function PhotoRow({
  photo,
  index,
  total,
  busy,
  onCaptionCommit,
  onMove,
  onRemove,
}: {
  photo: AdminGalleryPhoto;
  index: number;
  total: number;
  busy: boolean;
  onCaptionCommit: (caption: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [caption, setCaption] = useState(photo.caption);

  useEffect(() => {
    setCaption(photo.caption);
  }, [photo]);

  return (
    <li className="flex items-start gap-3 rounded-xl border border-black/5 bg-white p-2.5">
      <img src={photo.url} alt="" className="h-14 w-20 shrink-0 rounded-lg bg-cream object-cover" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <AdminInput
          value={caption}
          disabled={busy}
          placeholder="Caption"
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => {
            if (caption.trim() !== photo.caption) onCaptionCommit(caption);
          }}
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={iconBtn}
            disabled={busy || index === 0}
            onClick={() => onMove(-1)}
            aria-label="Move photo earlier"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={iconBtn}
            disabled={busy || index === total - 1}
            onClick={() => onMove(1)}
            aria-label="Move photo later"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={`${iconBtn} hover:border-rose-300 hover:text-rose-600`}
            disabled={busy}
            onClick={onRemove}
            aria-label="Remove photo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <span className="ml-auto font-mono text-[11px] text-slate-400">#{index + 1}</span>
        </div>
      </div>
    </li>
  );
}

function AlbumPublicPreview({ album }: { album: AdminGalleryAlbum }) {
  return (
    <div className="space-y-4 text-sm text-slate-600">
      <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
        <div className="h-48 w-full overflow-hidden bg-ieee-ink">
          {hasFile(album.coverImage) ? (
            <img src={album.coverImage} alt={album.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-white/70">
              Album cover not uploaded yet.
            </div>
          )}
        </div>
        <div className="p-5">
          <h3 className="font-display text-xl font-bold text-slate-900">{album.title || 'Untitled album'}</h3>
          <p className="text-xs text-slate-400">{album.date}</p>
          <p className="mt-2 leading-6 text-slate-600">
            {album.description || 'Album description will appear here.'}
          </p>
        </div>
      </div>

      {album.images.length === 0 ? (
        <p className="text-xs text-slate-400">This album has no photos yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {album.images.map((photo) => (
            <figure key={photo.id} className="overflow-hidden rounded-xl border border-black/5 bg-white">
              <img src={photo.url} alt={photo.caption} className="h-20 w-full object-cover" />
              {photo.caption && (
                <figcaption className="px-2 py-1 text-[11px] text-slate-500">{photo.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-400">Photos appear on the public album page in this order.</p>
    </div>
  );
}

export default function AdminGalleryPage() {
  const [albums, setAlbums] = useState<AdminGalleryAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminGalleryAlbum | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [selectedCover, setSelectedCover] = useState<File | null>(null);
  const [photos, setPhotos] = useState<AdminGalleryPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<AdminGalleryAlbum | null>(null);
  const [deleting, setDeleting] = useState<AdminGalleryAlbum | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const canManage = adminAuthService.canManageContent();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setAlbums(await galleryService.list());
    } catch (err) {
      setError(getCleanError(err, 'Failed to load the gallery.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  /**
   * Photo writes land in the database before they reach this state, so both the drawer and the
   * table row are set from what came back rather than from what was asked for.
   */
  const applyPhotos = (albumId: string, next: AdminGalleryPhoto[]) => {
    setPhotos(next);
    setAlbums((items) => items.map((item) => (item.id === albumId ? { ...item, images: next } : item)));
    setPreviewing((current) => (current?.id === albumId ? { ...current, images: next } : current));
  };

  const runPhotoAction = async (action: () => Promise<AdminGalleryPhoto[]>, albumId: string) => {
    if (!canManage) {
      setPhotoError('You do not have permission to manage the gallery.');
      return;
    }

    setPhotoBusy(true);
    setPhotoError(null);
    try {
      applyPhotos(albumId, await action());
    } catch (err) {
      setPhotoError(getCleanError(err, 'That photo change could not be saved.'));
      // The list on screen is now suspect, so it is replaced with the stored one rather than
      // left showing a photo, caption or order the database never accepted.
      try {
        applyPhotos(albumId, await galleryService.listPhotos(albumId));
      } catch {
        // The refresh failing leaves the earlier message standing, which is the useful one.
      }
    } finally {
      setPhotoBusy(false);
    }
  };

  const openDraft = (album: AdminGalleryAlbum, asNew: boolean) => {
    setDraft(album);
    setIsNew(asNew);
    setSelectedCover(null);
    setPhotos(album.images);
    setPhotoError(null);
    setError(null);
    setSuccess(null);
  };

  const closeDraft = () => {
    setDraft(null);
    setSelectedCover(null);
    setPhotos([]);
    setPhotoError(null);
  };

  const columns: AdminTableColumn<AdminGalleryAlbum>[] = [
    {
      key: 'cover',
      header: 'Cover',
      render: (album) =>
        hasFile(album.coverImage) ? (
          <img src={album.coverImage} alt="" className="h-10 w-14 rounded-lg object-cover" />
        ) : (
          <div className="flex h-10 w-14 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">
            none
          </div>
        ),
    },
    {
      key: 'title',
      header: 'Album',
      sortValue: (album) => album.title,
      render: (album) => <span className="font-medium text-slate-900">{album.title}</span>,
    },
    { key: 'date', header: 'Date', sortValue: (album) => album.date, render: (album) => album.date },
    {
      key: 'photos',
      header: 'Photos',
      sortValue: (album) => album.images.length,
      render: (album) => album.images.length,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (album) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button type="button" className={actionBtn} onClick={() => setPreviewing(album)}>
            <ExternalLink className="h-3.5 w-3.5" /> Preview
          </button>
          {canManage && (
            <>
              <button type="button" className={actionBtn} onClick={() => openDraft(album, false)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button type="button" className={dangerBtn} onClick={() => setDeleting(album)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const save = async () => {
    if (!draft) return;
    if (!canManage) {
      setError('You do not have permission to manage the gallery.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    let uploadedCover: { url: string; path: string } | null = null;
    const previousCoverPath = draft.coverImagePath;

    try {
      if (selectedCover) {
        uploadedCover = await galleryService.uploadCoverImage(selectedCover, draft.id || crypto.randomUUID());
      }

      const input: AlbumSaveInput = {
        title: draft.title,
        date: draft.date,
        description: draft.description,
        coverImageUrl: uploadedCover?.url ?? draft.coverImage,
        coverImagePath: uploadedCover?.path ?? draft.coverImagePath,
      };

      const saved = isNew ? await galleryService.create(input) : await galleryService.update(draft.id, input);
      if (previousCoverPath && previousCoverPath !== saved.coverImagePath) {
        void galleryService.removeCoverImage(previousCoverPath);
      }

      setAlbums((items) => {
        const exists = items.some((item) => item.id === saved.id);
        const next = exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items];
        return next.sort((a, b) => b.date.localeCompare(a.date));
      });

      // A new album is kept open on its saved id so the photo section unlocks in place —
      // uploading needs an album row to hang the photos off.
      if (isNew) {
        setDraft(saved);
        setIsNew(false);
        setPhotos(saved.images);
        setSelectedCover(null);
        setSuccess('Album created. You can add its photos now.');
      } else {
        closeDraft();
        setSuccess('Album updated successfully.');
      }
    } catch (err) {
      if (uploadedCover) void galleryService.removeCoverImage(uploadedCover.path);
      setError(getCleanError(err, 'Failed to save the album.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    if (!canManage) {
      setError('You do not have permission to manage the gallery.');
      setDeleting(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await galleryService.remove(deleting.id);
      setAlbums((items) => items.filter((item) => item.id !== deleting.id));
      setPreviewing((current) => (current?.id === deleting.id ? null : current));
      if (draft?.id === deleting.id) closeDraft();
      setDeleting(null);
      setSuccess('Album deleted successfully.');
    } catch (err) {
      setError(getCleanError(err, 'Failed to delete the album.'));
    } finally {
      setSaving(false);
    }
  };

  const movePhoto = (index: number, direction: -1 | 1) => {
    if (!draft) return;
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;

    const orderedIds = photos.map((photo) => photo.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    void runPhotoAction(() => galleryService.setPhotoOrder(draft.id, orderedIds), draft.id);
  };

  return (
    <div>
      <AdminTopbar
        title="Gallery"
        subtitle="Photo albums shown on the Gallery page"
        action={
          canManage ? (
            <button
              type="button"
              onClick={() => openDraft(emptyAlbum(), true)}
              className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              <Plus className="h-4 w-4" /> New Album
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
          <EmptyState title="Loading gallery" description="Fetching the album list." />
        ) : (
          <AdminTable
            columns={columns}
            rows={albums}
            rowKey={(album) => album.id}
            searchable={(album) => `${album.title} ${album.description}`}
            emptyTitle="No albums yet"
            emptyMessage="Create the first album when there are photos to show."
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!draft}
        title={isNew ? 'New Album' : 'Edit Album'}
        subtitle="Album details are saved with the button below; photo changes save as you make them."
        onClose={closeDraft}
        footer={
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:opacity-70"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isNew ? 'Create album' : 'Save'}
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
            {/* Creating an album leaves the drawer open so photos can go in, and the banner on
                the page behind it is hidden by the overlay — so it is repeated here. */}
            {success && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {success}
              </div>
            )}
            <AdminField label="Cover image" hint="PNG, JPG, or WebP. Optional.">
              <AlbumCoverField
                imageUrl={draft.coverImage}
                selectedFile={selectedCover}
                onFileChange={setSelectedCover}
              />
            </AdminField>
            <AdminField label="Album title" required>
              <AdminInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </AdminField>
            <AdminField label="Date" required>
              <AdminInput
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </AdminField>
            <AdminField label="Description">
              <AdminTextarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </AdminField>

            <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">
                  Photos <span className="font-mono text-[11px] text-slate-400">{photos.length}</span>
                </span>
                {photoBusy && <Loader2 className="h-4 w-4 animate-spin text-ieee-orange" />}
              </div>

              {isNew ? (
                <p className="rounded-xl bg-cream/70 px-3 py-2 text-xs text-slate-500">
                  Create the album first — photos are stored against it, so it has to exist before they
                  can be uploaded.
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-400">
                    Each change here is saved immediately, so two people editing the same album cannot
                    overwrite each other's photos.
                  </p>

                  {photoError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                      {photoError}
                    </div>
                  )}

                  {photos.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {photos.map((photo, index) => (
                        <PhotoRow
                          key={photo.id}
                          photo={photo}
                          index={index}
                          total={photos.length}
                          busy={photoBusy || !canManage}
                          onCaptionCommit={(caption) =>
                            void runPhotoAction(async () => {
                              await galleryService.updateCaption(photo.id, caption);
                              return galleryService.listPhotos(draft.id);
                            }, draft.id)
                          }
                          onMove={(direction) => movePhoto(index, direction)}
                          onRemove={() =>
                            void runPhotoAction(() => galleryService.removePhoto(photo), draft.id)
                          }
                        />
                      ))}
                    </ul>
                  )}

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoBusy}
                      className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-500 transition hover:border-ieee-orange/60 hover:text-ieee-orange disabled:opacity-60"
                    >
                      <ImagePlus className="h-4 w-4" /> Add photos
                    </button>
                  )}

                  <input
                    ref={photoInputRef}
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = '';
                      if (files.length > 0) {
                        void runPhotoAction(() => galleryService.addPhotos(draft.id, files), draft.id);
                      }
                    }}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </AdminEditDrawer>

      <AdminEditDrawer open={!!previewing} title="Public Preview" onClose={() => setPreviewing(null)}>
        {previewing && <AlbumPublicPreview album={previewing} />}
      </AdminEditDrawer>

      <ConfirmModal
        open={!!deleting}
        title="Delete this album?"
        description="The album, its photos and their uploaded files are removed from the site."
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
