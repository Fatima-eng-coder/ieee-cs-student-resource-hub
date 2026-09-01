-- Evaluate the five row-level security policies that still call a function per row once per
-- statement instead.
--
-- Postgres inlines a bare `auth.uid()` or `private.can_manage_content()` in a policy as a
-- correlated expression and runs it for every candidate row. Wrapped as `(SELECT …)` the
-- planner hoists it into an InitPlan and runs it once, because both functions are STABLE and
-- take no arguments -- the result cannot differ between rows of the same statement. The
-- semantics are identical; only the number of evaluations changes.
--
-- can_manage_content() is the one that matters: it is SECURITY DEFINER and queries
-- public.profiles, so per-row evaluation turns one admin listing into one profile lookup per
-- row returned. That is invisible on the handful of rows in this database today and is exactly
-- the kind of thing that stops being invisible when a society's worth of students arrives.
--
-- Every other policy in this schema already uses the subquery form. These five are the last:
--
--   public.event_image_submissions   3 policies  (two from the baseline, one from 20260901000700)
--   public.faculty                   1 policy    read on a public page, 75 rows today
--
-- Each is recreated with its predicate otherwise unchanged -- same tables, same roles, same
-- conditions. Nothing gains or loses access here.

set local statement_timeout = '60s';


DROP POLICY IF EXISTS "Content managers can delete event image submissions" ON "public"."event_image_submissions";
CREATE POLICY "Content managers can delete event image submissions"
    ON "public"."event_image_submissions" FOR DELETE TO "authenticated"
    USING ((SELECT "private"."can_manage_content"()));

DROP POLICY IF EXISTS "Content managers can read event image submissions" ON "public"."event_image_submissions";
CREATE POLICY "Content managers can read event image submissions"
    ON "public"."event_image_submissions" FOR SELECT TO "authenticated"
    USING ((SELECT "private"."can_manage_content"()));

DROP POLICY IF EXISTS "Students can read their own event image submissions" ON "public"."event_image_submissions";
CREATE POLICY "Students can read their own event image submissions"
    ON "public"."event_image_submissions" FOR SELECT TO "authenticated"
    USING ("submitted_by" = (SELECT "auth"."uid"()));

DROP POLICY IF EXISTS "Students can submit event images" ON "public"."event_image_submissions";
CREATE POLICY "Students can submit event images"
    ON "public"."event_image_submissions" FOR INSERT TO "authenticated"
    WITH CHECK ("status" = 'pending' AND "submitted_by" = (SELECT "auth"."uid"()));


-- Unchanged in meaning: a visitor sees verified faculty, and anyone signed in sees all of them
-- including the unverified rows the directory is still checking.
DROP POLICY IF EXISTS "Public read verified faculty" ON "public"."faculty";
CREATE POLICY "Public read verified faculty"
    ON "public"."faculty" FOR SELECT
    USING ("verification" = 'verified' OR (SELECT "auth"."uid"()) IS NOT NULL);
