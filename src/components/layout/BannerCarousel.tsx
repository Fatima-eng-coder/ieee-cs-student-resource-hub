import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Banner } from '@/types';

interface BannerCarouselProps {
  banners: Banner[];
}

const typeLabel: Record<Banner['type'], string> = {
  sponsor: 'Sponsor',
  workshop: 'Workshop',
  announcement: 'Announcement',
  partner: 'Partner',
  campaign: 'Campaign',
};

export default function BannerCarousel({ banners }: BannerCarouselProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  const banner = banners[index];

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/*
        A portrait banner gets a taller, narrower frame rather than the wide strip.
        object-cover on a fixed 288px-tall box crops a poster through the middle -- the title
        and the date, which is the whole content of a poster, are the first things to go. The
        shape is per-banner because a society is handed both: sponsor strips are wide, event
        posters are tall.
      */}
      <div
        className={`relative mx-auto overflow-hidden rounded-3xl shadow-md ${
          banner.orientation === 'portrait'
            ? 'h-[26rem] w-full max-w-sm sm:h-[32rem]'
            : 'h-72 sm:h-80'
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={banner.id}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            {/* Blurred fill behind, whole image in front: a poster keeps its proportions and
                the frame still has something in its corners. Matches the admin preview. */}
            <img
              src={banner.image}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl"
            />
            <img
              src={banner.image}
              alt={banner.title}
              className={`relative mx-auto h-full w-full ${
                banner.orientation === 'portrait' ? 'object-contain' : 'object-cover'
              }`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 p-6 text-white sm:p-8">
              <span className="rounded-full bg-ieee-orange px-3 py-1 text-xs font-semibold uppercase">
                {typeLabel[banner.type]}
              </span>
              <h3 className="mt-3 text-2xl font-bold sm:text-3xl">{banner.title}</h3>
              {banner.subtitle && <p className="mt-1 text-sm text-slate-200">{banner.subtitle}</p>}
              <Link
                to={banner.ctaLink}
                className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                {banner.ctaLabel}
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="absolute bottom-4 right-4 flex gap-2">
          {banners.map((b, i) => (
            <button
              key={b.id}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-ieee-orange' : 'w-2 bg-white/60'}`}
              aria-label={`Show banner ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
