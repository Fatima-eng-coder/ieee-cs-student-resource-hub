import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { GalleryAlbum } from '@/types';
import { hasFile } from '@/utils/files';

interface GalleryAlbumCardProps {
  album: GalleryAlbum;
}

export default function GalleryAlbumCard({ album }: GalleryAlbumCardProps) {
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
      <Link
        to={`/gallery/${album.id}`}
        className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
      >
        <div className="relative h-48 w-full overflow-hidden bg-ieee-ink">
          {/* The cover is optional in the admin drawer, and an empty src resolves against the
              page URL — a broken-image icon where a photo belongs. */}
          {hasFile(album.coverImage) ? (
            <img
              src={album.coverImage}
              alt={album.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-6 text-center text-xs font-medium text-white/60">
              Cover photo coming soon
            </span>
          )}
          <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
            {album.images.length} {album.images.length === 1 ? 'photo' : 'photos'}
          </span>
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-slate-900">{album.title}</h3>
          <p className="text-xs text-slate-400">{album.date}</p>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{album.description}</p>
        </div>
      </Link>
    </motion.div>
  );
}
