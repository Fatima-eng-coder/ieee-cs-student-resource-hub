-- The counter from 20260905004000 has done its job: it confirmed 500 marked rows existed, and
-- confirmed 0 remained after 20260905005000 deleted them. That second call is the verification
-- the first cleanup attempt lacked -- an answer from outside the migration that claimed success.
-- Nothing should keep a function whose only purpose was to be asked twice.

set local statement_timeout = '60s';

DROP FUNCTION IF EXISTS "public"."__loadtest_row_count"();
