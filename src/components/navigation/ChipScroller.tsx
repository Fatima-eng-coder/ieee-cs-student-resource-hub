/**
 * A horizontally scrolling strip of chips with arrows at each end.
 *
 * The quick-place chips overflow on a phone, and a plain overflow strip gives no hint that
 * there is anything past the right edge — people simply do not find "Print shop" or
 * "Prayer room". So the strip shows an arrow on whichever side has more to see: it fades
 * the chips underneath it, doubles as a tap target, and disappears once you reach that end.
 *
 * The arrows are hidden from assistive tech: they are a redundant control for something a
 * screen reader or keyboard user already reaches by tabbing through the chips themselves.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** How far one arrow tap moves the strip, as a fraction of its visible width. */
const STEP_FRACTION = 0.75;
/** Sub-pixel slack, so a strip scrolled fully to one end doesn't keep its arrow. */
const EPSILON = 4;

export default function ChipScroller({ children, label }: { children: ReactNode; label: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanScrollLeft(track.scrollLeft > EPSILON);
    setCanScrollRight(track.scrollLeft + track.clientWidth < track.scrollWidth - EPSILON);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    measure();
    track.addEventListener('scroll', measure, { passive: true });

    // Chips reflow when the viewport changes or a font finishes loading, either of which
    // can start or stop the overflow.
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    for (const child of Array.from(track.children)) observer.observe(child);

    return () => {
      track.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure]);

  const nudge = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * STEP_FRACTION, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        role="group"
        aria-label={label}
        className="flex gap-2 overflow-x-auto scroll-smooth px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      <Arrow side="left" show={canScrollLeft} onClick={() => nudge(-1)} />
      <Arrow side="right" show={canScrollRight} onClick={() => nudge(1)} />
    </div>
  );
}

function Arrow({ side, show, onClick }: { side: 'left' | 'right'; show: boolean; onClick: () => void }) {
  const left = side === 'left';

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-y-0 flex items-center transition-opacity duration-200 ${
        left ? 'left-0 pr-6' : 'right-0 pl-6'
      } ${show ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      style={{
        // Fade the chips out under the arrow instead of letting them collide with it.
        background: `linear-gradient(to ${left ? 'right' : 'left'}, var(--color-cream) 45%, transparent)`,
      }}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={onClick}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white text-slate-500 shadow-sm transition hover:border-ieee-orange/40 hover:text-ieee-orange"
      >
        {left ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    </div>
  );
}
