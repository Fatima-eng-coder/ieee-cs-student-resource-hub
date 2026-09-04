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

  /*
   * Fill the bar, however few announcements there are.
   *
   * The track was exactly two copies of the list. That is the minimum the animation needs --
   * it translates by -50%, so the second copy has to be sitting where the first started when
   * it wraps -- but two copies of ONE short headline is a track narrower than the bar, and the
   * result was a lonely item with a screenful of empty ink trailing it.
   *
   * So the list is first repeated until there is enough of it to plausibly span a wide screen,
   * and only then doubled. The doubling stays exact, because the -50% is what makes the loop
   * seamless; repeating an odd number of times would make it jump. No invented announcements:
   * one real headline simply comes round more often, which is what a ticker with one thing to
   * say should do.
   */
  const MIN_TRACK_ITEMS = 6;
  const repeats = Math.max(1, Math.ceil(MIN_TRACK_ITEMS / source.length));
  const track = Array.from({ length: repeats }, () => source).flat();
  const items = [...track, ...track];

  return (
    <div className="overflow-hidden bg-ieee-ink py-2 text-white">
      <div className="flex w-max animate-marquee gap-16 whitespace-nowrap font-mono text-[11px] uppercase tracking-wider">
        {items.map((a, idx) => (
          <Link
            key={`${a.id}-${idx}`}
            to={`/announcements/${a.id}`}
            // Every copy after the first is the same headline again. Hiding them from the
            // accessibility tree stops a screen reader reading the list N times over; it was
            // already reading everything twice before this change.
            aria-hidden={idx >= source.length}
            tabIndex={idx >= source.length ? -1 : undefined}
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
