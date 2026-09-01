-- The probe files are out, so the policy that let them be deleted goes with them.
--
--   list  submissions/00000000-0000-0000-0000-000000000000  ->  2 objects
--   remove them                                             ->  2 removed
--   list  again                                             ->  empty
--   upload submissions/x.jpg while signed out               ->  403 row-level security
--
-- The last line is the one that mattered: with "Public can upload event image submissions"
-- gone (20260901000800), an anonymous visitor can no longer write into this bucket at all.
-- Uploading an event photo now requires a session, and lands under submissions/<uid>/.

DROP POLICY IF EXISTS "Temporary: clear probe uploads" ON "storage"."objects";
