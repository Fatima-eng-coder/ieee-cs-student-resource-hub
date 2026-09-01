-- Let a student actually contribute event photos.
--
-- The reported symptom was an RLS error. There were two separate refusals behind it, and
-- both were reproduced against production from an anonymous browser session before writing
-- a line of this file:
--
--   1. public.event_image_submissions had a working INSERT policy and no INSERT grant. A
--      policy without a grant is inert -- the request never reaches the policy. Fixed
--      already by the grants in 20260901000100; re-verified here, the probe now gets as far
--      as the table's own CHECK constraint:
--
--        insert (image_urls: [], image_paths: [])  ->  23514 event_image_submissions_max_images_check
--        insert (status: 'approved')               ->  42501 row-level security  -- policy pins 'pending'
--
--   2. The upload itself is still refused. storage.objects carries no policy that lets a
--      student write to the event-images bucket:
--
--        storage.from('event-images').upload('probe/x.jpg', <1x1 jpeg>)
--          ->  403 "new row violates row-level security policy"
--
--      That is what this migration opens, and it is the half that the app cannot work
--      around: the table's CHECK requires a non-empty image_urls, so there is no valid row
--      to insert until a file exists somewhere.
--
-- Opened to `authenticated` only, not to anon. An anonymous write path here is an unmetered
-- upload endpoint for anyone holding the publishable key -- which is, by design, everyone.
-- Requiring a session also makes every contribution attributable, which is the thing that
-- lets it be credited, rate-limited, and cleaned up when an account is deleted.

set local statement_timeout = '120s';


-- ---------------------------------------------------------------------------------------
-- 1. Uploads: a signed-in student may write only inside their own folder
-- ---------------------------------------------------------------------------------------
--
-- submissions/<uid>/<file> -- the uid segment is compared against auth.uid(), so one student
-- cannot write into another's folder, and an admin browsing the bucket can see at a glance
-- who sent what. The existing content-manager policies on this bucket are untouched: these
-- are additional permissive policies, so nothing that works today stops working.

DROP POLICY IF EXISTS "Students can upload event photo submissions" ON "storage"."objects";
CREATE POLICY "Students can upload event photo submissions"
  ON "storage"."objects" FOR INSERT TO "authenticated"
  WITH CHECK (
    "bucket_id" = 'event-images'
    AND ("storage"."foldername"("name"))[1] = 'submissions'
    AND ("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text"
  );

-- A student may also read and remove what is still in their own folder. Removal is not a
-- convenience: the row insert can fail after the file has landed (a CHECK, the pending-limit
-- trigger, a dropped connection), and without this the client has no way to take back the
-- orphan it just created. Approval copies the file into the album's own path, so a photo the
-- team has published is out of reach of this policy by then.
DROP POLICY IF EXISTS "Students can read their own event photo uploads" ON "storage"."objects";
CREATE POLICY "Students can read their own event photo uploads"
  ON "storage"."objects" FOR SELECT TO "authenticated"
  USING (
    "bucket_id" = 'event-images'
    AND ("storage"."foldername"("name"))[1] = 'submissions'
    AND ("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text"
  );

DROP POLICY IF EXISTS "Students can remove their own event photo uploads" ON "storage"."objects";
CREATE POLICY "Students can remove their own event photo uploads"
  ON "storage"."objects" FOR DELETE TO "authenticated"
  USING (
    "bucket_id" = 'event-images'
    AND ("storage"."foldername"("name"))[1] = 'submissions'
    AND ("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text"
  );


-- ---------------------------------------------------------------------------------------
-- 2. The row: attributable, and only ever to the caller
-- ---------------------------------------------------------------------------------------
--
-- The baseline policy allowed an anonymous INSERT and checked only that status = 'pending'.
-- With uploads now requiring a session, an anonymous row could only ever point at image_urls
-- this project does not host -- which is to say, a spam vector with no upside. Replaced by a
-- policy that ties the row to its author.
--
-- submitted_by is checked here rather than stamped by a trigger because the column already
-- exists and is client-written; student_email continues to be stamped server-side by
-- private.stamp_student_email(), so the identity a re-link matches on is still not the
-- client's to choose.

DROP POLICY IF EXISTS "Public can submit event images" ON "public"."event_image_submissions";
DROP POLICY IF EXISTS "Students can submit event images" ON "public"."event_image_submissions";
CREATE POLICY "Students can submit event images"
  ON "public"."event_image_submissions" FOR INSERT TO "authenticated"
  WITH CHECK (
    "status" = 'pending'
    AND "submitted_by" = ("auth"."uid"())
  );

-- The grant is what actually let the request through; anon no longer has any use for it.
REVOKE INSERT ON TABLE "public"."event_image_submissions" FROM "anon";

-- So a student can see that their own contribution arrived. Content managers keep their own
-- broader SELECT policy from the baseline; permissive policies OR together.
DROP POLICY IF EXISTS "Students can read their own event image submissions" ON "public"."event_image_submissions";
CREATE POLICY "Students can read their own event image submissions"
  ON "public"."event_image_submissions" FOR SELECT TO "authenticated"
  USING ("submitted_by" = ("auth"."uid"()));


-- ---------------------------------------------------------------------------------------
-- 3. The same pending-submission ceiling the other three contribution tables have
-- ---------------------------------------------------------------------------------------
--
-- paper_requests, faculty_suggestions and course_resource_submissions all carry this
-- trigger; event_image_submissions was left out only because nothing could reach it. Now
-- that something can, it belongs in the same queue discipline -- five pending items per
-- student, counted across all four tables by private.my_pending_submission_count().

CREATE OR REPLACE TRIGGER "limit_pending_event_image_submissions"
    BEFORE INSERT ON "public"."event_image_submissions"
    FOR EACH ROW WHEN (("new"."status" = 'pending'::"text"))
    EXECUTE FUNCTION "private"."prevent_too_many_pending_submissions"();

-- The trigger above is only half of that discipline. my_pending_submission_count() sums four
-- tables and event_image_submissions is not one of them, so as written the new trigger would
-- throttle photo submissions by how many *other* things a student had pending while letting
-- the photos themselves grow without bound. Counted here too, and the queue is one queue.
CREATE OR REPLACE FUNCTION "private"."my_pending_submission_count"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (
      select count(*)
      from public.course_materials
      where created_by = (select auth.uid())
        and verification = 'pending'
    )
    +
    (
      select count(*)
      from public.paper_requests
      where submitted_by = (select auth.uid())
        and status = 'pending'
    )
    +
    (
      select count(*)
      from public.course_resource_submissions
      where submitted_by = (select auth.uid())
        and status = 'pending'
    )
    +
    (
      select count(*)
      from public.faculty_suggestions
      where submitted_by = (select auth.uid())
        and status = 'pending'
    )
    +
    (
      select count(*)
      from public.event_image_submissions
      where submitted_by = (select auth.uid())
        and status = 'pending'
    );
$$;

ALTER FUNCTION "private"."my_pending_submission_count"() OWNER TO "postgres";
