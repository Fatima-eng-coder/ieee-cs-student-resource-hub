/**
 * Milestone dates, and how much of one is known.
 *
 * Some milestones are remembered to the day, some only to the month, and some only as a year.
 * The table stores a real date either way -- it is what keeps the timeline in order -- and
 * `precision` says which parts of it anybody actually vouched for. Everything here works on the
 * stored characters rather than through a Date: 'YYYY-MM-DD' parses as UTC midnight, so a Date
 * would show a reader west of Greenwich the day before the one the row holds.
 */

export type MilestonePrecision = 'year' | 'month' | 'day';

export const MILESTONE_PRECISIONS: MilestonePrecision[] = ['year', 'month', 'day'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Year, month and day as typed: month and day are empty strings when they are not known. */
export interface MilestoneDateParts {
  year: string;
  month: string;
  day: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a string is a plain 'YYYY-MM-DD' calendar date that really exists. */
export function isRealDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;

  // Round-tripped through UTC, so 2025-02-31 (which Date would roll into March) is refused
  // rather than silently moved.
  const [year, month, day] = iso.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
  );
}

/**
 * The date as it should be stored for the precision given: the parts that are not known are set
 * to 1 rather than left at whatever the editor happened to show.
 */
export function normalizeMilestoneDate(iso: string, precision: MilestonePrecision): string {
  const [year, month] = iso.split('-');
  if (precision === 'year') return `${year}-01-01`;
  if (precision === 'month') return `${year}-${month}-01`;
  return iso;
}

/** What the public page and the portal both print for a milestone. */
export function formatMilestoneDate(iso: string, precision: MilestonePrecision): string {
  const [year, month, day] = iso.split('-');
  const name = MONTHS[Number(month) - 1];

  if (precision === 'year' || !name) return year;
  if (precision === 'month') return `${name} ${year}`;
  // Without the padding a date reads as a date and not as a serial number: "7 Sep", not "07 Sep".
  return `${Number(day)} ${name} ${year}`;
}

/**
 * Splits a stored date into the three boxes the editor shows, leaving the parts the precision
 * says are unknown empty — so an admin editing a year-only milestone sees an empty month rather
 * than the January the table had to store.
 */
export function splitMilestoneDate(iso: string, precision: MilestonePrecision): MilestoneDateParts {
  const [year, month, day] = iso.split('-');
  return {
    year: year ?? '',
    month: precision === 'year' ? '' : (month ?? ''),
    day: precision === 'day' ? (day ?? '') : '',
  };
}

/**
 * The other direction: three boxes to a date and a precision.
 *
 * "Not known" can be written three ways, because all three are what people actually type: an
 * empty box, a zero, or the "00" the team agreed on. A day without a month is a day nobody can
 * place, so it is dropped with the month rather than guessed at.
 *
 * Returns null when what is typed is not a date at all, which is the editor's cue to say so
 * instead of saving something it invented.
 */
export function joinMilestoneDate(parts: MilestoneDateParts): { date: string; precision: MilestonePrecision } | null {
  const year = parts.year.trim();
  if (!/^\d{4}$/.test(year)) return null;

  const unknown = (value: string) => {
    const trimmed = value.trim();
    return trimmed === '' || /^0+$/.test(trimmed);
  };

  const pad = (value: string) => value.trim().padStart(2, '0');

  if (unknown(parts.month)) return { date: `${year}-01-01`, precision: 'year' };
  const month = pad(parts.month);
  if (!/^(0[1-9]|1[0-2])$/.test(month)) return null;

  if (unknown(parts.day)) return { date: `${year}-${month}-01`, precision: 'month' };
  const day = pad(parts.day);
  if (!/^(0[1-9]|[12]\d|3[01])$/.test(day)) return null;

  const date = `${year}-${month}-${day}`;
  return isRealDate(date) ? { date, precision: 'day' } : null;
}
