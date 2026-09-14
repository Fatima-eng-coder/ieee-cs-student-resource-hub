-- Whether an announcement appears in the scrolling ticker above the header.
--
-- The ticker had no setting of its own. It inferred one from `pinned`:
--
--     const pinned = announcements.filter((a) => a.pinned);
--     const source = (pinned.length ? pinned : announcements).slice(0, 6);
--
-- so the moment ANY announcement was pinned, every unpinned one silently dropped out of the
-- bar. Pinning one notice to the top of /announcements emptied the ticker of the other five,
-- with nothing on screen to explain it. Two different jobs -- "sort this to the top of the
-- announcements page" and "put this in the site-wide ticker" -- were sharing one checkbox, so
-- there was no way to ask for either without also getting the other.
--
-- This column gives the ticker its own answer. `pinned` goes back to meaning only what its
-- badge on the public card says it means.
--
-- DEFAULT true, so nothing disappears when this ships: every announcement that exists today
-- keeps showing in the bar, and the setting is something an admin opts OUT of for a notice
-- that is not worth a site-wide marquee. The opposite default would silently empty the ticker
-- on deploy and wait for somebody to notice.

set local statement_timeout = '60s';

ALTER TABLE "public"."announcements"
    ADD COLUMN IF NOT EXISTS "show_in_ticker" boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN "public"."announcements"."show_in_ticker" IS
    'Whether this announcement plays in the site-wide scrolling ticker above the header. '
    'Independent of "pinned", which only sorts it to the top of the announcements page.';

-- No index. The ticker does not filter server-side: it shares the one announcements read the
-- whole site already makes (announcementsService.list()) and filters the result in the
-- browser, so an index here would be paid for on every write and read by nothing.
--
-- No GRANT either, and this is worth stating rather than leaving as an omission: the grants on
-- this table are table-level (GRANT SELECT ON TABLE "public"."announcements" TO "anon"), and a
-- table-level grant covers columns added later automatically. A column-level grant scheme
-- would have needed a line here.
--
-- Nothing else needs touching:
--   * the RLS policies are row-scoped and name no columns;
--   * the realtime publication entry carries no column list, so the new column replicates;
--   * REPLICA IDENTITY FULL already sends whole rows;
--   * public.active_promotions() selects an explicit column list from announcements, so it
--     neither picks this up nor breaks on it.
