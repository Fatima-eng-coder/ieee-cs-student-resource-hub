import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, X, Check } from 'lucide-react';
import Icon, { type IconName } from '@/components/ui/Icon';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import MultiImageUpload from '@/components/projects/MultiImageUpload';
import { events as seedEvents } from '@/data/events';
import { useCollection } from '@/hooks/useCollection';
import { appendToStorage, makeId } from '@/utils/storage';
import type { EventItem, Submission } from '@/types';

interface Option {
  title: string;
  icon: IconName;
  to?: string;
  action?: 'event-photos';
  description: string;
}

const options: Option[] = [
  { title: 'Contribute Past Paper', icon: 'file', to: '/past-papers/contribute', description: 'Upload a past exam paper for your juniors.' },
  { title: 'Suggest Course Resource', icon: 'book', to: '/courses/suggest-correction', description: 'Correct or add missing course information.' },
  { title: 'Suggest Teacher Info', icon: 'faculty', to: '/courses/suggest-teacher', description: 'Share missing or updated faculty contact details.' },
  { title: 'Submit Project', icon: 'layers', to: '/projects-expo/submit', description: 'Showcase your semester project.' },
  { title: 'Report Navigation Issue', icon: 'compass', to: '/navigation/report', description: 'Flag an incorrect indoor route.' },
  { title: 'Submit Event Photos', icon: 'image', action: 'event-photos', description: 'Share photos from a recent event.' },
  { title: 'General Feedback', icon: 'message', to: '/faq-contact', description: 'Tell us what we can improve.' },
  { title: 'Sponsorship / Advertisement', icon: 'users', to: '/faq-contact', description: 'Partner with IEEE CS for your brand or event.' },
];

export default function ContributePage() {
  const { items: events } = useCollection<EventItem>('events', seedEvents);
  const [photoModal, setPhotoModal] = useState(false);
  const [eventId, setEventId] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const submitPhotos = () => {
    const ev = events.find((e) => e.id === eventId);
    const submission: Submission = {
      id: makeId('sub'),
      type: 'event-photos',
      submittedBy: 'Student',
      submittedAt: new Date().toISOString().slice(0, 10),
      status: 'pending',
      data: { event: ev?.title ?? 'Unspecified', photos: String(photos.length) },
    };
    appendToStorage<Submission>('ieeecs_submissions', [], submission);
    setDone(true);
  };

  const closeModal = () => {
    setPhotoModal(false);
    setTimeout(() => {
      setDone(false);
      setPhotos([]);
      setEventId('');
    }, 200);
  };

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Get Involved"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Contribute' }]}
        title="Contribute to the Hub"
        subtitle="This hub is built by students, for students. Here's every way you can help make it better — pick one and jump in."
        meta={[{ value: `${options.length}`, label: 'Ways to Help' }]}
      />

      <PageSection tone="cream" top>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((opt, idx) => {
            const inner = (
              <>
                <div className="flex items-start justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ieee-orange/10 text-ieee-orange">
                    <Icon name={opt.icon} className="h-6 w-6" />
                  </span>
                  <ArrowUpRight className="h-5 w-5 text-slate-300 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ieee-orange" />
                </div>
                <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">{opt.title}</h3>
                <p className="text-sm text-slate-600">{opt.description}</p>
              </>
            );
            const cls =
              'group flex h-full w-full flex-col gap-3 overflow-hidden rounded-2xl border border-black/5 bg-white p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-ieee-orange/30 hover:shadow-lg';
            return (
              <motion.div
                key={opt.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.35, delay: (idx % 3) * 0.05 }}
              >
                {opt.action === 'event-photos' ? (
                  <button type="button" data-cursor="link" onClick={() => setPhotoModal(true)} className={cls}>
                    {inner}
                  </button>
                ) : (
                  <Link to={opt.to!} data-cursor="link" className={cls}>
                    {inner}
                  </Link>
                )}
              </motion.div>
            );
          })}
        </div>
      </PageSection>

      {/* Event photos modal — the dropdown appears here after choosing "event photos" */}
      <AnimatePresence>
        {photoModal && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-ieee-ink/70 backdrop-blur-sm" onClick={closeModal} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="relative w-full max-w-md rounded-3xl border border-black/5 bg-white p-7 shadow-2xl"
            >
              <button
                onClick={closeModal}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-black/5"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              {done ? (
                <div className="py-6 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Check className="h-7 w-7" />
                  </div>
                  <h2 className="mt-4 font-display text-xl font-bold text-slate-900">Photos submitted!</h2>
                  <p className="mt-1 text-sm text-slate-500">Thanks — the team will review and add them to the gallery.</p>
                  <button
                    onClick={closeModal}
                    className="mt-5 rounded-xl bg-ieee-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-ieee-orange-dark"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="font-display text-xl font-bold text-slate-900">Submit Event Photos</h2>
                  <p className="mt-1 text-sm text-slate-500">Pick the event, then add your photos.</p>

                  {/* the dropdown that appears for the event-photos option */}
                  <label className="mt-5 block text-sm font-semibold text-slate-700">Which event?</label>
                  <select
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-ieee-orange focus:ring-2 focus:ring-ieee-orange/20"
                  >
                    <option value="">Select an event…</option>
                    {events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                  </select>

                  <label className="mt-4 block text-sm font-semibold text-slate-700">Photos</label>
                  <div className="mt-1.5">
                    <MultiImageUpload value={photos} onChange={setPhotos} max={3} />
                  </div>

                  <button
                    onClick={submitPhotos}
                    disabled={!eventId || photos.length === 0}
                    className="mt-5 w-full rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Submit Photos
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
