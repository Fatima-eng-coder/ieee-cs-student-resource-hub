/**
 * The announcement that stops you on the way in.
 *
 * This is the "ADMISSIONS OPEN" popup a university site puts over its homepage: a real dialog
 * over a scrim you cannot read through, closed on purpose rather than scrolled past. An inline
 * banner was tried first and it is a different thing entirely — it sits in the page, competes
 * with the hero, and a reader scrolls by without registering it. Promotion only works if it
 * interrupts, so this one interrupts and then gets out of the way for good.
 *
 * Both sources arrive already merged by bannersService.listHomepageBanners(): the banners an
 * admin writes, and the events and announcements they mark as promoted. This component does not
 * know or care which is which.
 *
 * Being modal brings obligations, and they are the reason this is longer than it looks:
 * the page behind must not scroll, Escape must close it, focus must be held inside it and given
 * back on close, and a screen reader must be told it is a dialog. A popup that traps a keyboard
 * user is worse than no popup.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { bannersService, type PromoBanner } from '@/services/bannersService';
import { adminAuthService } from '@/services/adminAuthService';
import { readJSON, writeJSON } from '@/utils/storage';

/** Shared with the older rail on purpose: a promotion dismissed there stays dismissed here. */
const DISMISSED_KEY = 'ieeecs_promo_dismissed';

/** Dismissals older than this fall off; the promotions behind them are long gone. */
const DISMISSED_LIMIT = 60;

/** How long one promotion holds the floor before the next slides in. */
const ROTATE_MS = 16_000;

const readDismissed = (): string[] => {
  const stored = readJSON<unknown>(DISMISSED_KEY, []);
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
};

export default function PromoPopup() {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [closed, setClosed] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let ignore = false;

    bannersService
      .listHomepageBanners()
      .then((feed) => {
        if (ignore) return;
        setBanners(feed.banners);
        setLoadError(feed.sourceError);
      })
      .catch((cause: unknown) => {
        if (ignore) return;
        // Both sources failed. Nothing is shown to a visitor — a broken popup is worse than
        // none — but a content manager checking on a promotion is told why below.
        setLoadError(cause instanceof Error ? cause.message : 'Promotions could not be loaded.');
      });

    return () => {
      ignore = true;
    };
  }, []);

  const visible = useMemo(
    () => banners.filter((banner) => !dismissed.includes(banner.id)),
    [banners, dismissed],
  );

  const open = visible.length > 0 && !closed;
  const current = visible[Math.min(index, visible.length - 1)];

  /**
   * Closing dismisses everything currently on screen, not just the slide showing.
   *
   * Anything else means closing the popup three times in a row, which reads as the site being
   * broken. A promotion published later is not in this list, so it still gets its turn.
   */
  const close = useCallback(() => {
    setClosed(true);
    setDismissed((previous) => {
      const ids = visible.map((banner) => banner.id);
      const next = [...ids, ...previous.filter((id) => !ids.includes(id))].slice(0, DISMISSED_LIMIT);
      try {
        writeJSON(DISMISSED_KEY, next);
      } catch (error) {
        // A full quota costs a repeat sighting, not a broken page.
        console.warn('Could not remember the dismissed promotions', error);
      }
      return next;
    });
  }, [visible]);

  // Escape closes, and focus is held inside while it is open. Both are what make this a dialog
  // rather than a div that happens to cover the screen.
  useEffect(() => {
    if (!open) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusTo.current?.focus?.();
    };
  }, [open, close]);

  // The page behind must not scroll. The padding compensates for the scrollbar the lock
  // removes, without which the whole layout jumps sideways as the popup appears.
  useEffect(() => {
    if (!open) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open]);

  // Auto-advance. Paused while the pointer is over it or focus is inside, because a promotion
  // that slides away mid-read is worse than one that waits.
  useEffect(() => {
    if (!open || paused || reduceMotion || visible.length < 2) return;

    const timer = window.setTimeout(
      () => setIndex((i) => (i + 1) % visible.length),
      ROTATE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [open, paused, reduceMotion, visible.length, index]);

  const go = (delta: number) => {
    setIndex((i) => (i + delta + visible.length) % visible.length);
  };

  // A failed read has no other symptom — "my promotion did not show" looks exactly like
  // "nothing is promoted" — so the one person who came to check is told.
  if (!open) {
    if (loadError && adminAuthService.canManageContent()) {
      return (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 rounded-2xl border border-amber-400/30 px-4 py-2.5 text-xs font-medium text-amber-100 glass-panel-dark"
        >
          Promotions could not be loaded, so none are showing: {loadError}
        </div>
      );
    }
    return null;
  }

  if (!current) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="promo-popup"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.25 }}
      >
        {/* Opaque enough that the page genuinely cannot be read through it — the whole point. */}
        <div
          className="absolute inset-0 bg-ieee-ink/80 backdrop-blur-sm"
          onClick={close}
          aria-hidden="true"
        />

        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="promo-popup-title"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 18 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
          className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-[0_30px_90px_rgba(10,10,12,0.55)] sm:max-w-xl"
        >
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close announcement"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-ieee-ink/55 text-white backdrop-blur transition hover:bg-ieee-ink/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-4.5 w-4.5" />
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* The image is the promotion. Shown whole rather than cropped to a strip, and the
                slot collapses entirely when a promotion has none — announcements never do. */}
            {current.imageUrl && (
              <div className="relative w-full bg-ieee-ink">
                <img
                  src={current.imageUrl}
                  alt=""
                  className="max-h-[46dvh] w-full object-contain"
                  loading="eager"
                />
              </div>
            )}

            <div className="p-6 sm:p-7">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ieee-orange">
                {current.eyebrow}
              </span>
              <h2
                id="promo-popup-title"
                className="mt-2 font-display text-2xl font-bold leading-tight text-slate-900 sm:text-3xl"
              >
                {current.title}
              </h2>
              {current.body && (
                <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{current.body}</p>
              )}

              {current.link.kind !== 'none' && (
                <div className="mt-5">
                  {current.link.kind === 'internal' ? (
                    <Link
                      to={current.link.to}
                      onClick={close}
                      className="inline-flex items-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.3)] transition hover:bg-ieee-orange-dark"
                    >
                      {current.ctaLabel || (current.isForm ? 'Register now' : 'Read more')}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <a
                      href={current.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={close}
                      className="inline-flex items-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.3)] transition hover:bg-ieee-orange-dark"
                    >
                      {current.ctaLabel || (current.isForm ? 'Register now' : 'Open link')}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {visible.length > 1 && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-black/5 px-5 py-3">
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous announcement"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1.5" role="tablist" aria-label="Announcements">
                {visible.map((banner, i) => (
                  <button
                    key={banner.key}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`${i + 1} of ${visible.length}: ${banner.title}`}
                    onClick={() => setIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? 'w-6 bg-ieee-orange' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next announcement"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-slate-500 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
