/**
 * Generic searchable picker — one combobox behind every "pick a thing from a long
 * list" control (courses, faculty, and whatever comes next).
 *
 * Matching mirrors the building navigator's search (src/lib/navigation/search.ts):
 * people type "cs101" for "CS-101" and "dr ahmad" for "Dr. Ahmad", so queries and
 * haystacks are both stripped of punctuation and case before comparison, and hits
 * are ranked so an exact code beats a stray substring buried in a description.
 *
 * The one deliberate divergence is the fuzzy band. The navigator matches a subsequence
 * against a room name of a dozen characters; here the haystack is a whole course row
 * (code + name + department, 40-60 characters), long enough that an unbounded
 * subsequence matches almost anything. See `isFuzzyMatch`.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';

/** Strip punctuation and case so "CS-101", "cs 101" and "cs101" all normalise alike. */
const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Characters the haystack may hold that the query does not — one or two dropped keys. */
const FUZZY_SLACK = 2;
/** Shorter than this, a fuzzy hit carries no information however tight the window. */
const FUZZY_MIN_LENGTH = 5;

/**
 * Every character of `query` appears in `text` in order *and* inside a window barely
 * wider than the query itself.
 *
 * The window is the whole point. A plain subsequence lets a short query thread its way
 * across an entire long haystack — "cat" scattered over "csc101introduction..." — which
 * matched most of the catalogue and made "no matches found" unreachable. Bounding the
 * span keeps this what it was meant to be: tolerance for a couple of dropped keystrokes.
 */
function isFuzzyMatch(query: string, text: string): boolean {
  const maxSpan = query.length + FUZZY_SLACK;

  for (let start = 0; start + query.length <= text.length; start += 1) {
    if (text[start] !== query[0]) continue;

    // Greedy from a fixed start yields the earliest possible end, so this is the tightest
    // span available for that start — no need to explore later matches of the same char.
    const limit = Math.min(text.length, start + maxSpan);
    let matched = 1;
    for (let j = start + 1; j < limit && matched < query.length; j += 1) {
      if (text[j] === query[matched]) matched += 1;
    }
    if (matched === query.length) return true;
  }

  return false;
}

interface Entry<T> {
  item: T;
  index: number;
  /** Normalised haystack, e.g. "cs 101 data structures". */
  text: string;
  /** Haystack with all separators removed, e.g. "cs101datastructures". */
  squashed: string;
  words: string[];
}

/**
 * Higher is better; 0 means no match. The bands are wide apart so an exact hit always
 * outranks a prefix hit, a prefix hit always outranks a substring hit, and so on.
 */
function score<T>(entry: Entry<T>, query: string, squashedQuery: string): number {
  const { text, squashed, words } = entry;

  if (text === query || squashed === squashedQuery) return 1000;
  if (text.startsWith(query) || squashed.startsWith(squashedQuery)) return 800;

  // Word-start match: "structures" finds "Data Structures".
  if (words.some((word) => word.startsWith(query))) return 600;

  if (text.includes(query)) return 450;
  if (squashed.includes(squashedQuery)) return 400;

  // Last resort — only for queries long enough that a loose match is still meaningful.
  if (squashedQuery.length >= FUZZY_MIN_LENGTH && isFuzzyMatch(squashedQuery, squashed)) return 100;

  return 0;
}

export interface SearchSelectOptionState {
  active: boolean;
  selected: boolean;
}

export interface SearchSelectProps<T> {
  items: T[];
  /** Key of the current selection; empty string or null when nothing is picked. */
  value: string | null | undefined;
  /** Fires with the picked key, or `''` when cleared via `allowClear`. */
  onChange: (key: string, item: T | null) => void;
  getKey: (item: T) => string;
  /** Text shown in the closed input for the current selection. */
  getLabel: (item: T) => string;
  /** Everything a query may match against, in one string. */
  getSearchText: (item: T) => string;
  /** Row body. Defaults to the plain label; the selected tick is drawn either way. */
  renderOption?: (item: T, state: SearchSelectOptionState) => ReactNode;
  /** Accessible name for the combobox — visible field labels are not wired up to it. */
  label: string;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  allowClear?: boolean;
  /** Pinned under the scrolling results — an escape hatch such as "suggest a new one". */
  footer?: ReactNode;
  /** Cap on rendered rows; the list is a picker, not a report. */
  limit?: number;
}

