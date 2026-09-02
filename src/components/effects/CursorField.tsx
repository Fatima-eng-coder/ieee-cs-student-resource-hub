import { useEffect, useRef, useState } from 'react';

/**
 * Custom cursor for fine pointers: an exact dot, plus a ring and an ambient glow
 * that trail behind it.
 *
 * The dot carries NO smoothing, deliberately. `cursor-none-fine` hides the real
 * cursor across the whole public layout, so as far as the user is concerned the
 * dot *is* the pointer — easing it doesn't read as style, it reads as the machine
 * failing to keep up. The trail belongs to the ring and the glow, which are
 * decoration and can lag as much as they like.
 *
 * Everything is written straight to the nodes inside one rAF, so a 1000 Hz mouse
 * costs exactly the same per frame as a 125 Hz one, and the loop parks itself
 * when the pointer stops.
 */

// Time constants (seconds) for the trailing layers. Steady-state lag is roughly
// `speed * tau`, so at a typical 800 px/s the ring sits ~28px behind the dot —
// close enough to still read as a ring around the cursor.
const RING_TAU = 0.035;
const GLOW_TAU = 0.12;
const HOVER_TAU = 0.06;
const FADE_TAU = 0.08;

// Speed at which the ring reaches full stretch, in px/s.
const STRETCH_AT = 2400;

