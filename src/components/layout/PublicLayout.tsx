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
        <Outlet />
      </motion.main>
      <Footer />
    </div>
  );
}
