import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { announcementsService } from '@/services/announcementsService';
import type { Announcement } from '@/types';

export default function AnnouncementBar() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  /*
   * Refreshed when the tab comes back, not over a realtime subscription.
   *
   * This bar is in the layout, so it mounts on every page for every visitor — and a realtime
   * subscription here meant every anonymous reader held an open WebSocket for the lifetime of
   * their visit. Measured on a plain /courses page: two joined channels, one of them this.
   *
   * Concurrent realtime connections are the scarcest resource in this deployment by a wide
   * margin — a few hundred, against request throughput an order of magnitude higher — so
   * spending one per reader to make a marquee update a few seconds sooner is the worst trade
   * available. Somebody arriving after an announcement is published gets it on load; somebody
   * already here gets it when they next focus the tab.
   *
   * The admin dashboard still subscribes, which is where seeing a change land instantly is
   * actually worth something and where the number of clients is small.
   */
  useEffect(() => {
    let ignore = false;

    const load = () => announcementsService
      .list()
      .then((items) => {
        if (!ignore) setAnnouncements(items);
      })
      .catch((error) => {
        console.error('Failed to load announcements ticker', error);
      });

    const refreshOnReturn = () => {
      if (!document.hidden) void load();
    };

    void load();
    document.addEventListener('visibilitychange', refreshOnReturn);
    window.addEventListener('focus', refreshOnReturn);

    return () => {
      ignore = true;
      document.removeEventListener('visibilitychange', refreshOnReturn);
      window.removeEventListener('focus', refreshOnReturn);
    };
  }, []);

  // Prefer pinned announcements, fall back to the latest — these drive the ticker live.
  const pinned = announcements.filter((a) => a.pinned);
  const source = (pinned.length ? pinned : announcements).slice(0, 6);
  if (source.length === 0) return null;

  // Duplicate the list so the marquee loops seamlessly.
  const items = [...source, ...source];

  return (
    <div className="overflow-hidden bg-ieee-ink py-2 text-white">
      <div className="flex w-max animate-marquee gap-16 whitespace-nowrap font-mono text-[11px] uppercase tracking-wider">
        {items.map((a, idx) => (
          <Link
            key={`${a.id}-${idx}`}
            to={`/announcements/${a.id}`}
            className="flex items-center gap-2 text-slate-300 transition-colors hover:text-ieee-orange"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-ieee-orange" />
            {a.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
