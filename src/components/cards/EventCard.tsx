import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { EventItem } from '@/types';
import Icon from '@/components/ui/Icon';

interface EventCardProps {
  event: EventItem;
}

const categoryColors: Record<EventItem['category'], string> = {
  workshop: 'bg-blue-100 text-blue-700',
  competition: 'bg-purple-100 text-purple-700',
  seminar: 'bg-teal-100 text-teal-700',
  session: 'bg-amber-100 text-amber-700',
  hackathon: 'bg-orange-100 text-orange-700',
  other: 'bg-slate-100 text-slate-700',
};

export default function EventCard({ event }: EventCardProps) {
  const imageLayout = event.imageLayout ?? 'poster';
  const imageFrameClass = imageLayout === 'banner' ? 'aspect-[16/9]' : 'aspect-[4/5]';
  const imageClass = imageLayout === 'banner' ? 'object-cover' : 'object-contain';

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }} className="h-full">
      <Link
        to={`/events/${event.id}`}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
      >
        <div className={`relative ${imageFrameClass} w-full overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(255,108,12,0.25),transparent_35%),linear-gradient(135deg,#1f1710,#0f1014)]`}>
          {event.image ? <img src={event.image} alt={event.title} className={`h-full w-full ${imageClass}`} /> : null}
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${categoryColors[event.category]}`}>
            {event.category}
          </span>
          {event.featured && (
            <span className="absolute right-3 top-3 rounded-full bg-ieee-yellow px-2.5 py-1 text-xs font-semibold text-ieee-black">
              Featured
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-semibold text-slate-900">{event.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{event.description}</p>
          <div className="mt-3 flex flex-col gap-1 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Icon name="calendar" className="h-3.5 w-3.5 shrink-0" /> {event.date} &middot; {event.time}
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="pin" className="h-3.5 w-3.5 shrink-0" /> {event.venue}
            </span>
          </div>
          {event.timing === 'upcoming' && (
            <div className={`mt-3 text-xs font-semibold ${event.registrationOpen ? 'text-ieee-orange' : 'text-slate-400'}`}>
              {event.registrationOpen ? 'Registration open' : 'Registration closed'}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
