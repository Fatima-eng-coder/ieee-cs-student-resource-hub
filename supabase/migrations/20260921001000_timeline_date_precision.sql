-- How much of a milestone's date is actually known.
--
-- happened_on is a `date`, so every row has a month and a day whether anybody knew them or not.
-- For "the chapter was founded in 2019" that is a guess the table states as fact, and the public
-- page then prints it -- "Jan 2019" -- with the same confidence as a milestone somebody recorded
-- the morning it happened.
--
-- This column records which parts of the stored date are real:
--
--   'year'   only the year is known; the editor stores January 1st and the page shows "2019"
--   'month'  the month is known; the editor stores the 1st and the page shows "Sep 2019"
--   'day'    the whole date is known; the page shows "17 Sep 2019"
--
-- The date column keeps doing the ordering either way, which is why an unknown month is stored
-- as January rather than left null: a milestone known only by its year sorts at the head of that
-- year, ahead of everything dated within it, and the timeline stays in one sequence.
--
-- 'day' is the default, and the only value the rows written before this can honestly take: each
-- of them holds a real day somebody typed. The public page used to print the month and year only,
-- so those milestones now show their day as well; a milestone whose day was never really known
-- is one edit away from saying so, and the day is then dropped from the row too.

set local statement_timeout = '60s';

ALTER TABLE "public"."timeline_milestones"
    ADD COLUMN IF NOT EXISTS "date_precision" "text" DEFAULT 'day'::"text" NOT NULL;

DO $$
BEGIN
    ALTER TABLE "public"."timeline_milestones"
        ADD CONSTRAINT "timeline_milestones_date_precision_check"
        CHECK ("date_precision" IN ('year', 'month', 'day'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    -- The parts that are not known are not stored either: a year-only milestone holds January
    -- 1st and a month-only milestone holds the 1st, so nothing in the table can be read as a
    -- day somebody vouched for. Without this the column would say "year" while the row still
    -- carried the day it was typed on, and any later reader would have two answers to choose
    -- between.
    ALTER TABLE "public"."timeline_milestones"
        ADD CONSTRAINT "timeline_milestones_precision_parts_check"
        CHECK (
            "date_precision" <> 'year'
            OR ("happened_on" = "date_trunc"('year', "happened_on"::timestamp)::"date")
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "public"."timeline_milestones"
        ADD CONSTRAINT "timeline_milestones_precision_day_check"
        CHECK (
            "date_precision" <> 'month'
            OR ("happened_on" = "date_trunc"('month', "happened_on"::timestamp)::"date")
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN "public"."timeline_milestones"."date_precision" IS
    'How much of happened_on is known: year, month or day. Parts that are not known are stored as 1 and never shown.';

-- Table-level grants (20260906001000) already cover a new column for both roles, and the
-- policies test the row rather than its columns, so nothing else changes.

NOTIFY pgrst, 'reload schema';
