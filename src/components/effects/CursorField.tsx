import { useEffect, useRef, useState } from 'react';
import { gsap } from '@/lib/gsap';

/**
 * GSAP-driven custom cursor: a tight dot plus a trailing ring that stretches
 * along its direction of travel (velocity-based skew/scale), and grows
 * modestly over anything tagged data-cursor="link" (kept subtle on purpose —
 * no big filled blob). No-ops on touch devices.
 */
export default function CursorField() {
  // Lazy-initialized so it's already correct on the very first render — if this
  // instead flipped true inside an effect, the cursor divs (and their refs)
  // wouldn't exist yet when the GSAP setup effect below ran, and the whole
  // thing would silently no-op forever (refs null -> early return).
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

    const dotX = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3.out' });
    const dotY = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3.out' });
    const ringX = gsap.quickTo(ring, 'x', { duration: 0.35, ease: 'power3.out' });
    const ringY = gsap.quickTo(ring, 'y', { duration: 0.35, ease: 'power3.out' });
    const glowX = gsap.quickTo(glow, 'x', { duration: 0.6, ease: 'power2.out' });
    const glowY = gsap.quickTo(glow, 'y', { duration: 0.6, ease: 'power2.out' });

    let lastX = window.innerWidth / 2;
    let lastY = window.innerHeight / 2;
    let hovering = false;

    function handleMove(e: MouseEvent) {
      const { clientX: x, clientY: y } = e;
      dotX(x);
      dotY(y);
      ringX(x);
      ringY(y);
      glowX(x);
      glowY(y);

      const dx = x - lastX;
      const dy = y - lastY;
      const speed = Math.min(Math.hypot(dx, dy), 40);
      lastX = x;
      lastY = y;

      if (!hovering && speed > 1) {
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        gsap.to(ring, {
          rotate: angle,
          scaleX: 1 + speed / 40,
          scaleY: 1 - speed / 90,
          duration: 0.2,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      }

      const target = (e.target as HTMLElement)?.closest?.('[data-cursor="link"]');
      const isHovering = Boolean(target);
      if (isHovering !== hovering) {
        hovering = isHovering;
        gsap.to(ring, {
          scale: isHovering ? 1.35 : 1,
          rotate: 0,
          borderWidth: isHovering ? 1.5 : 1,
          borderColor: isHovering ? 'rgba(255,108,12,0.9)' : 'rgba(255,108,12,0.55)',
          duration: 0.3,
          ease: 'power3.out',
          overwrite: 'auto',
        });
        gsap.to(dot, { scale: isHovering ? 1.6 : 1, duration: 0.2 });
      }
    }

    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMove);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[80] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.06]"
        style={{ background: 'radial-gradient(circle, #ff6c0c 0%, transparent 68%)' }}
      />
      <div
        ref={ringRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[90] h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border"
        style={{ borderColor: 'rgba(255,108,12,0.55)' }}
      />
      <div
        ref={dotRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[90] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ieee-orange"
      />
    </>
  );
}
