/**
 * The homepage promotional banner: one surface fed by two sources — the banners an admin
 * authors in the Banners screen, and the events and announcements they have promoted onto the
 * homepage. bannersService reconciles both into PromoBanner, so nothing below knows or cares
 * which table an entry came from.
 *
 * It sits in the document flow, unlike the floating strip it replaces. That strip was
 * deliberately absolute because the rows arrive well after first paint and a banner inserting
 * itself above the hero would shove the page down under the reader's thumb. The trade is paid
 * here by position rather than by positioning: this section is mounted *below* the hero, whose
 * min-height (84dvh on phones, 92dvh above that, plus the header) carries the join past the fold.
 * Measured, not assumed — 911px against a 900px viewport at 1440x900, 831px against 844 at
 * 390x844, where the 12px inside the fold is this section's own transparent top padding. Both
 * report a cumulative layout shift of exactly zero when the rows land, and that is the whole
 * reason this must not be moved above the hero later.
 *
 * Dismissal is remembered per promotion id rather than as a single "hide the banner" flag, so
 * a promotion published after the reader dismissed an older one still gets its turn.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { adminAuthService } from '@/services/adminAuthService';
import { bannersService, type PromoBanner } from '@/services/bannersService';
import { readJSON, writeJSON } from '@/utils/storage';

const DISMISSED_KEY = 'ieeecs_promo_dismissed';

/** Dismissals older than this fall off the list; the promotions behind them are long gone. */
const DISMISSED_LIMIT = 60;

/**
 * Long enough to read a headline, a line of body copy and decide about the button; short
 * enough that a second promotion is not effectively invisible. The timer is restarted by every
 * slide change, so a reader who taps an arrow gets the full interval rather than the tail of
 * the one that was already running.
 */
const ROTATE_MS = 18_000;

const readDismissed = (): string[] => {
  const stored = readJSON<unknown>(DISMISSED_KEY, []);
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
};

/** The database returns a null cta_label so the wording stays product copy rather than data. */
const defaultCtaLabel = (banner: PromoBanner) => {
  if (banner.isForm) return 'Register now';
  if (banner.source === 'event') return 'View event';
  if (banner.source === 'announcement') return 'Read more';
  return 'Learn more';
};

/**
 * pointerEvents is part of the exit, not decoration: the outgoing panel stays mounted for the
 * length of the transition, and until it goes its close button and its call to action are still
 * under the reader's finger. Dismissing the promotion that is halfway out of the frame is not
 * what anyone aiming at the incoming one meant to do.
 */
