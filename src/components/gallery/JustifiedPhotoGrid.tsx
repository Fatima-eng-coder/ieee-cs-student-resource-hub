import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Expand } from 'lucide-react';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { orientationOf, type ImageOrientation } from '@/utils/imageSize';
import { layoutJustifiedRows } from '@/utils/justifiedLayout';
import { TILE_RATIO } from './tileShapes';

/**
 * An album's photos as rows that fit together.
 *
 * Every tile is one of two shapes, wide or tall, and each row is sized so its tiles fill the
 * width at a shared height (see layoutJustifiedRows). Two fixed shapes rather than each photo's
 * exact proportions is a deliberate trade: the rows keep a steady rhythm however mixed the
 * uploads are, at the price of a slight crop on photos that are not quite 3:2.
 *
 * Tiles are placed absolutely from the computed layout rather than nested in row elements. A
 * resize or a newly measured photo moves tiles between rows, and nested rows would remount them
 * -- replaying their entrance animation and reloading their images -- every time it did.
 */

export interface JustifiedPhoto {
  id: string;
  url: string;
  caption: string;
  /** Null when not recorded; the grid then measures the picture itself. */
  orientation: ImageOrientation | null;
}

/** Row height and spacing for the width the grid actually has. */
function sizingFor(width: number, compact: boolean) {
  if (compact) return { targetHeight: 96, gap: 6 };
  if (width < 640) return { targetHeight: 160, gap: 8 };
  if (width < 1024) return { targetHeight: 220, gap: 12 };
  return { targetHeight: 270, gap: 14 };
}

/**
 * Shapes for photos stored before shapes were recorded, read from the tiles' own images.
 *
 * Taken from each <img> as it loads rather than by fetching every picture up front: that would
 * download every full-size original the moment the album opened, lazy loading or not. Until an
 * image loads its tile is laid out as landscape, the common case, so at most that tile moves
 * once -- usually before it has been scrolled into view. The admin portal records these shapes
 * when the album is next opened for editing, after which nothing here runs for it.
 */
function useMeasuredOrientations() {
  const [measured, setMeasured] = useState<Record<string, ImageOrientation>>({});
  const record = useCallback((id: string, orientation: ImageOrientation) => {
    setMeasured((current) => (current[id] === orientation ? current : { ...current, [id]: orientation }));
  }, []);
  return [measured, record] as const;
}

export default function JustifiedPhotoGrid({
  photos,
  onOpen,
  compact = false,
  className = '',
}: {
  photos: JustifiedPhoto[];
  /** Makes each tile a button that opens the photo at that position. Omit for a static preview. */
  onOpen?: (index: number) => void;
  /** Small tiles and no captions, for the portal's preview drawer. */
  compact?: boolean;
  className?: string;
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const reduceMotion = useReducedMotion();
  const [measured, recordMeasured] = useMeasuredOrientations();
  const { targetHeight, gap } = sizingFor(width, compact);

  const shapes = photos.map((photo) => photo.orientation ?? measured[photo.id] ?? 'landscape');
  const shapesKey = shapes.join(',');

  const { tiles, height } = useMemo(() => {
    const ratios = shapesKey ? shapesKey.split(',').map((shape) => TILE_RATIO[shape as ImageOrientation]) : [];
    const rows = layoutJustifiedRows(ratios, { width, gap, targetHeight });

    const placed: { index: number; column: number; style: CSSProperties }[] = [];
    let top = 0;
    for (const row of rows) {
      const rowWidth =
        ratios.slice(row.start, row.end).reduce((sum, ratio) => sum + ratio * row.height, 0) +
        gap * (row.end - row.start - 1);
      // A short last row is centred, so the album ends symmetrically instead of trailing left.
      let left = row.filled ? 0 : (width - rowWidth) / 2;

      for (let index = row.start; index < row.end; index += 1) {
        const tileWidth = ratios[index] * row.height;
        placed.push({
          index,
          column: index - row.start,
          style: { left, top, width: tileWidth, height: row.height },
        });
        left += tileWidth + gap;
      }
      top += row.height + gap;
    }

    return { tiles: placed, height: Math.max(0, top - gap) };
  }, [shapesKey, width, gap, targetHeight]);

  return (
    <div ref={ref} className={`relative w-full ${className}`} style={{ height }}>
      {tiles.map(({ index, column, style }) => {
        const photo = photos[index];
        const label = photo.caption ? `Open photo: ${photo.caption}` : `Open photo ${index + 1}`;

        const image = (
          <img
            src={photo.url}
            alt={photo.caption}
            loading="lazy"
            decoding="async"
            onLoad={
              photo.orientation
                ? undefined
                : (event) =>
                    recordMeasured(
                      photo.id,
                      orientationOf({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      })
                    )
            }
            className={`h-full w-full object-cover ${
              onOpen ? 'transition duration-500 group-hover:scale-105' : ''
            }`}
          />
        );

        return (
          <motion.figure
            key={photo.id}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '0px 0px -40px 0px' }}
            transition={{ duration: 0.35, delay: column * 0.05 }}
            style={style}
            className={`group absolute m-0 overflow-hidden bg-ieee-ink/5 ring-1 ring-black/5 ${
              compact ? 'rounded-lg' : 'rounded-xl shadow-sm sm:rounded-2xl'
            }`}
          >
            {onOpen ? (
              /*
                A real button, not a click handler on the image: keyboard and screen-reader users
                can open photos too, and the viewer has somewhere to return focus to on close.
              */
              <button
                type="button"
                onClick={() => onOpen(index)}
                aria-label={label}
                data-cursor="link"
                className="group/tile relative block h-full w-full overflow-hidden focus:outline-none"
              >
                {image}
                {/* "This opens" on hover for a mouse; never shown on a touch screen, where
                    tapping is the obvious thing to try anyway. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ieee-ink/0 opacity-0 transition duration-300 group-hover:bg-ieee-ink/25 group-hover:opacity-100"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ieee-ink shadow-lg">
                    <Expand className="h-4.5 w-4.5" />
                  </span>
                </span>
                {/* The keyboard focus ring, as the last layer: a ring on the button itself is
                    painted underneath the photo and cannot be seen. */}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 opacity-0 ring-3 ring-inset ring-ieee-orange group-focus-visible/tile:opacity-100 ${
                    compact ? 'rounded-lg' : 'rounded-xl sm:rounded-2xl'
                  }`}
                />
              </button>
            ) : (
              image
            )}

            {/* Over the photo rather than under it, so a caption never makes one tile taller
                than the others in its row. */}
            {photo.caption && !compact && (
              <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ieee-ink/85 via-ieee-ink/45 to-transparent px-3 pb-2.5 pt-10 text-left text-xs font-medium leading-snug text-white sm:text-sm">
                <span className="line-clamp-2">{photo.caption}</span>
              </figcaption>
            )}
          </motion.figure>
        );
      })}
    </div>
  );
}
