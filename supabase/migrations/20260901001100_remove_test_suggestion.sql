-- Removes one row I created by accident while testing the reworked suggest-a-teacher form.
--
-- Driving the form from the browser to check the mode switches, I submitted it while a
-- teacher picked in an earlier step was still selected. That wrote a real profile_update
-- request for Dr. Assad Abbas into the live review queue, where a content manager would have
-- found it with nothing in it and no idea who sent it. anon holds no DELETE on this table --
-- correctly -- so it could not be taken back the way it was made.
--
-- The predicate is deliberately narrow: unattributed (no submitted_by, no requester), still
-- pending, carrying no email, office or notes -- which is what makes it empty and therefore
-- certainly mine rather than a student's. A real request from a student always carries at
-- least one of those, because the form refuses to submit without one.

set local statement_timeout = '60s';

DELETE FROM "public"."faculty_suggestions"
WHERE "suggestion_type" = 'profile_update'
  AND "status" = 'pending'
  AND "teacher_name" = 'Dr. Assad Abbas'
  AND "submitted_by" IS NULL
  AND "requester_name" IS NULL
  AND "requester_email" IS NULL
  AND COALESCE("btrim"("email"), '') = ''
  AND COALESCE("btrim"("office"), '') = ''
  AND COALESCE("btrim"("notes"), '') = ''
  AND "course_code" IS NULL
  AND "created_at" > '2026-09-01T00:00:00Z';
