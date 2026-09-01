import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '@/components/navigation/Header';
import Footer from '@/components/layout/Footer';
import AnnouncementBar from '@/components/navigation/AnnouncementBar';
import ScrollToTop from '@/components/effects/ScrollToTop';
import CursorField from '@/components/effects/CursorField';
import CurvedScrollBar from '@/components/effects/CurvedScrollBar';
import AnimatedBackground from '@/components/effects/AnimatedBackground';

export default function PublicLayout() {
  const location = useLocation();

  return (
    <div className="cursor-none-fine flex min-h-screen flex-col">
      {/* One persistent 3D field for the whole site — mounted once here so it
          never remounts (and stutters) between page navigations. */}
      <AnimatedBackground />

      {/* Global route + ambient behaviors shared by every public page. */}
      <ScrollToTop />
      <CursorField />
      <CurvedScrollBar />

      <AnnouncementBar />
      <Header />
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex-1"
      >
        {/* Heavier routes (the wayfinding map and its building dataset) are code-split,
            so give them a boundary to land in. */}
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </motion.main>
      <Footer />
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-ieee-orange/30 border-t-ieee-orange" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
