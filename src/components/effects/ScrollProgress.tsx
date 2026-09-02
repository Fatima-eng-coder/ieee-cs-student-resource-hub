import { useEffect, useState } from 'react';
import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { scrollBehavior } from './scrollBehavior';

const sections = [
  { id: 'hero', label: 'Home' },
  { id: 'hierarchy', label: 'Team' },
  { id: 'quick-links', label: 'Resources' },
  { id: 'events', label: 'Events' },
  { id: 'projects', label: 'Projects' },
  { id: 'about-cta', label: 'About' },
];

/** Fixed vertical scroll-progress rail with per-section markers, gsap.com-style. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const reduced = useReducedMotion();
  // damping 40 against a critical value of ~18.8 was more than twice overdamped,
  // so the rail crawled toward the real scroll position long after the wheel had
  // stopped. ~1.07 tracks tightly without overshooting past the marker.
  const smooth = useSpring(scrollYProgress, { stiffness: 300, damping: 22, mass: 0.35 });
  // Reduced motion gets the raw value: still a progress bar, but with no motion
  // of its own beyond the scroll the visitor is driving.
  const scaleY = reduced ? scrollYProgress : smooth;
  const [active, setActive] = useState('hero');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="pointer-events-none fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 lg:block">
      <div className="relative flex h-72 w-4 flex-col items-center justify-between">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />
        <motion.div
          className="absolute left-1/2 top-0 w-px origin-top -translate-x-1/2 bg-ieee-orange"
          style={{ scaleY, height: '100%' }}
        />
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: scrollBehavior() })}
            data-cursor="link"
            className="group pointer-events-auto relative z-10 flex h-4 w-4 items-center justify-center"
            aria-label={`Jump to ${s.label}`}
          >
            <span
              className={`h-2 w-2 rounded-full border transition-all duration-300 ${
                active === s.id
                  ? 'scale-150 border-ieee-orange bg-ieee-orange'
                  : 'border-white/25 bg-[#1E1A14] group-hover:border-white/60'
              }`}
            />
            <span className="pointer-events-none absolute right-5 whitespace-nowrap rounded-md bg-[#1E1A14] px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-white/70 opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
              {s.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
