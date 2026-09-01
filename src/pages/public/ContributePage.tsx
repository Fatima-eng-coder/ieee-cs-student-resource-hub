import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, X, Check, AlertCircle, Loader2, LogIn } from 'lucide-react';
import Icon, { type IconName } from '@/components/ui/Icon';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import PhotoFilePicker from '@/components/ui/PhotoFilePicker';
import { eventsService, subscribeEventsChanged } from '@/services/eventsService';
import {
  eventImageSubmissionsService,
  MAX_EVENT_PHOTOS,
} from '@/services/eventImageSubmissionsService';
import { useAuth } from '@/context/AuthContext';
import type { EventItem } from '@/types';

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
  { title: 'Report Navigation Issue', icon: 'compass', to: '/navigation/report', description: 'Flag an incorrect indoor route.' },
  { title: 'Submit Event Photos', icon: 'image', action: 'event-photos', description: 'Share photos from a recent event.' },
  { title: 'General Feedback', icon: 'message', to: '/faq-contact', description: 'Tell us what we can improve.' },
  { title: 'Sponsorship / Advertisement', icon: 'users', to: '/faq-contact', description: 'Partner with IEEE CS for your brand or event.' },
];

export default function ContributePage() {
  const { user, ensureAuth } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [photoModal, setPhotoModal] = useState(false);
  const [eventId, setEventId] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let ignore = false;

    const loadEvents = () =>
      eventsService
        .listPublic()
        .then((items) => {
          if (!ignore) setEvents(items);
        })
        .catch(() => {
          if (!ignore) setEvents([]);
        });

    const unsubscribe = subscribeEventsChanged(loadEvents);
    void loadEvents();

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, []);

  const previousEvents = useMemo(() => events.filter((event) => event.timing === 'previous'), [events]);

  /**
   * The upload needs a session, so a guest is asked to sign in at the point they click rather
   * than after they have chosen an event and three photos and pressed send.
   */
  const openPhotoModal = () => {
    if (!ensureAuth(() => setPhotoModal(true), 'Log in to send photos from an event.')) return;
    setPhotoModal(true);
  };

  const submitPhotos = async () => {
    const ev = previousEvents.find((e) => e.id === eventId);
    if (!ev) return setError('Choose which event these photos are from.');

    setSending(true);
    setError('');
    try {
      await eventImageSubmissionsService.submit({ eventName: ev.title, files: photos });
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Those photos could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const closeModal = () => {
    if (sending) return;
    setPhotoModal(false);
    setTimeout(() => {
      setDone(false);
      setPhotos([]);
      setEventId('');
      setError('');
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
                  <button type="button" data-cursor="link" onClick={openPhotoModal} className={cls}>
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
                  <p className="mt-1 text-sm text-slate-500">
                    Thanks — the team will review them and add them to the gallery.
                  </p>
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
                    {previousEvents.length === 0 && (
                      <option value="" disabled>
                        No previous events available
                      </option>
                    )}
                    {previousEvents.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                  </select>

                  <label className="mt-4 block text-sm font-semibold text-slate-700">Photos</label>
                  <div className="mt-1.5">
                    <PhotoFilePicker value={photos} onChange={setPhotos} max={MAX_EVENT_PHOTOS} />
                  </div>

                  {error && (
                    <p
                      role="alert"
                      className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                    </p>
                  )}

                  {!user ? (
                    <button
                      onClick={() => ensureAuth(undefined, 'Log in to send photos from an event.')}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
                    >
                      <LogIn className="h-4 w-4" /> Log in to send photos
                    </button>
                  ) : (
                    <button
                      onClick={() => void submitPhotos()}
                      disabled={!eventId || photos.length === 0 || sending}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {sending ? 'Sending…' : 'Submit Photos'}
                    </button>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
