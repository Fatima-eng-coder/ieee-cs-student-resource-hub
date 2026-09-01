/**
 * Photo albums and the photos inside them.
 *
 * The album's own fields are drafted in the admin drawer and saved as one record. Photos are
 * not: every add, caption edit, reorder and removal writes immediately and returns the album's
 * photo list as the database now holds it. Two content managers with the same album open is a
 * normal afternoon here, and a drawer that batched the whole list into one save would let
 * whoever pressed Save second erase the other's photos without either of them seeing it.
 *
 * gallery_photos cascades on album delete but the storage objects do not, so the delete path
 * reads the photo paths before the row goes and sweeps them out of the bucket.
 */

import { supabase } from '@/lib/supabase';
import type { GalleryAlbum, GalleryImage } from '@/types';

/**
 * Gallery art shares the events bucket rather than getting one of its own, because creating a
 * bucket is a dashboard action no migration in this repo can perform. The `gallery/` prefix
 * keeps the two apart when someone browses the bucket.
 *
 * Only the student `submissions/<uid>/` policies on that bucket are in migrations; the
 * content-manager ones were made in the dashboard and exist there alone. They test nothing but
 * the bucket and `private.can_manage_content()`, so this prefix is covered — but a rebuild from
 * migrations alone would not carry them, and uploads here would 403 until they are recreated.
 */
const GALLERY_BUCKET = 'event-images';
const GALLERY_PREFIX = 'gallery';

const albumColumns =
  'id,title,date,description,cover_image_url,cover_image_path,sort_order,created_at,updated_at';
const photoColumns = 'id,album_id,image_url,image_path,caption,sort_order,created_at';

interface GalleryAlbumRow {
  id: string;
  title: string;
  date: string;
  description: string | null;
  cover_image_url: string | null;
  cover_image_path: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

interface GalleryPhotoRow {
  id: string;
  album_id: string;
  image_url: string;
  image_path: string | null;
  caption: string | null;
  sort_order: number | null;
  created_at: string;
}

/** A photo plus the two columns only the admin cares about: where the file lives, and where it sits. */
export interface AdminGalleryPhoto extends GalleryImage {
  albumId: string;
  imagePath: string | null;
  sortOrder: number;
}

/** The public album shape plus the storage path behind the cover and the row's timestamps. */
export interface AdminGalleryAlbum extends GalleryAlbum {
  coverImagePath: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  images: AdminGalleryPhoto[];
}

export interface AlbumSaveInput {
  title: string;
  date: string;
  description: string;
  coverImageUrl: string;
  coverImagePath: string | null;
}

const toPhoto = (row: GalleryPhotoRow): AdminGalleryPhoto => ({
  id: row.id,
  albumId: row.album_id,
  url: row.image_url,
  caption: row.caption ?? '',
  imagePath: row.image_path,
  sortOrder: row.sort_order ?? 0,
});

const toAlbum = (row: GalleryAlbumRow, photos: AdminGalleryPhoto[]): AdminGalleryAlbum => ({
  id: row.id,
  title: row.title,
  date: row.date,
  description: row.description ?? '',
  coverImage: row.cover_image_url ?? '',
  coverImagePath: row.cover_image_path,
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  images: photos,
});

const toAlbumPayload = (input: AlbumSaveInput) => ({
  title: input.title.trim(),
  date: input.date,
  description: input.description.trim(),
  cover_image_url: input.coverImageUrl.trim() || null,
  cover_image_path: input.coverImagePath ?? null,
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isAlbumId = (id: string | undefined): id is string => typeof id === 'string' && UUID_PATTERN.test(id);

/** Everything the database would refuse, named in the admin's own words first. */
function assertAlbumInput(input: AlbumSaveInput): void {
  if (!input.title.trim()) throw new Error('Please enter the album title.');
  if (!input.date) throw new Error('Please select the album date.');
}

const friendlyReadError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'The gallery could not be loaded because access to it is currently restricted.';
  }
  if (lower.includes('does not exist') || lower.includes('schema cache')) {
    return 'The gallery is not ready yet. Please check the gallery tables and Data API settings.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'The gallery could not be loaded right now. Please try again later.';
};

/** Said whenever a write names a row the database no longer holds, however that is discovered. */
const STALE_ROW_MESSAGE = 'That album or photo is no longer there. Reload the gallery to see what is stored.';

const friendlyWriteError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Only content managers can change the gallery.';
  }
  if (lower.includes('gallery_albums_title_check')) {
    return 'Please enter the album title.';
  }
  if (lower.includes('gallery_photos_image_url_check')) {
    return 'That photo has no image address to store.';
  }
  if (lower.includes('foreign key') || lower.includes('gallery_photos_album_id_fkey')) {
    return 'This album no longer exists. Reload the gallery and try again.';
  }
  // PostgREST's answer when a single-row write matched nothing, which here almost always means
  // another content manager deleted the album or the photo while this drawer was open.
  if (lower.includes('multiple (or no) rows') || lower.includes('0 rows')) {
    return STALE_ROW_MESSAGE;
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'The gallery could not be saved right now. Please try again.';
};

const friendlyStorageError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied') || lower.includes('unauthorized')) {
    return 'Only content managers can upload gallery photos.';
  }
  if (lower.includes('exceeded') || lower.includes('too large') || lower.includes('payload')) {
    return 'That image is too large to upload. Please pick a smaller version.';
  }
  return 'That photo could not be uploaded right now. Please try again.';
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function assertGalleryImage(file: File): void {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(`"${file.name}" is not a PNG, JPG or WebP image.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" is larger than 5 MB. Please pick a smaller version.`);
  }
}

