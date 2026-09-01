/**
 * The cross-fading preview on the 3D navigator card.
 *
 * Loading is deliberately careful — the six renders are ~1.6 MB together and the card sits
 * well below the map:
 *
 * - Nothing is fetched until the card comes near the viewport, measured with a plain
 *   bounding-rect check on scroll. `loading="lazy"` and IntersectionObserver are the tidier
 *   answers, but both are driven by the browser's own notion of page visibility and report
 *   nothing in a headless or backgrounded tab — which makes the slideshow untestable and
 *   would have shipped unverified. A rect check behaves identically everywhere.
 * - Only the slide on screen is rendered, and the slideshow pauses while the card is out of
 *   view — so a reader who never scrolls this far downloads nothing, and one who scrolls
 *   past quickly downloads one render rather than six.
 * - The one slide after the current is warmed in the background so the crossfade always has
 *   something to fade to.
 * - A slide that 404s removes itself from the rotation. Until the first one paints — and
 *   permanently, if none of them load — the frame shows an exploded axonometric drawn from
 *   the building data. So the card is never empty and never a broken image.
 *
 * Images are letter-boxed (`object-contain`) rather than cropped: these are wide renders of
 * a long building, and cropping them to the card's shape would cut the block in half. The
 * frame is painted the same cream the renders use, so the letter-boxing is invisible.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import BuildingIsometric from './BuildingIsometric';

interface Shot {
  src: string;
  alt: string;
}

/** Files in `public/nav-3d/`. Any that fail to load are dropped. */
const SHOTS: Shot[] = [
  {
    src: '/nav-3d/3d_pic_1.png',
    alt: 'The CS block with its floors pulled apart, every room and corridor visible from above',
  },
  {
    src: '/nav-3d/3d_pic_2.png',
    alt: 'The finished block with its roof and glass facade, seen from the south-west',
  },
  {
    src: '/nav-3d/3d_pic_3.png',
    alt: 'The block cut open along its length, showing the rooms behind the facade',
  },
  {
    src: '/nav-3d/3d_pic_4.png',
    alt: 'All four floors seen head-on, with the glazed stair and lift core running up the middle',
  },
  {
    src: '/nav-3d/3d_pic_5.png',
    alt: 'The stacked floors viewed from overhead, corridors and classrooms laid out end to end',
  },
  {
    src: '/nav-3d/3d_pic_6.png',
    alt: 'A single floor with every room labelled — Administration, Canteen, CL-10, the prayer room and the washrooms',
  },
];

const SLIDE_MS = 4200;
const FADE_S = 0.9;
/**
 * The renders share this background, and so does the card panel behind them — so the
 * letter-boxing is invisible and the art reads as sitting directly on the card rather than
 * inside a smaller frame. Keep the two in sync (see ThreeDNavigatorCard).
 */
const FRAME_BG = '#EFE9DC';
/** How far outside the viewport the card starts loading. */
const NEAR_VIEWPORT_PX = 300;

/** Resolves true once this file has decoded, false if it cannot be loaded. */
function preload(shot: Shot): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = shot.src;
  });
}

export default function NavigatorShowcase() {
  /**
   * Optimistic: assume every file is present, and let a failed load remove it. Probing up
   * front would mean downloading all six before showing any.
   */
  const [shots, setShots] = useState<Shot[]>(SHOTS);
  const [painted, setPainted] = useState(false);
  const [index, setIndex] = useState(0);
  const [inView, setInView] = useState(false);
  /** Latches true the first time the card is seen, so a scroll-past does not unload it. */
  const [seen, setSeen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const paused = useRef(false);

  const current = seen && shots.length > 0 ? shots[index % shots.length] : null;

  /** A file that will not load should not keep a slot in the rotation. */
  const drop = (src: string) => setShots((cur) => cur.filter((shot) => shot.src !== src));

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const check = () => {
      const rect = element.getBoundingClientRect();
      // Start loading a little before the card actually arrives.
      const near = rect.top < window.innerHeight + NEAR_VIEWPORT_PX && rect.bottom > -NEAR_VIEWPORT_PX;
      setInView(near);
      if (near) setSeen(true);
    };

    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check, { passive: true });
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  // Warm just the next slide, so the crossfade never fades to a blank frame.
  useEffect(() => {
    if (!painted || shots.length < 2) return;
    void preload(shots[(index + 1) % shots.length]);
  }, [index, shots, painted]);

  // Advance only while the card is actually on screen.
  useEffect(() => {
    if (!inView || !painted || shots.length < 2) return;
    const timer = window.setInterval(() => {
      if (!paused.current) setIndex((i) => (i + 1) % shots.length);
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [inView, painted, shots.length]);

  return (
    <div
      className="relative flex w-full flex-col lg:h-full lg:min-h-0"
      onMouseEnter={() => {
        paused.current = true;
      }}
      onMouseLeave={() => {
        paused.current = false;
      }}
    >
      <div
        ref={frameRef}
        /* Stacked on a phone the column has no height to fill, so size by aspect there and
           only stretch to the panel once the card is side by side. */
        className="relative aspect-[16/10] w-full overflow-hidden rounded-xl lg:aspect-auto lg:min-h-[13rem] lg:flex-1"
        style={{ backgroundColor: FRAME_BG }}
      >
        {/* Drawn from the building data. Visible while the first render loads, and kept
            for good if none of them do. */}
        {!painted && (
          <div className="absolute inset-0 flex items-center justify-center p-1">
            <BuildingIsometric className="h-auto w-full drop-shadow-[0_18px_28px_rgba(90,74,50,0.30)]" />
          </div>
        )}

        <AnimatePresence mode="sync">
          {current && (
            <motion.img
              key={current.src}
              src={current.src}
              alt={current.alt}
              decoding="async"
              onLoad={() => setPainted(true)}
              onError={() => drop(current.src)}
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : FADE_S, ease: 'easeInOut' }}
              className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_10px_20px_rgba(90,74,50,0.16)]"
              draggable={false}
            />
          )}
        </AnimatePresence>
      </div>

      {painted && shots.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5" role="tablist" aria-label="Navigator views">
          {shots.map((shot, i) => {
            const active = i === index % shots.length;
            return (
              <button
                key={shot.src}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={shot.alt}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  active ? 'w-6 bg-[#8E7C60]' : 'w-1.5 bg-[#8E7C60]/35 hover:bg-[#8E7C60]/60'
                }`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
