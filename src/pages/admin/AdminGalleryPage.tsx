import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  Clock3,
  ExternalLink,
  ImagePlus,
  Images,
  Loader2,
  Pencil,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Trash2,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import GalleryPhotoPicker, { type PickedPhoto } from '@/components/admin/GalleryPhotoPicker';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminTextarea } from '@/components/admin/AdminField';
import ConfirmModal from '@/components/ui/ConfirmModal';
import JustifiedPhotoGrid from '@/components/gallery/JustifiedPhotoGrid';
import { TILE_RATIO } from '@/components/gallery/tileShapes';
import EmptyState from '@/components/ui/EmptyState';
import { adminAuthService } from '@/services/adminAuthService';
import {
  galleryService,
  type AdminGalleryAlbum,
  type AdminGalleryPhoto,
  type AlbumSaveInput,
} from '@/services/galleryService';
import { hasFile } from '@/utils/files';
import { readImageOrientation, type ImageOrientation } from '@/utils/imageSize';

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange';
const dangerBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600';
const iconBtn =
  'flex h-7 w-7 items-center justify-center rounded-lg border border-black/5 bg-white text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:opacity-40';

const SHAPES: { value: ImageOrientation; label: string; Icon: LucideIcon }[] = [
  { value: 'landscape', label: 'Landscape', Icon: RectangleHorizontal },
  { value: 'portrait', label: 'Portrait', Icon: RectangleVertical },
];

/** 'auto' reads each picture's own shape as it is uploaded. */
type UploadShape = 'auto' | ImageOrientation;

const UPLOAD_SHAPES: { value: UploadShape; label: string; Icon: LucideIcon; hint: string }[] = [
  {
    value: 'auto',
    label: 'Auto',
    Icon: WandSparkles,
    hint: 'Each photo keeps the shape it was taken in. You can change any of them afterwards.',
  },
  {
    value: 'landscape',
    label: 'Landscape',
    Icon: RectangleHorizontal,
    hint: 'Every photo in this upload gets a wide tile. Tall photos are cropped to fit.',
  },
  {
    value: 'portrait',
    label: 'Portrait',
    Icon: RectangleVertical,
    hint: 'Every photo in this upload gets a tall tile. Wide photos are cropped to fit.',
  },
];

const ACCEPTED_PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface UploadItem {
  name: string;
  state: 'waiting' | 'uploading' | 'done' | 'failed';
  message?: string;
}

