import { useEffect, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface MagneticProps {
  children: ReactNode;
  strength?: number;
  className?: string;
}

/** Wraps a button/card and gently pulls it toward the cursor within its bounds. */
export default function Magnetic({ children, strength = 0.35, className }: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(q.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    q.addEventListener('change', onChange);
    return () => q.removeEventListener('change', onChange);
  }, []);

  function handleMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || reduced) return;
    const rect = el.getBoundingClientRect();
    // getBoundingClientRect reports the *transformed* box, so the centre it
    // gives has already been displaced by the pull we applied last frame.
    // Subtracting the rendered offset measures against where the element rests,
    // which stops the target from receding as the element chases it — that
    // feedback both weakened the pull (0.35 behaved like 0.26) and left the
    // spring settling against a moving goal, which is what read as lag.
    const restCenterX = rect.left + rect.width / 2 - springX.get();
    const restCenterY = rect.top + rect.height / 2 - springY.get();
    x.set((e.clientX - restCenterX) * strength);
    y.set((e.clientY - restCenterY) * strength);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      ref={ref}
      data-cursor="link"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x: springX, y: springY }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
