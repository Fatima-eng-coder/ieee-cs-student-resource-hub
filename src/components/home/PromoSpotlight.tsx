/**
 * The promotions an admin has pushed to the front of the site, floated over the top of the
 * homepage.
 *
 * It is deliberately out of the document flow. The rows arrive from a network call well after
 * first paint, and a banner that inserts itself above the hero would shove the whole page down
 * under the reader's eyes (and their thumb). Absolutely positioned, it fades in over the empty
 * band between the header and the hero headline instead, costing zero layout shift.
 *
 * Dismissal is remembered per promotion id rather than as a single "hide the banner" flag, so
 * a promotion published after the reader dismissed an older one still gets its turn.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { adminAuthService } from '@/services/adminAuthService';
import { readJSON, writeJSON } from '@/utils/storage';

type PromotionKind = 'event' | 'announcement';
type PromotionFormSource = 'none' | 'external' | 'internal';

interface PromotionRow {
  kind: PromotionKind;
  id: string;
  title: string | null;
  summary: string | null;
  image_url: string | null;
  cta_label: string | null;
  href_slug: string | null;
  form_source: PromotionFormSource | null;
  external_form_url: string | null;
  form_id: string | null;
  promo_sort: number | null;
}

interface Promotion {
  kind: PromotionKind;
  id: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  ctaLabel: string;
  hrefSlug: string | null;
  formSource: PromotionFormSource;
  externalFormUrl: string | null;
  formId: string | null;
}

const DISMISSED_KEY = 'ieeecs_promo_dismissed';

/** Dismissals older than this fall off the list; the promotions behind them are long gone. */
const DISMISSED_LIMIT = 60;

const kindLabel: Record<PromotionKind, string> = {
  event: 'Event',
  announcement: 'Announcement',
};

const toPromotion = (row: PromotionRow): Promotion => ({
  kind: row.kind,
  id: row.id,
  title: row.title?.trim() || 'Untitled',
  summary: row.summary?.trim() ?? '',
  imageUrl: row.image_url?.trim() || null,
  ctaLabel: row.cta_label?.trim() ?? '',
  hrefSlug: row.href_slug?.trim() || null,
  formSource: row.form_source ?? 'none',
  externalFormUrl: row.external_form_url?.trim() || null,
  formId: row.form_id?.trim() || null,
});

const detailPath = (promo: Promotion) =>
  `${promo.kind === 'event' ? '/events' : '/announcements'}/${promo.hrefSlug ?? promo.id}`;

/**
 * Where the call to action lands. A half-configured promotion cannot reach the database — a
 * CHECK constraint rejects it — but the url and form id are still nullable columns, so an
 * unusable pairing degrades to the detail page rather than to a dead button.
 */
function resolveTarget(promo: Promotion): { to?: string; href?: string; isForm: boolean } {
  if (promo.formSource === 'external' && promo.externalFormUrl) {
    return { href: promo.externalFormUrl, isForm: true };
  }
  if (promo.formSource === 'internal' && promo.formId) {
    return { to: `/forms/${promo.formId}`, isForm: true };
  }
  return { to: detailPath(promo), isForm: false };
}

const readDismissed = (): string[] => {
  const stored = readJSON<unknown>(DISMISSED_KEY, []);
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
};