export default function SearchSelect<T>({
  items,
  value,
  onChange,
  getKey,
  getLabel,
  getSearchText,
  renderOption,
  label,
  placeholder = 'Search',
  emptyMessage = 'No matches found.',
  disabled = false,
  loading = false,
  allowClear = false,
  footer,
  limit = 40,
}: SearchSelectProps<T>) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const reduceMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const selected = useMemo(
    () => (value ? items.find((item) => getKey(item) === value) ?? null : null),
    [items, value, getKey]
  );

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery('');
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const index = useMemo<Entry<T>[]>(
    () =>
      items.map((item, position) => {
        const text = normalise(getSearchText(item));
        return {
          item,
          index: position,
          text,
          squashed: compact(text),
          words: text.split(' ').filter(Boolean),
        };
      }),
    [items, getSearchText]
  );

  const results = useMemo(() => {
    const normalised = normalise(query);
    if (!normalised) return items.slice(0, limit);

    const squashedQuery = compact(query);
    const scored: { item: T; score: number; index: number }[] = [];

    for (const entry of index) {
      const hit = score(entry, normalised, squashedQuery);
      if (hit > 0) scored.push({ item: entry.item, score: hit, index: entry.index });
    }

    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return scored.slice(0, limit).map((result) => result.item);
  }, [index, items, query, limit]);

  // While loading, the rows are replaced by a spinner. Anything that navigates or selects
  // has to agree with what is on screen, so as far as the rest of the component is
  // concerned there are no options at all until the spinner goes away.
  const options = useMemo<T[]>(() => (loading ? [] : results), [loading, results]);

  // Both cursor resets happen during render rather than in an effect: a setState effect
  // commits the stale row first and repaints, which on a fast typist flashes the wrong
  // highlight on every keystroke.
  const [querySnapshot, setQuerySnapshot] = useState(query);
  if (querySnapshot !== query) {
    setQuerySnapshot(query);
    setCursor(0);
  }

  const [openSnapshot, setOpenSnapshot] = useState(open);
  if (openSnapshot !== open) {
    setOpenSnapshot(open);
    // Opening lands on the current selection so ArrowDown continues where the user left off.
    const selectedIndex = open && value ? options.findIndex((item) => getKey(item) === value) : -1;
    setCursor(selectedIndex > 0 ? selectedIndex : 0);
  }

  // `items` can be swapped under a stable query, so the cursor is clamped every render —
  // otherwise aria-activedescendant names an option that is no longer in the DOM.
  const activeIndex = options.length > 0 ? Math.min(cursor, options.length - 1) : 0;

  // Hover already placed the row under the pointer. Scrolling it flush would slide the
  // list beneath a stationary cursor and fire mouseenter on whichever row landed there.
  const cursorMovedByHover = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (cursorMovedByHover.current) {
      cursorMovedByHover.current = false;
      return;
    }
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, options]);

  // Focusing the field is normally the user asking for the list, but the clear button and
  // the chevron only ever hand focus back — that must not reopen what they just closed.
  const openOnFocus = useRef(true);

  const refocusInput = () => {
    if (!inputRef.current || document.activeElement === inputRef.current) return;
    openOnFocus.current = false;
    inputRef.current.focus();
  };

  const commit = (item: T) => {
    onChange(getKey(item), item);
    setQuery('');
    setOpen(false);
    refocusInput();
  };

  const clear = () => {
    onChange('', null);
    setQuery('');
    refocusInput();
  };

  const move = (delta: number) => {
    const count = options.length;
    if (count === 0) return;
    // Functional, so several key-repeat events landing in one batch each step a row; the
    // clamp inside keeps that in step with the row actually highlighted.
    setCursor((current) => (Math.min(current, count - 1) + delta + count) % count);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        else move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) setOpen(true);
        else move(-1);
        break;
      case 'Home':
        if (!open) break;
        event.preventDefault();
        setCursor(0);
        break;
      case 'End':
        if (!open || options.length === 0) break;
        event.preventDefault();
        setCursor(options.length - 1);
        break;
      case 'Enter': {
        if (!open) break;
        const item = options[activeIndex];
        // Always swallow Enter while open — these pickers live inside forms.
        event.preventDefault();
        if (item) commit(item);
        break;
      }
      case 'Escape':
        if (!open) break;
        // Keep an enclosing modal or drawer open; Escape belongs to the list first.
        event.stopPropagation();
        event.preventDefault();
        setOpen(false);
        setQuery('');
        break;
      case 'Tab':
        setOpen(false);
        setQuery('');
        break;
      default:
        break;
    }
  };

  const listOpen = open && !disabled;
  const showClear = allowClear && !!selected && !disabled;
  const displayValue = open ? query : selected ? getLabel(selected) : '';

  // The spinner and the empty row are decorative inside the listbox, so a query with no
  // hits would otherwise be answered with silence.
  const status = !listOpen
    ? ''
    : loading
      ? 'Loading options'
      : options.length === 0
        ? emptyMessage
        : `${options.length} option${options.length === 1 ? '' : 's'} available`;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={listOpen}
          // The listbox only exists while the panel is mounted; naming it otherwise points
          // the input at an id that is not in the document.
          aria-controls={listOpen ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && options.length > 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          disabled={disabled}
          value={displayValue}
          onFocus={() => {
            if (!openOnFocus.current) {
              openOnFocus.current = true;
              return;
            }
            setOpen(true);
          }}
          // Picking an option keeps focus in the input, so onFocus alone would never reopen it.
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className={`w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-ieee-orange focus:ring-2 focus:ring-ieee-orange/20 disabled:cursor-not-allowed disabled:opacity-60 ${
            showClear ? 'pr-18' : 'pr-10'
          }`}
        />
        {showClear && (
          <button
            type="button"
            onClick={clear}
            onMouseDown={(event) => event.preventDefault()}
            className="absolute right-9 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-black/5 hover:text-slate-700"
            aria-label={`Clear ${label}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setOpen((wasOpen) => !wasOpen);
            setQuery('');
            refocusInput();
          }}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-black/5 hover:text-slate-700 disabled:cursor-not-allowed"
          aria-label={`Toggle ${label} list`}
          tabIndex={-1}
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Mounted at all times: a live region added to the page in the same paint as its
          text is routinely dropped by screen readers. */}
      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>

      {listOpen && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          className="absolute z-30 mt-2 flex max-h-80 w-full flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
        >
          <ul id={listboxId} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {loading ? (
              <li role="presentation" className="flex items-center gap-2 px-3 py-3 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </li>
            ) : options.length === 0 ? (
              <li role="presentation" className="px-3 py-3 text-sm text-slate-400">
                {emptyMessage}
              </li>
            ) : (
              options.map((item, position) => {
                const key = getKey(item);
                const isSelected = key === value;
                const isActive = position === activeIndex;

                return (
                  <li
                    key={key}
                    id={optionId(position)}
                    role="option"
                    aria-selected={isSelected}
                    data-cursor="link"
                    ref={(node) => {
                      optionRefs.current[position] = node;
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => {
                      if (position === activeIndex) return;
                      cursorMovedByHover.current = true;
                      setCursor(position);
                    }}
                    onClick={() => commit(item)}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      isActive ? 'bg-cream' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      {renderOption ? (
                        renderOption(item, { active: isActive, selected: isSelected })
                      ) : (
                        <span className="block truncate text-sm font-semibold text-slate-800">{getLabel(item)}</span>
                      )}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-ieee-orange" />}
                  </li>
                );
              })
            )}
          </ul>

          {footer && <div className="shrink-0 border-t border-black/5 p-1.5">{footer}</div>}
        </motion.div>
      )}
    </div>
  );
}
