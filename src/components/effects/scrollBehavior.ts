/**
 * Motion preference for programmatic scrolls.
 *
 * CSS `scroll-behavior: auto` does NOT override a JavaScript `behavior: 'smooth'`
 * argument — per spec the argument wins over the property — so the
 * `prefers-reduced-motion` block in index.css cannot switch these calls off on
 * its own. Every programmatic scroll has to ask for itself.
 *
 * Read at call time rather than cached, so toggling the OS setting takes effect
 * on the next scroll without a reload.
 */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined') return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** True when the visitor has asked for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
