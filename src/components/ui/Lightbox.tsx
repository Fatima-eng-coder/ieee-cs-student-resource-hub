import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * Full-screen viewer for a set of images.
 *
 * The gallery had no way to look at a photo. Each one was a `<figure>` wrapping a bare `<img>`
 * with no click handler, no button and no href — the only thing that happened when you reached
 * for a picture was a CSS hover scale, which reads as "this is clickable" and then isn't. On a
 * phone, where there is no hover at all, the grid was simply 23 thumbnails and no way in.
 *
 * Rendered through a portal to document.body. Inside the page it would sit under whatever
 * stacking context its ancestors had already created — PageSection and the animated background
 * both make one — and `fixed inset-0` only means "the viewport" if nothing above it has a
 * transform. A portal makes that independent of wherever it is used from.
 */

export interface LightboxImage {
  id: string;
  url: string;
  caption?: string;
}

/** The two neighbours, fetched while you are looking at the current one so a step is instant. */
function useNeighbourPreload(images: LightboxImage[], index: number | null) {
  useEffect(() => {
    if (index === null) return;
    for (const offset of [1, -1]) {
      const neighbour = images[index + offset];
      if (!neighbour) continue;
      const img = new Image();
      img.src = neighbour.url;
    }
  }, [images, index]);
}

export default function Lightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: LightboxImage[];
  /** null when closed. */
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Where focus came from, so it can go back there on close. Without this, dismissing the
  // viewer drops the caret at the top of the document and a keyboard user has to tab all the
  // way back down to the photo they were already on.
  const openerRef = useRef<HTMLElement | null>(null);

  const open = index !== null && index >= 0 && index < images.length;
  const current = open ? images[index] : null;

  const step = useCallback(
    (delta: number) => {
      if (index === null || images.length === 0) return;
      // Wraps, because a viewer that silently stops at the end reads as broken rather than as
      // finished — there is nothing on screen to say which end you are at.
      onIndexChange((index + delta + images.length) % images.length);
    },
    [index, images.length, onIndexChange]
  );

  useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    // The page behind must not scroll under the overlay. Restored to whatever it was rather
    // than hardcoded to '', so a page that had its own overflow set keeps it.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
        return;
      }

      // Focus trap. Only a handful of controls are ever in here, so they are collected on each
      // Tab rather than tracked — cheaper than a mutation observer and always current.
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      openerRef.current?.focus();
    };
  }, [open, onClose, step]);

  useNeighbourPreload(images, open ? index : null);

  /*
   * Unmounted outright when closed, with no exit animation.
   *
   * This was an <AnimatePresence> wrapper so the overlay could fade out. It did not release the
   * child: after Escape, React had already re-rendered with the viewer closed -- the scroll lock
   * came off, so the state change definitely landed -- and the overlay stayed in the DOM at full
   * opacity, covering the page with no way to dismiss it. Measured, repeatedly, at 900ms against
   * a 200ms transition.
   *
   * Rather than keep hunting the interaction between AnimatePresence, a portal and a keyed child,
   * the fade-out is simply gone. It bought 200ms of polish on the way out and cost the ability to
   * close a full-screen overlay, which is not a trade worth making twice. The entrance animation
   * is unaffected -- it does not depend on presence tracking.
   */
  if (!open || !current) return null;

  return createPortal(
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex flex-col bg-ieee-ink/95 backdrop-blur-sm"
      // The backdrop closes, but only when the backdrop itself was hit: without the target
      // check, a click that starts on the photo and drifts a pixel onto the padding closes
      // the viewer mid-look.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={current.caption || `Photo ${index + 1} of ${images.length}`}
        className="flex h-full flex-col"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="font-mono text-xs text-white/60">
            {index + 1} / {images.length}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ieee-orange"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 sm:gap-4 sm:px-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          {images.length > 1 && (
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous photo"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ieee-orange"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Keyed on the photo so a step remounts it and the fade actually reads as a
              change of picture rather than as the same element flickering. */}
          <motion.img
            key={current.id}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            src={current.url}
            alt={current.caption || ''}
            /* max-h-full with min-h-0 on the parent is what keeps a tall photo inside the
               viewport instead of pushing the caption off the bottom of the screen. */
            className="max-h-full min-h-0 max-w-full rounded-lg object-contain"
          />

          {images.length > 1 && (
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next photo"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ieee-orange"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        <div className="shrink-0 px-4 py-4 text-center sm:px-6">
          {current.caption && (
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-white/80">{current.caption}</p>
          )}
          {/* Hidden on small screens: a phone has no arrow keys and no Esc, so this was
              instructions for a keyboard the reader does not have. The on-screen chevrons
              and the close button are the mobile affordance. */}
          {images.length > 1 && (
            <p className="mt-1.5 hidden font-mono text-[11px] text-white/40 sm:block">
              Use the arrow keys to move between photos · Esc to close
            </p>
          )}
        </div>
      </div>
    </motion.div>,
    document.body
  );
}