const slideVariants: Variants = {
  enter: (direction: number) => ({ x: direction >= 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1, pointerEvents: 'auto' },
  exit: (direction: number) => ({ x: direction >= 0 ? '-100%' : '100%', opacity: 0, pointerEvents: 'none' }),
};

/** prefers-reduced-motion: the slide is replaced outright, with nothing travelling across it. */
const staticVariants: Variants = {
  enter: { opacity: 1 },
  center: { opacity: 1, pointerEvents: 'auto' },
  exit: { opacity: 1, pointerEvents: 'none' },
};

export default function PromoBanners() {
  const reduceMotion = !!useReducedMotion();
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const load = () => {
      bannersService
        .listHomepageBanners()
        .then((feed) => {
          if (ignore) return;
          setBanners(feed.banners);
          // Null when both sources read cleanly, which is also how a recovered outage clears.
          setLoadError(feed.sourceError);
        })
        .catch((error: unknown) => {
          if (ignore) return;
          // The visitor is deliberately told nothing: this is a promotion, and an error card in
          // its place would cost more than the banner it failed to fetch. Whatever is already on
          // screen is kept rather than blanked — a failed refresh is not news that a campaign
          // ended. The signed-in content manager is told, below.
          console.warn('Could not load the homepage banners', error);
          setLoadError(error instanceof Error ? error.message : 'The banners could not be loaded.');
        });
    };

    load();

    // active_promotions() evaluates the promo window against now() at call time, so a rail
    // fetched this morning still shows a campaign whose window closed at noon — and still hides
    // one that opened at one. Re-reading when the reader returns to the tab costs a single round
    // trip and keeps the rail inside the window an admin actually set.
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', refreshOnReturn);

    return () => {
      ignore = true;
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, []);

  const visible = useMemo(
    () => banners.filter((banner) => !dismissed.includes(banner.id)),
    [banners, dismissed]
  );
  const count = visible.length;

  // Clamped on read rather than corrected in an effect, so dismissing the last slide lands on
  // the new last one within the same render instead of flashing an empty panel first.
  const current = count > 0 ? Math.min(index, count - 1) : 0;
  const active = visible[current] ?? null;

  const step = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setDirection(delta >= 0 ? 1 : -1);
      setIndex((value) => (Math.min(value, count - 1) + delta + count) % count);
    },
    [count]
  );

  const jumpTo = useCallback(
    (target: number) => {
      setDirection(target >= current ? 1 : -1);
      setIndex(target);
    },
    [current]
  );

  // A carousel that slides away mid-read is worse than no carousel, so the pointer resting on
  // it or the keyboard being inside it both stop the clock.
  const paused = hovering || focused;

  useEffect(() => {
    if (reduceMotion || paused || count < 2) return;

    // Keyed on `current`, so every advance — automatic or from a control — restarts the wait
    // rather than leaving a manual tap racing a timer that was already half spent.
    const timer = window.setTimeout(() => {
      setDirection(1);
      setIndex((value) => (Math.min(value, count - 1) + 1) % count);
    }, ROTATE_MS);

    return () => window.clearTimeout(timer);
  }, [reduceMotion, paused, count, current]);

  const dismiss = (id: string) => {
    const next = [id, ...dismissed.filter((stored) => stored !== id)].slice(0, DISMISSED_LIMIT);
    setDismissed(next);
    try {
      writeJSON(DISMISSED_KEY, next);
    } catch (error) {
      // A full storage quota costs the reader a repeat sighting, not a broken homepage.
      console.warn('Could not remember the dismissed banner', error);
    }
  };

  // "My promotion did not show" has no other symptom: a read that failed and a homepage with
  // nothing promoted look identical from the outside. A signed-in content manager — the one
  // person who came here to check on something they published — is shown the reason instead of
  // having to open a browser console for it.
  const reportFailure = loadError !== null && adminAuthService.canManageContent();

  if (count === 0 && !reportFailure) return null;

  return (
    <section aria-label="Promoted highlights" className="relative px-5 pb-4 pt-10 sm:px-8 sm:pt-12 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
        {reportFailure && (
          <div
            role="status"
            className="rounded-2xl border border-amber-400/30 px-4 py-2.5 text-xs font-medium text-amber-100 glass-panel-dark"
          >
            {count > 0
              ? 'Visible to the team only: part of this banner could not be refreshed, so it may be out of date.'
              : 'Visible to the team only: the banners could not be loaded, so visitors are seeing nothing here.'}{' '}
            <span className="text-amber-200/70">{loadError}</span>
          </div>
        )}

        {active && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            role="group"
            aria-roledescription="carousel"
            aria-label="Promoted events and announcements"
            tabIndex={count > 1 ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              step(event.key === 'ArrowRight' ? 1 : -1);
            }}
            // pointerType is checked because a tap on a touch screen also raises pointerenter,
            // and pointerleave may never follow it — the rail would pause for good.
            onPointerEnter={(event) => {
              if (event.pointerType !== 'touch') setHovering(true);
            }}
            onPointerLeave={() => setHovering(false)}
            onFocus={() => setFocused(true)}
            onBlur={(event) => {
              // Moving between two controls inside the rail raises blur then focus; without
              // this the clock would restart in the gap between them.
              if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
            }}
            className="rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-ieee-orange focus-visible:ring-offset-2 focus-visible:ring-offset-ieee-ink"
          >
            {/* Fixed height, so two slides of different lengths overlapping mid-transition
                cannot resize the page around them. */}
            <div className="relative h-[430px] overflow-hidden rounded-3xl sm:h-[400px] lg:h-[440px]">
              <AnimatePresence initial={false} custom={direction}>
                <motion.div
                  key={active.key}
                  custom={direction}
                  variants={reduceMotion ? staticVariants : slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
                  className="absolute inset-0"
                >
                  <BannerPanel
                    banner={active}
                    position={`${current + 1} of ${count}`}
                    onDismiss={() => dismiss(active.id)}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {count > 1 && (
              <div className="mt-3 flex items-center justify-center gap-4">
                <Arrow side="left" onClick={() => step(-1)} />

                <div className="flex flex-wrap items-center justify-center gap-2">
                  {visible.map((banner, dot) => (
                    <button
                      key={banner.key}
                      type="button"
                      onClick={() => jumpTo(dot)}
                      aria-label={`Show promotion ${dot + 1}: ${banner.title}`}
                      aria-current={dot === current}
                      // The dot is 6px of paint; the pseudo-element gives the thumb something to hit.
                      className={`relative h-1.5 rounded-full transition-all before:absolute before:-inset-2.5 before:content-[''] ${
                        dot === current ? 'w-6 bg-ieee-orange' : 'w-1.5 bg-white/35 hover:bg-white/60'
                      }`}
                    />
                  ))}
                </div>

                <Arrow side="right" onClick={() => step(1)} />
              </div>
            )}
          </motion.div>
        )}
      </div>
    </section>
  );
}