/** Wide or tall, as two small toggle buttons. */
function ShapeToggle({
  value,
  disabled,
  onChange,
}: {
  value: ImageOrientation | null;
  disabled: boolean;
  onChange: (shape: ImageOrientation) => void;
}) {
  return (
    <div role="group" aria-label="Photo shape" className="flex overflow-hidden rounded-lg border border-black/5 bg-white">
      {SHAPES.map(({ value: shape, label, Icon }) => {
        const active = value === shape;
        return (
          <button
            key={shape}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => {
              if (!active) onChange(shape);
            }}
            className={`flex h-7 w-8 items-center justify-center transition disabled:opacity-40 ${
              active ? 'bg-ieee-orange text-white' : 'text-slate-500 hover:text-ieee-orange'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

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
  albumId,
  onPickExisting,
}: {
  imageUrl: string;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  /** Empty for an album that has not been saved yet — it has no photos to choose from. */
  albumId: string;
  onPickExisting: (photo: PickedPhoto) => void;
}) {
  const [picking, setPicking] = useState(false);
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

      {/*
        "Use one of this album's photos" is the common case and had no path at all: the cover
        was upload-only, so making the third photo the cover meant finding that file again and
        uploading a second copy of bytes already in the bucket.
      */}
      {albumId ? (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-ieee-orange/30 px-3 py-2 text-xs font-semibold text-ieee-orange transition hover:bg-ieee-orange/5"
        >
          <Images className="h-3.5 w-3.5" /> Use one of this album&rsquo;s photos
        </button>
      ) : (
        <p className="rounded-xl border border-dashed border-black/10 px-3 py-2 text-[11px] text-slate-400">
          Save the album first to pick its cover from the photos inside it.
        </p>
      )}

      <GalleryPhotoPicker
        open={picking}
        albumId={albumId}
        title="Pick a cover from this album"
        onClose={() => setPicking(false)}
        onPick={(photo) => {
          // Clears any pending upload: two sources for one field, and the last answer wins.
          onFileChange(null);
          onPickExisting(photo);
        }}
      />

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
  selected,
  onToggleSelect,
  onCaptionCommit,
  onMove,
  onShapeChange,
  onRemove,
}: {
  photo: AdminGalleryPhoto;
  index: number;
  total: number;
  busy: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onCaptionCommit: (caption: string) => void;
  onMove: (direction: -1 | 1) => void;
  onShapeChange: (shape: ImageOrientation) => void;
  onRemove: () => void;
}) {
  const [caption, setCaption] = useState(photo.caption);

  useEffect(() => {
    setCaption(photo.caption);
  }, [photo]);

  return (
    <li
      className={`flex items-start gap-2.5 rounded-xl border bg-white p-2.5 transition ${
        selected ? 'border-ieee-orange/50 ring-1 ring-ieee-orange/25' : 'border-black/5'
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={busy}
        onChange={onToggleSelect}
        aria-label={`Select photo ${index + 1}`}
        className="mt-1 h-4 w-4 shrink-0 accent-ieee-orange"
      />
      {/* The thumbnail is drawn in the tile shape the album page will use, so a wrong shape is
          visible here before anyone opens the public page. Clicking it selects the photo. */}
      <button
        type="button"
        onClick={onToggleSelect}
        disabled={busy}
        aria-hidden="true"
        tabIndex={-1}
        className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cream"
      >
        <img
          src={photo.url}
          alt=""
          style={photo.orientation ? { aspectRatio: TILE_RATIO[photo.orientation] } : undefined}
          className={`rounded-md ${
            photo.orientation === 'portrait'
              ? 'h-full object-cover'
              : photo.orientation === 'landscape'
                ? 'w-full object-cover'
                : 'h-full w-full object-contain'
          }`}
        />
      </button>
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
        <div className="flex flex-wrap items-center gap-1.5">
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
          <ShapeToggle value={photo.orientation} disabled={busy} onChange={onShapeChange} />
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
        <JustifiedPhotoGrid compact photos={album.images} />
      )}
      <p className="text-xs text-slate-400">
        Photos appear on the public album page in this order, in rows sized to fit the screen.
      </p>
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
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [removingPhotos, setRemovingPhotos] = useState<AdminGalleryPhoto[] | null>(null);
  const [uploadShape, setUploadShape] = useState<UploadShape>('auto');
  // Tagged with its album, so a drawer reopened on another album mid-upload does not show
  // (or receive) the first album's progress.
  const [uploads, setUploads] = useState<{ albumId: string; items: UploadItem[] } | null>(null);
  const [dragging, setDragging] = useState(false);
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
    setSelected(new Set());
    setDragging(false);
    setUploads((current) => (current?.albumId === album.id ? current : null));
    setPhotoError(null);
    setError(null);
    setSuccess(null);
  };

  const closeDraft = () => {
    setDraft(null);
    setSelectedCover(null);
    setPhotos([]);
    setSelected(new Set());
    setDragging(false);
    setPhotoError(null);
  };

  /*
   * Photos stored before shapes were recorded get one now, measured from the pictures.
   *
   * Only for someone who can write, only for photos with no shape, and the write itself only
   * fills blanks -- so a shape chosen while this was measuring is never overwritten, here or in
   * the database. The public page measures these photos on its own until this has run.
   */
  const openAlbumId = draft && !isNew ? draft.id : '';
  const unrecordedKey = JSON.stringify(
    openAlbumId && canManage ? photos.filter((photo) => !photo.orientation).map((photo) => [photo.id, photo.url]) : []
  );

  useEffect(() => {
    const unrecorded = JSON.parse(unrecordedKey) as [string, string][];
    if (!openAlbumId || unrecorded.length === 0) return;
    let ignore = false;

    void (async () => {
      const measured = (
        await Promise.all(
          unrecorded.map(async ([id, url]) => {
            const orientation = await readImageOrientation(url).catch(() => null);
            return orientation ? { id, orientation } : null;
          })
        )
      ).filter((item): item is { id: string; orientation: ImageOrientation } => item !== null);

      if (ignore || measured.length === 0) return;
      await galleryService.recordMeasuredOrientations(openAlbumId, measured);
      if (ignore) return;

      const found = new Map(measured.map((item) => [item.id, item.orientation]));
      const fill = (list: AdminGalleryPhoto[]) =>
        list.map((photo) => (photo.orientation ? photo : { ...photo, orientation: found.get(photo.id) ?? null }));

      setPhotos(fill);
      setAlbums((items) => items.map((item) => (item.id === openAlbumId ? { ...item, images: fill(item.images) } : item)));
      setPreviewing((current) => (current?.id === openAlbumId ? { ...current, images: fill(current.images) } : current));
    })();

    return () => {
      ignore = true;
    };
  }, [openAlbumId, unrecordedKey]);

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

      /*
       * Sweep the replaced cover -- unless it is one of the album's own photos.
       *
       * This guard arrived with "use one of this album's photos as the cover". Before that a
       * cover was always a file uploaded for the purpose, so the object under the old path was
       * owned by the cover alone and deleting it was free. A cover picked from the album points
       * at a photo that is still IN the album: sweeping it would delete a live photo's bytes
       * out of the bucket and leave a broken frame in the grid, from an action the admin would
       * read as "I changed the cover".
       */
      const albumPhotoPaths = new Set(
        (photos.length ? photos : saved.images).map((photo) => photo.imagePath).filter(Boolean)
      );
      if (
        previousCoverPath &&
        previousCoverPath !== saved.coverImagePath &&
        !albumPhotoPaths.has(previousCoverPath)
      ) {
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

  const selectedPhotos = photos.filter((photo) => selected.has(photo.id));
  const allSelected = photos.length > 0 && selectedPhotos.length === photos.length;

  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setShape = (ids: string[], shape: ImageOrientation) => {
    if (!draft || ids.length === 0) return;
    void runPhotoAction(() => galleryService.setPhotoOrientation(draft.id, ids, shape), draft.id);
  };

  const confirmRemovePhotos = async () => {
    if (!draft || !removingPhotos) return;
    const targets = removingPhotos;
    setRemovingPhotos(null);
    await runPhotoAction(() => galleryService.removePhotos(draft.id, targets), draft.id);
    setSelected(new Set());
  };

  /**
   * Any number of files, each reported on as it goes. The service saves every photo on its own,
   * so a bad file costs only itself -- see galleryService.addPhotos.
   */
  const uploadPhotos = async (chosen: File[]) => {
    if (!draft || chosen.length === 0) return;
    if (!canManage) {
      setPhotoError('You do not have permission to manage the gallery.');
      return;
    }

    const albumId = draft.id;
    const orientation = uploadShape === 'auto' ? null : uploadShape;
    setUploads({ albumId, items: chosen.map((file) => ({ name: file.name, state: 'waiting' })) });
    setPhotoBusy(true);
    setPhotoError(null);

    try {
      const { photos: next, failed } = await galleryService.addPhotos(
        albumId,
        chosen.map((file) => ({ file, orientation })),
        ({ index, state, message }) =>
          setUploads((current) =>
            current?.albumId === albumId
              ? {
                  albumId,
                  items: current.items.map((item, position) => (position === index ? { ...item, state, message } : item)),
                }
              : current
          )
      );
      applyPhotos(albumId, next);
      if (failed > 0) {
        setPhotoError(
          failed === chosen.length
            ? 'None of those photos could be added. The reasons are listed under each file.'
            : `${failed} of ${chosen.length} photos could not be added; the rest were saved. The reasons are listed under each file.`
        );
      }
    } catch (err) {
      setPhotoError(getCleanError(err, 'Those photos could not be added.'));
      try {
        applyPhotos(albumId, await galleryService.listPhotos(albumId));
      } catch {
        // The earlier message is the useful one.
      }
    } finally {
      setPhotoBusy(false);
    }
  };

  const uploadsHere = uploads && draft && uploads.albumId === draft.id ? uploads.items : null;
  const uploadsFinished = uploadsHere?.every((item) => item.state === 'done' || item.state === 'failed') ?? false;
  const uploadedCount = uploadsHere?.filter((item) => item.state === 'done').length ?? 0;

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
                albumId={draft.id}
                onPickExisting={(photo) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          coverImage: photo.url,
                          // The path is carried so the save path's "delete the old cover if it
                          // changed" sweep still knows what it is looking at. It points at the
                          // album's own photo, which the sweep must NOT delete -- see the guard
                          // added alongside this in save().
                          coverImagePath: photo.path,
                        }
                      : current
                  )
                }
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

                  {canManage && (
                    <div className="rounded-xl border border-black/5 bg-cream/60 p-3">
                      <p className="text-xs font-semibold text-slate-600">Shape for the photos you add</p>
                      <div role="radiogroup" aria-label="Shape for new photos" className="mt-2 grid grid-cols-3 gap-1.5">
                        {UPLOAD_SHAPES.map(({ value, label, Icon }) => {
                          const active = uploadShape === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              disabled={photoBusy}
                              onClick={() => setUploadShape(value)}
                              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                                active
                                  ? 'border-ieee-orange bg-ieee-orange text-white shadow-sm'
                                  : 'border-black/10 bg-white text-slate-600 hover:border-ieee-orange/50 hover:text-ieee-orange'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" /> {label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                        {UPLOAD_SHAPES.find((option) => option.value === uploadShape)?.hint}
                      </p>

                      {/* A drop target as well as a button: a whole event's photos are usually
                          dragged in from a folder rather than picked one by one. */}
                      <div
                        onDragOver={(e) => {
                          if (photoBusy || !Array.from(e.dataTransfer.types).includes('Files')) return;
                          e.preventDefault();
                          setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          if (photoBusy) return;
                          e.preventDefault();
                          setDragging(false);
                          const dropped = Array.from(e.dataTransfer.files).filter((file) =>
                            ACCEPTED_PHOTO_TYPES.includes(file.type)
                          );
                          if (dropped.length === 0) {
                            setPhotoError('Only PNG, JPG and WebP pictures can be added to an album.');
                            return;
                          }
                          void uploadPhotos(dropped);
                        }}
                        className={`mt-3 rounded-xl border-2 border-dashed transition ${
                          dragging ? 'border-ieee-orange bg-ieee-orange/5' : 'border-slate-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          disabled={photoBusy}
                          className="flex w-full flex-col items-center justify-center gap-1 px-3 py-3.5 text-slate-500 transition hover:text-ieee-orange disabled:opacity-60"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-semibold">
                            {photoBusy && uploadsHere && !uploadsFinished ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ImagePlus className="h-4 w-4" />
                            )}
                            Add photos
                          </span>
                          <span className="text-[11px] font-normal text-slate-400">
                            Select or drop as many as you like. PNG, JPG or WebP, up to 5 MB each.
                          </span>
                        </button>
                      </div>

                      {uploadsHere && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
                            <span>
                              {uploadsFinished
                                ? `${uploadedCount} of ${uploadsHere.length} added`
                                : `Adding ${uploadedCount + 1} of ${uploadsHere.length}`}
                            </span>
                            {uploadsFinished && (
                              <button
                                type="button"
                                onClick={() => setUploads(null)}
                                className="text-slate-400 transition hover:text-ieee-orange"
                              >
                                Clear list
                              </button>
                            )}
                          </div>
                          <ul className="mt-1.5 flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
                            {uploadsHere.map((item, position) => (
                              <li key={`${position}-${item.name}`} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px]">
                                <span className="flex items-center gap-2">
                                  {item.state === 'done' ? (
                                    <CircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                  ) : item.state === 'failed' ? (
                                    <CircleAlert className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                                  ) : item.state === 'uploading' ? (
                                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ieee-orange" />
                                  ) : (
                                    <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                  )}
                                  <span className="min-w-0 truncate font-medium text-slate-600">{item.name}</span>
                                </span>
                                {item.state === 'failed' && item.message && (
                                  <span className="mt-0.5 block pl-5.5 text-rose-600">{item.message}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {photos.length > 0 && canManage && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white px-3 py-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(element) => {
                            if (element) element.indeterminate = selectedPhotos.length > 0 && !allSelected;
                          }}
                          disabled={photoBusy}
                          onChange={() =>
                            setSelected(allSelected ? new Set() : new Set(photos.map((photo) => photo.id)))
                          }
                          className="h-4 w-4 accent-ieee-orange"
                        />
                        {selectedPhotos.length > 0 ? `${selectedPhotos.length} selected` : 'Select all'}
                      </label>
                      {selectedPhotos.length > 0 && (
                        <div className="ml-auto flex flex-wrap items-center gap-1.5">
                          {SHAPES.map(({ value, label, Icon }) => (
                            <button
                              key={value}
                              type="button"
                              disabled={photoBusy}
                              className={`${actionBtn} disabled:opacity-50`}
                              onClick={() => setShape(selectedPhotos.map((photo) => photo.id), value)}
                            >
                              <Icon className="h-3.5 w-3.5" /> {label}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={photoBusy}
                            className={`${dangerBtn} disabled:opacity-50`}
                            onClick={() => setRemovingPhotos(selectedPhotos)}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        </div>
                      )}
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
                          selected={selected.has(photo.id)}
                          onToggleSelect={() => toggleSelected(photo.id)}
                          onCaptionCommit={(caption) =>
                            void runPhotoAction(async () => {
                              await galleryService.updateCaption(photo.id, caption);
                              return galleryService.listPhotos(draft.id);
                            }, draft.id)
                          }
                          onMove={(direction) => movePhoto(index, direction)}
                          onShapeChange={(shape) => setShape([photo.id], shape)}
                          onRemove={() =>
                            void runPhotoAction(() => galleryService.removePhoto(photo), draft.id)
                          }
                        />
                      ))}
                    </ul>
                  )}

                  {photos.length > 0 && (
                    <details className="group rounded-xl border border-black/5 bg-white">
                      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600 transition hover:text-ieee-orange">
                        How the album will look
                      </summary>
                      <div className="border-t border-black/5 p-3">
                        <JustifiedPhotoGrid compact photos={photos} />
                        <p className="mt-2 text-[11px] text-slate-400">
                          Rows are resized to fill the screen, so wider screens fit more photos in each row.
                        </p>
                      </div>
                    </details>
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
                      if (files.length > 0) void uploadPhotos(files);
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
        description="The album, its photos and their uploaded files are removed from the site. A picture a homepage banner still uses is kept for the banner."
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      <ConfirmModal
        open={!!removingPhotos}
        title={
          removingPhotos?.length === 1 ? 'Remove this photo?' : `Remove ${removingPhotos?.length ?? 0} photos?`
        }
        description="They are taken out of this album and their files deleted. A picture the album cover or a homepage banner still uses is kept for it."
        confirmLabel="Remove"
        danger
        onCancel={() => setRemovingPhotos(null)}
        onConfirm={() => void confirmRemovePhotos()}
      />
    </div>
  );
}
