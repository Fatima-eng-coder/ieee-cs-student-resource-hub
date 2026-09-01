import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { galleryService, type AdminGalleryAlbum } from '@/services/galleryService';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import EmptyState from '@/components/ui/EmptyState';

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
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {album.images.map((photo, idx) => (
              <motion.figure
                key={photo.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: (idx % 3) * 0.06 }}
                className="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm"
              >
                <div className="overflow-hidden">
                  <img
                    src={photo.url}
                    alt={photo.caption}
                    loading="lazy"
                    className="h-56 w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
                {photo.caption && <figcaption className="p-4 text-sm text-slate-600">{photo.caption}</figcaption>}
              </motion.figure>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