function BannerPanel({
  banner,
  position,
  onDismiss,
}: {
  banner: PromoBanner;
  position: string;
  onDismiss: () => void;
}) {
  const { link } = banner;
  const label = banner.ctaLabel || defaultCtaLabel(banner);
  const artwork = banner.imageUrl;

  const ctaClass =
    'inline-flex w-fit items-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.32)] transition hover:bg-ieee-orange-dark';

  return (
    <article
      role="group"
      aria-roledescription="slide"
      aria-label={`${position}: ${banner.title}`}
      className="relative h-full overflow-hidden rounded-3xl border border-white/10 bg-ieee-ink"
    >
      {artwork ? (
        <>
          {/* The artwork again, blown up and blurred, so each banner carries the colour of its
              own poster instead of a house gradient that suits none of them. */}
          <img
            src={artwork}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-2xl"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ieee-ink/90 via-ieee-ink/70 to-ieee-ink/95 lg:bg-gradient-to-r lg:from-ieee-ink lg:via-ieee-ink/85 lg:to-ieee-ink/35" />
        </>
      ) : (
        /* Announcements have no image at all, so the text-only case is the normal one and gets
           a treatment of its own rather than a hole where a picture would be. */
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 15%, rgba(255,108,12,0.30), transparent 55%),' +
              'radial-gradient(circle at 88% 85%, rgba(255,184,28,0.18), transparent 55%)',
          }}
        />
      )}

      <div className={`relative flex h-full flex-col ${artwork ? 'lg:grid lg:grid-cols-[1.02fr_0.98fr]' : ''}`}>
        {artwork && (
          // object-contain, not cover: event artwork here is a poster as often as it is a
          // landscape photo, and cropping a 2:3 poster to a 16:9 band cuts the title off it.
          // The blurred copy behind fills the letterbox so the result still reads as designed.
          <div className="flex min-h-0 flex-1 items-center justify-center p-4 pb-0 lg:order-2 lg:h-full lg:p-7">
            <img
              src={artwork}
              alt=""
              loading="lazy"
              decoding="async"
              className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            />
          </div>
        )}

        <div
          className={`flex shrink-0 flex-col justify-center gap-3 px-6 pb-7 pt-5 sm:gap-4 lg:order-1 lg:h-full lg:px-10 lg:py-9 ${
            artwork ? '' : 'flex-1 pr-14 lg:max-w-3xl'
          }`}
        >
          <span className="w-fit rounded-full border border-ieee-orange/40 bg-ieee-orange/10 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-ieee-orange">
            {banner.eyebrow}
          </span>

          <h2
            className={`font-display font-bold leading-[1.1] text-white ${
              artwork ? 'line-clamp-2 text-2xl sm:text-3xl lg:text-4xl' : 'line-clamp-3 text-3xl sm:text-4xl lg:text-5xl'
            }`}
          >
            {banner.title}
          </h2>

          {banner.body && (
            <p
              className={`text-white/65 ${
                artwork ? 'line-clamp-2 text-sm sm:text-base' : 'line-clamp-3 text-base sm:text-lg'
              }`}
            >
              {banner.body}
            </p>
          )}

          {link.kind === 'external' ? (
            <a href={link.href} target="_blank" rel="noopener noreferrer" className={ctaClass}>
              {label} <ExternalLink className="h-4 w-4" />
            </a>
          ) : link.kind === 'internal' ? (
            <Link to={link.to} className={ctaClass}>
              {label} <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss ${banner.title}`}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/70 backdrop-blur transition hover:bg-black/70 hover:text-white focus-visible:ring-2 focus-visible:ring-ieee-orange"
      >
        <X className="h-4 w-4" />
      </button>
    </article>
  );
}

/**
 * Never disabled: the rail wraps, so there is always a previous and a next. A disabled arrow
 * on a carousel that auto-advances past the end would be lying about what happens next.
 */
function Arrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const left = side === 'left';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={left ? 'Previous promotion' : 'Next promotion'}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-ieee-orange/50 hover:text-ieee-orange focus-visible:ring-2 focus-visible:ring-ieee-orange"
    >
      {left ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );
}
