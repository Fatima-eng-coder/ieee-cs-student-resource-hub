-- Clear the demonstration content so the next person starts from a real, empty site.
--
-- Three different things are being removed and it is worth separating them, because only the
-- first is "seed data" in the strict sense:
--
--   1. Placeholder content seeded from the repo by earlier migrations in this series -- three
--      gallery albums of stock photography, twelve FAQs, eighteen quick links (several pointing
--      at example.edu). None of it describes this society.
--   2. Rows created while testing the new features: one event, one announcement and two forms
--      with keyboard-mash titles.
--   3. Content the team entered by hand -- five announcements and six uploaded past papers.
--      Removed on an explicit decision, so the site launches with nothing already on it.
--
-- Deliberately KEPT: the 123 courses and 75 faculty (the department directory, and the largest
-- real dataset here), the navbar and footer links, the FA26 hierarchy, the developer links, and
-- the two events added on 30 August -- Logic Building and Chess Championship.
--
-- Order is load-bearing. events.form_id and announcements.form_id are ON DELETE SET NULL, so
-- deleting a form first would null the reference on a row still carrying
-- form_source = 'internal', and events_form_config_check would reject that update -- taking the
-- delete down with it. The referring rows go first.
--
-- Storage is NOT swept here, and cannot be: storage.objects refuses a direct DELETE from SQL.
-- Seven files are left behind, six of them past papers a real student uploaded. That is the
-- deliberate side to err on -- the rows are gone from the site either way, and the bytes remain
-- recoverable from the dashboard until somebody decides otherwise.

set local statement_timeout = '120s';


-- 1. Uploaded past papers. Fires course_materials_forget_claim, which clears the matching
--    private.contribution_claims rows, so no student address is left pointing at nothing.
DELETE FROM "public"."course_materials";


-- 2. Every announcement: the five written by the team and the one test row.
--    Before the forms, because one of them attaches to a form being deleted below.
DELETE FROM "public"."announcements";


-- 3. The test event only. Named explicitly rather than filtered by date, so a mistake here
--    cannot reach the two events that are meant to survive.
DELETE FROM "public"."events"
WHERE "id" = '2b826990-333e-4dc1-a543-10672605ae51';


-- 4. The two test forms. Cascades to form_pages, form_fields and form_responses.
DELETE FROM "public"."forms"
WHERE "id" IN (
  'f5538189-e213-4760-8e71-ea351f964fae',
  'bca7a84d-b10d-4396-82a0-f1cf74384c4d'
);


-- 5. The seeded gallery. Photos first: gallery_photos cascades from its album, but deleting it
--    explicitly keeps this readable as the reverse of the seed that created it.
DELETE FROM "public"."gallery_photos";
DELETE FROM "public"."gallery_albums";


-- 6. The seeded FAQ list and quick links.
DELETE FROM "public"."faqs";
DELETE FROM "public"."quick_links";


-- A guard rather than a comment: if any of the above reached further than intended, this fails
-- the migration and rolls the whole thing back rather than leaving a half-emptied database.
--
-- Skipped entirely on a database that never held the content this file removes. This chain is
-- meant to build the project from nothing -- the baseline is a full schema pull -- and on a
-- fresh instance every count below is legitimately zero. A guard written only for the database
-- it happened to run against would have made that setup impossible, which is a strange way for
-- a clean-up step to behave.
DO $$
DECLARE
  v_events integer;
  v_courses integer;
  v_faculty integer;
  v_nav integer;
  v_footer integer;
  v_members integer;
BEGIN
  SELECT count(*) INTO v_courses FROM public.courses;

  -- No course directory means no populated database to protect.
  IF v_courses = 0 THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_events  FROM public.events;
  SELECT count(*) INTO v_faculty FROM public.faculty;
  SELECT count(*) INTO v_nav     FROM public.nav_links;
  SELECT count(*) INTO v_footer  FROM public.footer_links;
  SELECT count(*) INTO v_members FROM public.hierarchy_members;

  -- `<= 2` rather than `= 2`: the two surviving events are named by the DELETE above, and a
  -- database that never had the third is not evidence of anything going wrong.
  IF v_events > 2 OR v_courses < 100 OR v_faculty < 50
     OR v_nav < 1 OR v_footer < 1 OR v_members < 1 THEN
    RAISE EXCEPTION
      'Clear-down guard tripped: events=%, courses=%, faculty=%, nav_links=%, footer_links=%, hierarchy_members=%',
      v_events, v_courses, v_faculty, v_nav, v_footer, v_members;
  END IF;
END
$$;
