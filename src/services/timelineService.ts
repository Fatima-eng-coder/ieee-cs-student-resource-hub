import { supabase } from '@/lib/supabase';
import type { TimelineEvent } from '@/types';

/**
 * Chapter milestones, read by the public timeline and written from the portal.
 *
 * The list used to be a hand-written array in src/data/timeline.ts, which meant every correction
 * was a code change and a deploy — so in practice it was never corrected, and what stayed on the
 * page was the invented placeholder set it shipped with.
 *
 * Deliberately not part of siteContentService. Everything in there is an ordered list an admin
 * nudges up and down with arrows, and shares one sort_order scheme because of it. A timeline has
 * no such freedom: it is ordered by the dates things happened on, and a "move up" button would
 * be offering to put 2024 before 2023.
 */

const columns = 'id,happened_on,title,description';

interface MilestoneRow {
  id: string;
  happened_on: string;
  title: string;
  description: string | null;
}

export type MilestoneInput = Omit<TimelineEvent, 'id'>;

const toMilestone = (row: MilestoneRow): TimelineEvent => ({
  id: row.id,
  // A `date` column comes back as plain 'YYYY-MM-DD' with no time and no zone, which is what the
  // front end wants: turning it into a Date here would re-introduce the midnight drift the
  // column type exists to avoid.
  date: row.happened_on,
  title: row.title,
  description: row.description ?? '',
});

const toPayload = (input: MilestoneInput) => ({
  happened_on: input.date,
  title: input.title.trim(),
  description: input.description.trim(),
});

/** Plain calendar dates only. Anything else would be handed to Postgres to guess at. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Said whenever a write names a row the database no longer holds, however that is discovered. */
const STALE_ROW_MESSAGE = 'That milestone is no longer there. Reload the page to see what is stored.';

/** Everything the database would refuse, said in the admin's own words first. */
function assertMilestone(input: MilestoneInput): void {
  if (!input.title.trim()) throw new Error('Please enter a heading for this milestone.');
  if (!ISO_DATE.test(input.date)) throw new Error('Please pick the date this milestone happened on.');

  // Re-checked rather than left to timeline_milestones_happened_on_check, because a date input
  // lets the year be typed as well as picked, and 0202 is one slipped keystroke from 2020.
  const year = Number(input.date.slice(0, 4));
  if (year < 1963 || year > 2100) {
    throw new Error('That year does not look right. Please check the date.');
  }

  // Date.parse of a 'YYYY-MM-DD' string is defined to be UTC, so this compares like with like
  // and no timezone can make a valid date look invalid.
  if (Number.isNaN(Date.parse(input.date))) throw new Error('That is not a real date.');
}

const friendlyReadError = (message: string): string => {
  const lower = message.toLowerCase();

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('load failed')) {
    return 'We could not reach the server, so the timeline could not be loaded.';
  }
  if (lower.includes('does not exist') || lower.includes('schema cache')) {
    return 'The timeline is not ready yet. Please check the timeline_milestones table and Data API settings.';
  }
  return 'The timeline could not be loaded right now. Please try again shortly.';
};

/**
 * Mapped on SQLSTATE first: one refusal arrives as "permission denied for table
 * timeline_milestones" and another as "new row violates row-level security policy", and they are
 * the same 42501 saying the same thing.
 */
const friendlyWriteError = (error: { code?: string; message: string }): string => {
  const lower = error.message.toLowerCase();

  if (error.code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Only content managers can change the timeline.';
  }
  if (error.code === '23514' || lower.includes('violates check constraint')) {
    if (lower.includes('title')) return 'Please enter a heading for this milestone.';
    if (lower.includes('happened_on')) return 'That year does not look right. Please check the date.';
    return 'Some of these details are not allowed. Please check the fields and try again.';
  }
  if (lower.includes('invalid input syntax') && lower.includes('date')) {
    return 'Please pick the date this milestone happened on.';
  }
  // PostgREST's answer when a single-row write matched nothing, which here almost always means
  // another content manager deleted the milestone while this drawer was open.
  if (lower.includes('multiple (or no) rows') || lower.includes('0 rows')) return STALE_ROW_MESSAGE;
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'That milestone could not be saved right now. Please try again.';
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

export const timelineService = {
  /**
   * Oldest first, which is the direction the page is read in: it is a journey, so it starts at
   * the beginning. created_at breaks ties, so two milestones recorded on the same day keep the
   * order they were entered in instead of swapping places between page loads.
   */
  async list(): Promise<TimelineEvent[]> {
    const { data, error } = await supabase
      .from('timeline_milestones')
      .select(columns)
      .order('happened_on', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(friendlyReadError(error.message));
    return (data ?? []).map((row) => toMilestone(row as MilestoneRow));
  },

  async create(input: MilestoneInput): Promise<TimelineEvent> {
    assertMilestone(input);

    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('timeline_milestones')
      .insert({ ...toPayload(input), created_by: userData.user?.id ?? null })
      .select(columns)
      .single();

    if (error) throw new Error(friendlyWriteError(error));
    return toMilestone(data as MilestoneRow);
  },

  async update(id: string, input: MilestoneInput): Promise<TimelineEvent> {
    assertMilestone(input);

    await refreshAuthSession();
    const { data, error } = await supabase
      .from('timeline_milestones')
      .update(toPayload(input))
      .eq('id', id)
      .select(columns)
      .single();

    if (error) throw new Error(friendlyWriteError(error));
    return toMilestone(data as MilestoneRow);
  },

  /**
   * Counted, and the count is load-bearing. Postgres applies an RLS USING clause to DELETE by
   * filtering rows rather than raising, so a caller the policy declines removes nothing and
   * PostgREST answers 204 with no error at all — the page would cross the milestone off screen
   * and it would be back on the next reload. That is reachable without anything strange
   * happening: canManageContent() reads a profile cached at login, so an admin demoted
   * mid-session still passes the client gate while the database says no. A null count means the
   * header was absent and proves nothing, so only an explicit zero is treated as a refusal.
   */
  async remove(id: string): Promise<void> {
    await refreshAuthSession();

    const { error, count } = await supabase
      .from('timeline_milestones')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw new Error(friendlyWriteError(error));
    if (count === 0) throw new Error(STALE_ROW_MESSAGE);
  },
};
