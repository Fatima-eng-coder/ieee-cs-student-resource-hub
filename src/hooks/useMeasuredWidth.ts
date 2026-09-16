import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The rendered width of an element's own box.
 *
 * Measured rather than handed to a media query when a layout depends on the space it actually
 * has -- the org chart's "do fifteen people fit", the gallery's rows -- rather than on the window.
 *
 * A layout effect rather than an effect: the measurement has to land before the browser paints,
 * or the first frame is laid out for a width of zero.
 */
export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Sub-pixel jitter from a scrollbar appearing would otherwise loop the observer.
    const record = (next: number) => setWidth((previous) => (Math.abs(previous - next) < 0.5 ? previous : next));
    const measure = () => record(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => record(entries[0]?.contentRect.width ?? 0));
    observer.observe(element);
    // The observer is the real mechanism: this box can change width with the window sitting
    // still. The listener is a second, cheaper path to the same measurement, for the case
    // where observer callbacks are not being delivered — they ride the frame lifecycle, so a
    // document that is not being rendered does not get them.
    window.addEventListener('resize', measure);
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return [ref, width] as const;
}
