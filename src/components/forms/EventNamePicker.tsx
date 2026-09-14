import { useMemo, useState } from 'react';
import { CalendarDays, CornerDownLeft, PencilLine, X } from 'lucide-react';

import SearchSelect from '@/components/ui/SearchSelect';
import type { EventItem } from '@/types';

/**
 * "Which event are these photos from?" — answered by searching the real list, or by typing a
 * name that is not on it.
 *
 * This replaced a native `<select>` of past events only. Two things were wrong with that. The
 * list is long enough to scroll and a `<select>` cannot be searched, so finding last March's
 * workshop meant reading the whole thing; and an event the society never created a row for —
 * a collaboration, a departmental session, something older than the events table — could not
 * be named at all, so those photos simply could not be sent.
 *
 * The free-text half costs nothing to store: event_image_submissions.event_name has always
 * been plain text with no foreign key, precisely so "an album may be named before the event row
 * is" (the service says so at the type). The capability was already in the database; only the
 * UI withheld it.
 *
 * The typed name is deliberately NOT matched back onto an event behind the scenes. Someone who
 * types "Speed Programming" when "Speed Programming Contest 2026" exists has told us they did
 * not find it, and quietly filing their photos under a row they did not choose would hide that
 * from the admin reviewing them — who is the person able to tell the difference.
 */

export interface EventNameValue {
  /** What gets stored. The event's title when one was picked, otherwise what was typed. */
  name: string;
  /** The event row, when the name came from the list. Null for a typed name. */
  eventId: string | null;
}

const EMPTY: EventNameValue = { name: '', eventId: null };

/** Newest first: photos almost always come from something that just happened. */
function byMostRecent(a: EventItem, b: EventItem) {
  return b.date.localeCompare(a.date);
}

function formatEventDate(iso: string): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const name = months[Number(month) - 1];
  return name ? `${day} ${name} ${year}` : iso;
}

export default function EventNamePicker({
  events,
  value,
  onChange,
  loading = false,
}: {
  events: EventItem[];
  value: EventNameValue;
  onChange: (value: EventNameValue) => void;
  loading?: boolean;
}) {
  // Typed mode is sticky once entered, rather than derived from "the name matches no event".
  // Derived, a typed name that happens to equal an event title would snap the control back to
  // the picker mid-sentence and overwrite what was being written.
  const [typing, setTyping] = useState(false);

  // Every event, not just past ones. An event that ran this morning is still "upcoming" by
  // date, and the old filter made exactly the photos people send soonest impossible to file.
  const sorted = useMemo(() => [...events].sort(byMostRecent), [events]);

  if (typing) {
    return (
      <div>
        <div className="relative">
          <PencilLine
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            autoFocus
            value={value.name}
            onChange={(event) => onChange({ name: event.target.value, eventId: null })}
            placeholder="e.g. Orientation Day 2026"
            aria-label="Event name"
            maxLength={120}
            className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-ieee-orange focus:ring-2 focus:ring-ieee-orange/20"
          />
          <button
            type="button"
            onClick={() => {
              setTyping(false);
              onChange(EMPTY);
            }}
            aria-label="Go back to the event list"
            className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Typing the name yourself. The team will match it up when they review the photos —{' '}
          <button
            type="button"
            onClick={() => {
              setTyping(false);
              onChange(EMPTY);
            }}
            className="font-semibold text-ieee-orange underline underline-offset-2"
          >
            search the list instead
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <SearchSelect
      items={sorted}
      value={value.eventId}
      onChange={(_key, item) => onChange(item ? { name: item.title, eventId: item.id } : EMPTY)}
      getKey={(event) => event.id}
      getLabel={(event) => event.title}
      // The date and venue are in the haystack because two events often share a title across
      // years — "Speed Programming Contest" is not one event — and the year is how somebody
      // tells them apart.
      getSearchText={(event) => `${event.title} ${event.date} ${event.venue} ${event.category}`}
      renderOption={(event) => (
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-800">{event.title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <CalendarDays className="h-3 w-3 shrink-0" />
            {formatEventDate(event.date) || 'Date not recorded'}
            {event.venue ? ` · ${event.venue}` : ''}
          </span>
        </span>
      )}
      label="Which event are these photos from?"
      placeholder="Search events…"
      emptyMessage="No event matches that."
      loading={loading}
      allowClear
      footer={(query) => (
        <button
          type="button"
          onMouseDown={(event) => {
            // mousedown, not click: the combobox closes on blur, and a click handler on a row
            // that is being unmounted by that blur never fires.
            event.preventDefault();
            setTyping(true);
            onChange({ name: query.trim(), eventId: null });
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-ieee-orange/5 hover:text-ieee-orange"
        >
          <CornerDownLeft className="h-3.5 w-3.5 shrink-0" />
          {query.trim() ? (
            <span className="min-w-0 truncate">
              Use “<span className="font-semibold">{query.trim()}</span>” — it is not in the list
            </span>
          ) : (
            <span>My event is not listed — let me type it</span>
          )}
        </button>
      )}
    />
  );
}
