import type { DeveloperProfile } from '@/types';

/**
 * THE DEVELOPER ROSTER — edit this file to change who appears on /developers.
 *
 * Empty on purpose. It held five invented people with stock avatars from pravatar.cc, which is
 * worse than an empty page: a visitor cannot tell placeholder names from real ones, so the page
 * was quietly crediting the work to nobody who did it. /developers shows a "coming soon" screen
 * while this list is empty, and turns itself into the real page the moment somebody is added --
 * no other edit needed.
 *
 * Names, roles, photos and write-ups are deliberately authored here rather than in the
 * database: the list changes once a year at most, and an admin panel that can add or remove
 * people is a way to lose them by accident. The admin panel edits only the contact links,
 * which are the part that actually goes stale.
 *
 * `id` is the join key to the developer_links table. Adding somebody here also needs a row
 * there — see supabase/migrations/20260901000400_hierarchy_and_content.sql, which is where
 * those rows are created, because the table has no INSERT policy for the app.
 */
export const developerProfiles: DeveloperProfile[] = [];