export default function CursorField() {
  // Lazy-initialized so it's already correct on the very first render — if this
  // instead flipped true inside an effect, the cursor divs (and their refs)
  // wouldn't exist yet when the setup effect below ran, and the whole thing
  // would silently no-op forever (refs null -> early return).
  const [enabled] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    const glow = glowRef.current;
    if (!dot || !ring || !glow) return;

    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = reduceQuery.matches;

    /** Set the first time a frame actually paints, so the restore below is unconditional. */
    let hidNativeCursor = false;

    // Pointer truth. Written by the listener, read once per frame.
    let px = window.innerWidth / 2;
    let py = window.innerHeight / 2;
    let prevX = px;
    let prevY = py;

    // Trailing layer state.
    let rx = px;
    let ry = py;
    let gx = px;
    let gy = py;
    let stretch = 0;
    let angle = 0;
    let hover = 0;
    let hoverTarget = 0;
    let fade = 0;
    let fadeTarget = 0;

    // `closest()` only needs re-running when the pointer crosses into a
    // different element, not on every event.
    let pendingTarget: Element | null = null;
    let checkedTarget: Element | null = null;

    let raf = 0;
    let last = 0;

    // Arrow consts rather than `function` declarations: a hoisted declaration
    // could in principle run before the null guard above, so TypeScript refuses
    // to carry the narrowing into one.
    const frame = (now: number) => {
      // Clamp dt so returning from a background tab doesn't teleport the trail.
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;

      if (pendingTarget !== checkedTarget) {
        checkedTarget = pendingTarget;
        hoverTarget = pendingTarget?.closest?.('[data-cursor="link"]') ? 1 : 0;
      }

      // Frame-rate independent exponential smoothing. `reduced` collapses every
      // trail to an instant snap so nothing is animated behind the pointer.
      const kRing = reduced ? 1 : 1 - Math.exp(-dt / RING_TAU);
      const kGlow = reduced ? 1 : 1 - Math.exp(-dt / GLOW_TAU);
      const kHover = reduced ? 1 : 1 - Math.exp(-dt / HOVER_TAU);
      const kFade = reduced ? 1 : 1 - Math.exp(-dt / FADE_TAU);

      rx += (px - rx) * kRing;
      ry += (py - ry) * kRing;
      gx += (px - gx) * kGlow;
      gy += (py - gy) * kGlow;
      hover += (hoverTarget - hover) * kHover;
      fade += (fadeTarget - fade) * kFade;

      // Velocity stretch, from this frame's travel rather than per-event deltas.
      const dx = px - prevX;
      const dy = py - prevY;
      prevX = px;
      prevY = py;
      const speed = Math.hypot(dx, dy) / dt;
      // Hovering a link owns the ring's shape, so don't fight it with stretch.
      const stretchTarget = reduced || hoverTarget === 1 ? 0 : Math.min(speed / STRETCH_AT, 1);
      if (speed > 40) angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      stretch += (stretchTarget - stretch) * (reduced ? 1 : 1 - Math.exp(-dt / 0.08));

      const ringScale = (1 + 0.35 * hover) * (1 + stretch);
      const ringScaleY = (1 + 0.35 * hover) * (1 - stretch * 0.44);

      /*
       * The native cursor is hidden HERE, on the first painted frame, and nowhere else.
       *
       * It used to be hidden by a `cursor-none-fine` class on the layout, decided independently
       * of whether this component was drawing anything. The two could disagree — and when they
       * did the page had no pointer at all, visible only over links, because those set
       * `cursor: pointer` and win against `cursor: none`. Tying the hiding to an actual frame
       * means the real cursor can only ever vanish while a replacement is genuinely on screen.
       */
      if (!hidNativeCursor) {
        hidNativeCursor = true;
        document.documentElement.style.cursor = 'none';
      }

      dot.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) scale(${1 + 0.6 * hover})`;
      dot.style.opacity = `${fade}`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) rotate(${angle}deg) scale(${ringScale}, ${ringScaleY})`;
      ring.style.opacity = `${fade}`;
      // Border colour is paint-only. Animating borderWidth instead would relayout
      // the ring on every single frame.
      ring.style.borderColor = `rgba(255,108,12,${0.55 + 0.35 * hover})`;
      glow.style.transform = `translate3d(${gx}px, ${gy}px, 0) translate(-50%, -50%)`;
      glow.style.opacity = `${0.06 * fade}`;

      // Park the loop once everything has converged — an idle pointer should
      // cost nothing at all.
      const settled =
        Math.abs(px - rx) < 0.1 &&
        Math.abs(py - ry) < 0.1 &&
        Math.abs(px - gx) < 0.1 &&
        Math.abs(py - gy) < 0.1 &&
        Math.abs(hoverTarget - hover) < 0.001 &&
        Math.abs(fadeTarget - fade) < 0.001 &&
        stretch < 0.001;

      if (settled) {
        raf = 0;
        last = 0;
        // Snap the residual so a parked frame is never a fraction off.
        rx = px;
        ry = py;
        gx = px;
        gy = py;
        hover = hoverTarget;
        fade = fadeTarget;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (raf) return;
      // Waking from parked means there is no velocity history to speak of — the
      // pointer may have re-entered the window a long way from where it left.
      // Without this the first frame reads that jump as enormous speed and
      // snaps the ring to full stretch.
      prevX = px;
      prevY = py;
      raf = requestAnimationFrame(frame);
    };

    const handleMove = (e: MouseEvent) => {
      px = e.clientX;
      py = e.clientY;
      pendingTarget = e.target as Element | null;
      fadeTarget = 1;
      wake();
    };

    const handleLeave = () => {
      fadeTarget = 0;
      wake();
    };

    const handleEnter = () => {
      fadeTarget = 1;
      wake();
    };

    const handleReduceChange = (e: MediaQueryListEvent) => {
      reduced = e.matches;
      wake();
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    document.addEventListener('mouseleave', handleLeave, { passive: true });
    document.addEventListener('mouseenter', handleEnter, { passive: true });
    reduceQuery.addEventListener('change', handleReduceChange);

    return () => {
      // Unconditionally, before anything else: unmounting while the cursor is hidden would
      // leave the whole document without a pointer and nothing left running to draw one.
      document.documentElement.style.cursor = '';

      window.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseleave', handleLeave);
      document.removeEventListener('mouseenter', handleEnter);
      reduceQuery.removeEventListener('change', handleReduceChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[80] h-[420px] w-[420px] rounded-full will-change-transform"
        style={{ background: 'radial-gradient(circle, #ff6c0c 0%, transparent 68%)', opacity: 0 }}
      />
      <div
        ref={ringRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[90] h-9 w-9 rounded-full border will-change-transform"
        style={{ borderColor: 'rgba(255,108,12,0.55)', opacity: 0 }}
      />
      <div
        ref={dotRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[90] h-1.5 w-1.5 rounded-full bg-ieee-orange will-change-transform"
        style={{ opacity: 0 }}
      />
    </>
  );
}
