import { useEffect, useMemo, useState } from 'react';
import { Check, ImageIcon, Loader2, Search, X } from 'lucide-react';

import { galleryService, type AdminGalleryAlbum } from '@/services/galleryService';

/**
 * Pick a picture that is already on the site.
 *
 * Every image field in the portal was upload-only: to put a photo that is already in the gallery
 * onto a banner, or to make one of an album's own photos its cover, an admin had to find the
 * original file on their machine and upload it a second time. That produces two objects in the
 * bucket holding identical bytes, and the copy drifts the moment one of them is replaced.
 *
 * What is selected here is the URL that already exists, not a copy of the file — and
 * deliberately not a foreign key to the photo row either. "Use this picture" means take a
 * reference to it; if the photo is later removed from its album, a banner built from it should
 * not vanish with it or be left pointing at nothing. See the note in 20260907004000.
 */

export interface PickedPhoto {
  url: string;
  /** The bucket path, when the picked image is a gallery photo that has one. */
  path: string | null;
  caption: string;
}

export default function GalleryPhotoPicker({
  open,
  onClose,
  onPick,
  /** Restrict to one album — used for "choose a cover from this album's own photos". */
  albumId,
  title = 'Choose a photo',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (photo: PickedPhoto) => void;
  albumId?: string;
  title?: string;
}) {
  const [albums, setAlbums] = useState<AdminGalleryAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Loaded when the picker opens rather than with the page: an admin who never reaches for an
  // existing photo should not pay for the whole gallery on every visit to the banners screen.
  useEffect(() => {
    if (!open) return;
    let ignore = false;

    setLoading(true);
    setError(null);
    galleryService
      .list()
      .then((items) => {
        if (!ignore) setAlbums(items);
      })
      .catch((cause) => {
        if (!ignore) setError(cause instanceof Error ? cause.message : 'The gallery could not be loaded.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const photos = useMemo(() => {
    const scoped = albumId ? albums.filter((album) => album.id === albumId) : albums;
    const flat = scoped.flatMap((album) =>
      album.images.map((photo) => ({
        id: photo.id,
        url: photo.url,
        path: photo.imagePath ?? null,
        caption: photo.caption ?? '',
        album: album.title,
      }))
    );

    const needle = query.trim().toLowerCase();
    if (!needle) return flat;
    return flat.filter(
      (photo) =>
        photo.caption.toLowerCase().includes(needle) || photo.album.toLowerCase().includes(needle)
    );
  }, [albums, albumId, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ieee-ink/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-3xl border border-black/5 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/5 p-4 sm:p-5">
          <h3 className="font-display text-lg font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 border-b border-black/5 p-4 sm:px-5">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={albumId ? 'Search this album…' : 'Search by caption or album…'}
              aria-label="Search photos"
              className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-ieee-orange focus:ring-2 focus:ring-ieee-orange/20"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-ieee-orange" /> Loading the gallery…
            </div>
          ) : error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </p>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <ImageIcon aria-hidden="true" className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                {query.trim()
                  ? 'No photo matches that.'
                  : albumId
                    ? 'This album has no photos yet.'
                    : 'The gallery has no photos yet.'}
              </p>
              <p className="max-w-xs text-xs text-slate-400">
                {albumId
                  ? 'Add photos to the album first, then one of them can be its cover.'
                  : 'Upload photos to a gallery album and they can be reused here.'}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((photo) => (
                <li key={photo.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ url: photo.url, path: photo.path, caption: photo.caption });
                      onClose();
                    }}
                    className="group relative block w-full overflow-hidden rounded-xl border border-black/5 bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-ieee-orange"
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || photo.album}
                      loading="lazy"
                      className="h-28 w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-ieee-ink/0 opacity-0 transition group-hover:bg-ieee-ink/40 group-hover:opacity-100">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ieee-orange">
                        <Check className="h-4 w-4" strokeWidth={3} />
                      </span>
                    </span>
                    <span className="block truncate px-2 py-1.5 text-left text-[11px] text-slate-500">
                      {photo.caption || photo.album}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
