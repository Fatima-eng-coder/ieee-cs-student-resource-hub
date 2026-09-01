import { useEffect, useState } from 'react';
import { galleryService, type AdminGalleryAlbum } from '@/services/galleryService';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import GalleryAlbumCard from '@/components/cards/GalleryAlbumCard';
import EmptyState from '@/components/ui/EmptyState';

export default function GalleryPage() {
  const [albums, setAlbums] = useState<AdminGalleryAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    galleryService
      .list()
      .then((items) => {
        if (!ignore) setAlbums(items);
      })
      .catch((err: unknown) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'The gallery could not be loaded.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const totalPhotos = albums.reduce((sum, album) => sum + album.images.length, 0);

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Moments"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Gallery' }]}
        title="Gallery"
        subtitle="Photos from our events, workshops and expos — a look back at what the chapter has been up to."
        meta={[
          { value: `${albums.length}`, label: 'Albums' },
          { value: `${totalPhotos}`, label: 'Photos' },
        ]}
      />

      <PageSection tone="cream" top>
        {loading ? (
          <EmptyState title="Loading gallery" description="Fetching the albums from the society database." />
        ) : error ? (
          // Never an empty grid on a failed read: "no albums yet" and "we could not ask" are
          // different things, and only one of them is the visitor's cue to come back later.
          <EmptyState title="Gallery unavailable" description={error} />
        ) : albums.length === 0 ? (
          <EmptyState title="No albums yet" description="Photos from upcoming events will appear here." />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((album) => (
              <GalleryAlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
