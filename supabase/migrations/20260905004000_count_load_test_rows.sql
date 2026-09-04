-- A temporary counter, so the real cleanup can be verified instead of assumed.
--
-- 20260905003000 keyed on student_email and deleted nothing. A BEFORE INSERT trigger,
-- form_responses_stamp_student_email, sets that column to null for an anonymous submitter and
-- fills it from the session otherwise -- so the marker the load test wrote was discarded before
-- the row landed, and the delete predicate matched no rows at all.
--
-- Its guard did not catch that because the guard was tautological: it asserted that no rows with
-- the marker remained, which was true from the start precisely because the marker never
-- persisted. "Nothing left to delete" and "nothing was ever there" are the same query.
--
-- form_responses is not readable by anon, so this exists only to answer "how many are there" as
-- a bare number, without exposing a single genuine response. It is dropped by the migration that
-- does the deletion.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION "public"."__loadtest_row_count"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::integer
  from public.form_responses
  where field_labels ? 'loadtest';
$$;

ALTER FUNCTION "public"."__loadtest_row_count"() OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."__loadtest_row_count"() TO "anon";