export default function PromoSpotlight() {
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [index, setIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const load = () => {
      supabase
        .rpc('active_promotions')
        .then(({ data, error }) => {
          if (ignore) return;
          if (error) {
            // The visitor is deliberately told nothing: the strip is an extra floating over
            // the hero, and an error card in its place would cost more than the promotion it
            // failed to fetch. The rows already on screen are kept rather than blanked, since
            // a failed refresh is not news that the promotions ended.
            console.warn('Could not load homepage promotions', error);
            setLoadError(error.message);
            return;
          }
          setLoadError(null);
          setPromotions(((data ?? []) as PromotionRow[]).map(toPromotion));
        });
    };

    load();

    // active_promotions() evaluates the promo window against now() at call time, so a strip
    // fetched this morning still shows a card whose window closed at noon — and still hides
    // one that opened at one. Re-reading when the reader returns to the tab costs a single
    // query and keeps the strip inside the window an admin actually set.
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', refreshOnReturn);

    return () => {
      ignore = true;
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, []);

  const visible = promotions.filter((promo) => !dismissed.includes(promo.id));
  const count = visible.length;

  // Which slide the reader is actually looking at, read back from the scroll position so a
  // finger swipe and an arrow tap stay in agreement about the dots.
  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    measure();
    track.addEventListener('scroll', measure, { passive: true });

    // A resized viewport changes the slide width, and with it which offset counts as slide n.
    const observer = new ResizeObserver(measure);
    observer.observe(track);

    return () => {
      track.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, count]);

  const goTo = useCallback(
    (target: number) => {
      const track = trackRef.current;
      if (!track) return;
      const clamped = Math.max(0, Math.min(target, count - 1));
      track.scrollTo({
        left: clamped * track.clientWidth,
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
      setIndex(clamped);
    },
    [count, reduceMotion]
  );

  // Dismissing the last slide leaves the track scrolled past the end of a now-shorter list.
  useEffect(() => {
    if (count > 0 && index > count - 1) goTo(count - 1);
  }, [count, index, goTo]);

  const dismiss = (id: string) => {
    const next = [id, ...dismissed.filter((stored) => stored !== id)].slice(0, DISMISSED_LIMIT);
    setDismissed(next);
    try {
      writeJSON(DISMISSED_KEY, next);
    } catch (error) {
      // A full storage quota costs the reader a repeat sighting, not a broken homepage.
      console.warn('Could not remember the dismissed promotion', error);
    }
  };

  // "My promotion did not show" has no other symptom: a read that failed and a homepage with
  // nothing promoted look identical from the outside. A signed-in content manager — the one
  // person who came here to check on a card they published — is shown the reason instead of
  // having to open a browser console for it.
  const reportFailure = loadError !== null && adminAuthService.canManageContent();

  if (count === 0 && !reportFailure) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center gap-2 px-4 pt-3 sm:pt-4">
      {reportFailure && (
        <div
          role="status"
          className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-amber-400/30 px-4 py-2.5 text-xs font-medium text-amber-100 glass-panel-dark"
        >
          {count > 0
            ? 'Visible to the team only: the promotions could not be refreshed, so this strip may be out of date.'
            : 'Visible to the team only: the promotions could not be loaded, so visitors are seeing nothing here.'}{' '}
          <span className="text-amber-200/70">{loadError}</span>
        </div>
      )}

      {count > 0 && (
        <motion.section
          aria-label="Promoted highlights"
          initial={reduceMotion ? false : { opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-2xl glass-panel-dark shadow-[0_18px_50px_rgba(10,10,12,0.45)]"
        >
          <div
            ref={trackRef}
            role="group"
            aria-roledescription="carousel"
            aria-label="Promoted events and announcements"
            tabIndex={count > 1 ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              goTo(index + (event.key === 'ArrowRight' ? 1 : -1));
            }}
            className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ieee-orange [&::-webkit-scrollbar]:hidden"
          >
            {visible.map((promo, slide) => (
              <Slide
                key={promo.id}
                promo={promo}
                position={`${slide + 1} of ${count}`}
                onDismiss={() => dismiss(promo.id)}
              />
            ))}
          </div>
  
          {count > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-2 py-0.5">
              <Arrow side="left" disabled={index === 0} onClick={() => goTo(index - 1)} />
  
              <div className="flex flex-1 items-center justify-center gap-2">
                {visible.map((promo, dot) => (
                  <button
                    key={promo.id}
                    type="button"
                    onClick={() => goTo(dot)}
                    aria-label={`Show promotion ${dot + 1}: ${promo.title}`}
                    aria-current={dot === index}
                    // The dot is 6px of paint; the pseudo-element gives the thumb something to hit.
                    className={`relative h-1.5 rounded-full transition-all before:absolute before:-inset-2.5 before:content-[''] ${
                      dot === index ? 'w-5 bg-ieee-orange' : 'w-1.5 bg-white/35 hover:bg-white/60'
                    }`}
                  />
                ))}
              </div>
  
              <Arrow side="right" disabled={index === count - 1} onClick={() => goTo(index + 1)} />
            </div>
          )}
        </motion.section>
      )}
    </div>
  );
}

function Slide({
  promo,
  position,
  onDismiss,
}: {
  promo: Promotion;
  position: string;
  onDismiss: () => void;
}) {
  const target = resolveTarget(promo);
  const label =
    promo.ctaLabel ||
    (target.isForm ? 'Register now' : promo.kind === 'event' ? 'View event' : 'Read more');
  const ctaClass =
    'inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ieee-orange px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ieee-orange-dark sm:px-4 sm:text-sm';

  return (
    <article
      role="group"
      aria-roledescription="slide"
      aria-label={`${position}: ${promo.title}`}
      className="relative w-full shrink-0 snap-center"
    >
      <div className="flex items-center gap-3 p-2 pr-9 sm:gap-3.5 sm:p-2.5 sm:pr-11">
        {promo.imageUrl && (
          <img
            src={promo.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="hidden h-11 w-16 shrink-0 rounded-lg object-cover sm:block"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-mono text-[10px] font-medium uppercase tracking-widest text-ieee-orange">
              {kindLabel[promo.kind]}
            </span>
            <h2 className="truncate font-display text-sm font-bold leading-snug text-white sm:text-[15px]">
              {promo.title}
            </h2>
          </div>
          {promo.summary && (
            <p className="hidden truncate text-xs text-white/60 sm:block">{promo.summary}</p>
          )}
        </div>

        {target.href ? (
          <a href={target.href} target="_blank" rel="noopener noreferrer" className={ctaClass}>
            {label} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <Link to={target.to ?? '/'} className={ctaClass}>
            {label} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss ${promo.title}`}
        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-ieee-orange"
      >
        <X className="h-4 w-4" />
      </button>
    </article>
  );
}

/**
 * Redundant on touch, where the strip is swiped directly, so it only appears once there is a
 * pointer to click it with.
 */
function Arrow({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  const left = side === 'left';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={left ? 'Previous promotion' : 'Next promotion'}
      className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:border-ieee-orange/50 hover:text-ieee-orange disabled:pointer-events-none disabled:opacity-30 sm:flex"
    >
      {left ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
    </button>
  );
}
