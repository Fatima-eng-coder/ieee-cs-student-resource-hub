import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { galleryService, type AdminGalleryAlbum } from '@/services/galleryService';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import EmptyState from '@/components/ui/EmptyState';
import Lightbox from '@/components/ui/Lightbox';
import JustifiedPhotoGrid from '@/components/gallery/JustifiedPhotoGrid';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const backToGallery = (
  <Link
    to="/gallery"
    className="rounded-lg bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
  >
    Back to Gallery
  </Link>
);

/** The hero for every state this page can be in, so a failed read still reads as a real page. */
function AlbumShell({
  title,
  subtitle,
  crumb,
  children,
}: {
  title: string;
  subtitle: string;
  crumb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Gallery"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Gallery', to: '/gallery' }, { label: crumb }]}
        title={title}
        subtitle={subtitle}
      />
      <PageSection tone="cream" top>
        {children}
      </PageSection>
    </div>
  );
}

export default function GalleryAlbumPage() {
  const { id } = useParams();
  const [album, setAlbum] = useState<AdminGalleryAlbum | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Index of the photo being viewed full screen; null when the grid is all there is. */
  const [viewing, setViewing] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    galleryService
      .get(id)
      .then((found) => {
        if (!ignore) setAlbum(found);
      })
      .catch((err: unknown) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'This album could not be loaded.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  if (loading) {
    return (
      <AlbumShell title="Loading album" subtitle="Fetching this album's photos." crumb="Album">
        <EmptyState title="Loading album" description="One moment while the photos are fetched." />
      </AlbumShell>
    );
  }

  // A read that failed is not an album that is missing, and telling a visitor their link is
  // wrong when the database simply refused us sends them to look for a problem they do not have.
  if (error) {
    return (
      <AlbumShell
        title="Album unavailable"
        subtitle="This album could not be loaded right now."
        crumb="Unavailable"
      >
        <EmptyState title="Album unavailable" description={error} action={backToGallery} />
      </AlbumShell>
    );
  }

  if (!album) {
    return (
      <AlbumShell
        title="Album not found"
        subtitle="This album may have been removed or the link is incorrect."
        crumb="Not found"
      >
        <EmptyState title="Nothing here" action={backToGallery} />
      </AlbumShell>
    );
  }

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Album"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Gallery', to: '/gallery' }, { label: album.title }]}
        title={album.title}
        subtitle={album.description}
        meta={[
          { value: `${album.images.length}`, label: 'Photos' },
          { value: formatDate(album.date), label: 'Date' },
        ]}
      />

      <PageSection tone="cream" top>
        <Link
          to="/gallery"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-ieee-orange"
        >
          <ArrowLeft className="h-4 w-4" /> All albums
        </Link>

        {album.images.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="No photos yet" description="Photos for this album have not been added yet." />
          </div>
        ) : (
          <JustifiedPhotoGrid className="mt-8" photos={album.images} onOpen={setViewing} />
        )}

        {/* Mounted unconditionally so its enter/exit animation has something to run on; it
            renders nothing at all while `viewing` is null. */}
        <Lightbox
          images={album.images.map((photo) => ({
            id: photo.id,
            url: photo.url,
            caption: photo.caption || undefined,
          }))}
          index={viewing}
          onClose={() => setViewing(null)}
          onIndexChange={setViewing}
        />
      </PageSection>
    </div>
  );
}