/** Index-suffixed so two files chosen in the same millisecond cannot collide. */
function safeFileName(file: File, index: number): string {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${Date.now()}-${index}-${base || 'gallery-photo'}.${extension}`;
}

/**
 * Best effort by design. Every caller has already done, or is about to do, the thing that
 * actually matters to the admin; a bucket that refused the removal must not turn a completed
 * delete into an error message. An orphaned file costs storage, a half-reported delete costs
 * the admin's trust in the screen.
 */
async function sweepStorage(paths: (string | null)[]): Promise<void> {
  const present = paths.filter((path): path is string => Boolean(path));
  if (present.length === 0) return;

  const { error } = await supabase.storage.from(GALLERY_BUCKET).remove(present);
  if (error) console.warn('Gallery photos could not be removed from storage', error);
}

/**
 * sort_order is a dense 0..n-1 index, and nothing in the database enforces that. Two admins
 * appending at the same moment both compute the same next index, so the read breaks the tie on
 * created_at and then id — a stable order beats an order the planner is free to change between
 * two reads of the same album.
 */
async function fetchPhotos(albumIds: string[]): Promise<GalleryPhotoRow[]> {
  if (albumIds.length === 0) return [];

  const { data, error } = await supabase
    .from('gallery_photos')
    .select(photoColumns)
    .in('album_id', albumIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw new Error(friendlyReadError(error.message));
  return (data ?? []) as GalleryPhotoRow[];
}

/**
 * sort_order leads the album ordering so a pinned album can sit ahead of a newer one. Nothing
 * in the admin UI sets it yet, and every row defaults to 0, so today this reads as plain
 * newest-first — but the column is in the schema and an ordering that ignores it would put the
 * gallery in a different order than a DBA who sets it would expect.
 */
async function fetchAlbums(): Promise<GalleryAlbumRow[]> {
  const { data, error } = await supabase
    .from('gallery_albums')
    .select(albumColumns)
    .order('sort_order', { ascending: true })
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(friendlyReadError(error.message));
  return (data ?? []) as GalleryAlbumRow[];
}

/** Kept module-level so the service's own methods can reach it without going through `this`. */
const listPhotosFor = async (albumId: string): Promise<AdminGalleryPhoto[]> =>
  (await fetchPhotos([albumId])).map(toPhoto);

export const galleryService = {
  /** Every album with its photos. The gallery has no draft state, so admin and public read the same list. */
  async list(): Promise<AdminGalleryAlbum[]> {
    const albums = await fetchAlbums();
    if (albums.length === 0) return [];

    const photos = await fetchPhotos(albums.map((album) => album.id));
    return albums.map((album) =>
      toAlbum(
        album,
        photos.filter((photo) => photo.album_id === album.id).map(toPhoto)
      )
    );
  },

  async get(id?: string): Promise<AdminGalleryAlbum | null> {
    // A link to a localStorage-era album id (`gal-1`) is not a uuid; Postgres would answer
    // that with a cast error, and a bookmark from before this move deserves "not found"
    // rather than a page telling the visitor the gallery is broken.
    if (!isAlbumId(id)) return null;

    const { data, error } = await supabase
      .from('gallery_albums')
      .select(albumColumns)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(friendlyReadError(error.message));
    if (!data) return null;

    const photos = await fetchPhotos([id]);
    return toAlbum(data as GalleryAlbumRow, photos.map(toPhoto));
  },

  /**
   * Just how many albums there are. The dashboard tile wants a number, and list() would fetch
   * every album and then every photo row belonging to them to produce it.
   *
   * `head: true` asks PostgREST for the Content-Range header and no body at all. Null comes
   * back only if that header is missing, which is not a count of zero and must not be shown
   * as one — the caller is told the read did not answer.
   */
  async count(): Promise<number | null> {
    const { count, error } = await supabase
      .from('gallery_albums')
      .select('id', { count: 'exact', head: true });

    if (error) throw new Error(friendlyReadError(error.message));
    return count;
  },

  async listPhotos(albumId: string): Promise<AdminGalleryPhoto[]> {
    return listPhotosFor(albumId);
  },

  async create(input: AlbumSaveInput): Promise<AdminGalleryAlbum> {
    assertAlbumInput(input);

    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('gallery_albums')
      .insert({ ...toAlbumPayload(input), created_by: userData.user?.id ?? null })
      .select(albumColumns)
      .single();

    if (error) throw new Error(friendlyWriteError(error.message));
    return toAlbum(data as GalleryAlbumRow, []);
  },

  /**
   * Album fields only. Photos are never sent from here, so an admin saving a title cannot
   * roll back a photo another admin added while the drawer was open.
   */
  async update(id: string, input: AlbumSaveInput): Promise<AdminGalleryAlbum> {
    assertAlbumInput(input);

    await refreshAuthSession();
    const { data, error } = await supabase
      .from('gallery_albums')
      .update(toAlbumPayload(input))
      .eq('id', id)
      .select(albumColumns)
      .single();

    if (error) throw new Error(friendlyWriteError(error.message));

    const photos = await fetchPhotos([id]);
    return toAlbum(data as GalleryAlbumRow, photos.map(toPhoto));
  },

  /**
   * The photo rows cascade away with the album, so their paths are read while the rows still
   * name them — but swept only once the album is actually gone. Sweeping first and then failing
   * to delete would leave the album on the public site with every photo 404ing; sweeping last
   * costs at worst an orphaned file nobody can see. The sweep is best effort — see sweepStorage.
   */
  async remove(id: string): Promise<void> {
    await refreshAuthSession();

    const photos = await fetchPhotos([id]);
    const { data: album, error: coverError } = await supabase
      .from('gallery_albums')
      .select('cover_image_path')
      .eq('id', id)
      .maybeSingle();

    // Without this a refused read looks exactly like an album that never had a cover, and the
    // file is left in the bucket with nothing recording that it was ever meant to go.
    if (coverError) console.warn('Gallery album cover path could not be read before delete', coverError);

    /*
     * Counted, and the count is load-bearing rather than decorative.
     *
     * Postgres applies an RLS USING clause to DELETE by filtering rows, not by raising: a
     * caller the policy declines removes zero rows and PostgREST answers 204 with no error at
     * all. Unchecked, this method then reported success and swept every photo file and the
     * cover out of the bucket — for an album that is still in the database. It would come back
     * on the next load with all of its photos 404ing and the files gone for good.
     *
     * That is reachable without anyone doing anything strange: canManageContent() reads a
     * profile cached at login, so an admin demoted mid-session still passes the client gate
     * while the database says no.
     */
    const { error, count } = await supabase
      .from('gallery_albums')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw new Error(friendlyWriteError(error.message));
    // Only an explicit zero. A null count means the server did not send the header, which is
    // not evidence of anything and must not be read as failure.
    if (count === 0) throw new Error(STALE_ROW_MESSAGE);

    await sweepStorage([
      ...photos.map((photo) => photo.image_path),
      (album as { cover_image_path: string | null } | null)?.cover_image_path ?? null,
    ]);
  },

  /**
   * Uploads then inserts, in that order, because gallery_photos.image_url is NOT NULL and
   * CHECKed non-empty: there is no valid row to write until the file exists. Anything that
   * fails after an upload sweeps its own files back out before it rethrows.
   *
   * The returned list is re-read rather than assembled from the inserts, so a photo another
   * admin added or deleted meanwhile shows up here instead of being papered over.
   */
  async addPhotos(albumId: string, files: File[]): Promise<AdminGalleryPhoto[]> {
    if (files.length === 0) return listPhotosFor(albumId);
    for (const file of files) assertGalleryImage(file);

    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();

    const existing = await fetchPhotos([albumId]);
    const nextIndex = existing.reduce((max, photo) => Math.max(max, (photo.sort_order ?? 0) + 1), 0);

    const uploaded: { url: string; path: string }[] = [];

    try {
      for (const [index, file] of files.entries()) {
        const path = `${GALLERY_PREFIX}/${albumId}/${safeFileName(file, index)}`;
        const { error } = await supabase.storage
          .from(GALLERY_BUCKET)
          .upload(path, file, { cacheControl: '3600', upsert: false });

        if (error) throw new Error(friendlyStorageError(error.message));

        const { data } = supabase.storage.from(GALLERY_BUCKET).getPublicUrl(path);
        uploaded.push({ url: data.publicUrl, path });
      }

      const { error } = await supabase.from('gallery_photos').insert(
        uploaded.map((item, index) => ({
          album_id: albumId,
          image_url: item.url,
          image_path: item.path,
          caption: '',
          sort_order: nextIndex + index,
          created_by: userData.user?.id ?? null,
        }))
      );

      if (error) throw new Error(friendlyWriteError(error.message));
    } catch (cause) {
      await sweepStorage(uploaded.map((item) => item.path));
      throw cause;
    }

    return listPhotosFor(albumId);
  },

  async updateCaption(photoId: string, caption: string): Promise<AdminGalleryPhoto> {
    await refreshAuthSession();
    const { data, error } = await supabase
      .from('gallery_photos')
      .update({ caption: caption.trim() })
      .eq('id', photoId)
      .select(photoColumns)
      .single();

    if (error) throw new Error(friendlyWriteError(error.message));
    return toPhoto(data as GalleryPhotoRow);
  },

  /** The row goes first: a file swept from a row that then survives would show as a broken photo. */
  async removePhoto(photo: AdminGalleryPhoto): Promise<AdminGalleryPhoto[]> {
    await refreshAuthSession();

    // Same reasoning as remove(): a refusal comes back as zero rows and no error, and the
    // sweep below is irreversible.
    const { error, count } = await supabase
      .from('gallery_photos')
      .delete({ count: 'exact' })
      .eq('id', photo.id);

    if (error) throw new Error(friendlyWriteError(error.message));
    if (count === 0) throw new Error(STALE_ROW_MESSAGE);

    await sweepStorage([photo.imagePath]);
    return listPhotosFor(photo.albumId);
  },

  /**
   * Renumbers the album to a dense 0..n-1 index in the order the caller asks for.
   *
   * Every write is an UPDATE keyed on an id the database just returned, never an upsert: an
   * upsert carrying the caller's stale list would re-insert a photo another admin had deleted,
   * and a resurrected photo is the one thing worse than a stale order. Ids the caller has not
   * heard of — a photo added elsewhere since the drawer opened — keep their place at the end
   * rather than being renumbered into the middle of someone else's arrangement.
   *
   * The renumber is a batch of independent statements rather than one transaction, so an update
   * that fails after others have landed leaves duplicate sort_order values. The read's
   * created_at and id tie-break keeps that list stable and the next accepted reorder makes it
   * dense again, but the admin is told the order may be part-applied rather than left to read
   * it as the one they asked for.
   */
  async setPhotoOrder(albumId: string, orderedIds: string[]): Promise<AdminGalleryPhoto[]> {
    await refreshAuthSession();

    const current = await fetchPhotos([albumId]);
    const byId = new Map(current.map((photo) => [photo.id, photo]));
    const known = orderedIds.filter((id) => byId.has(id));

    // An id the album no longer holds means the list this order was drawn from is gone —
    // another content manager deleted a photo while the drawer was open. Renumbering only the
    // survivors would store an arrangement nobody asked for, and when every id is stale there
    // is nothing left to write, so this would otherwise resolve as though the move had saved.
    if (known.length !== orderedIds.length) throw new Error(STALE_ROW_MESSAGE);

    const knownSet = new Set(known);
    const appended = current.filter((photo) => !knownSet.has(photo.id)).map((photo) => photo.id);
    const finalOrder = [...known, ...appended];

    const changed = finalOrder
      .map((id, index) => ({ id, index }))
      .filter(({ id, index }) => (byId.get(id)?.sort_order ?? 0) !== index);

    const results = await Promise.all(
      changed.map(({ id, index }) =>
        supabase.from('gallery_photos').update({ sort_order: index }, { count: 'exact' }).eq('id', id)
      )
    );

    const failure = results.find((result) => result.error);
    if (failure?.error) {
      const message = friendlyWriteError(failure.error.message);
      throw new Error(
        changed.length > 1
          ? `${message} Some photos may have kept their old position; the order shown is what is stored.`
          : message
      );
    }

    // A row the policy refuses to update matches nothing and comes back without an error at
    // all, so the affected-row count is the only thing separating a stored reorder from one
    // the database quietly declined.
    if (results.some((result) => result.count === 0)) throw new Error(STALE_ROW_MESSAGE);

    return listPhotosFor(albumId);
  },

  async uploadCoverImage(file: File, albumId: string): Promise<{ url: string; path: string }> {
    assertGalleryImage(file);
    await refreshAuthSession();

    const path = `${GALLERY_PREFIX}/${albumId}/cover-${safeFileName(file, 0)}`;
    const { error } = await supabase.storage
      .from(GALLERY_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) throw new Error(friendlyStorageError(error.message));

    const { data } = supabase.storage.from(GALLERY_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  /**
   * Called after a cover has been replaced or a save was rolled back, both of which can be the
   * first bucket write in a while. The sweep only warns, so an expired token here would orphan
   * the file with nobody the wiser — the refresh is what keeps that from being routine.
   */
  async removeCoverImage(path?: string | null): Promise<void> {
    if (!path) return;

    await refreshAuthSession();
    await sweepStorage([path]);
  },
};
