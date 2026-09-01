-- Let a student attach screenshots to the project they are submitting.
--
-- public.projects pins its INSERT policy to `status = 'pending' AND author_id = auth.uid()`,
-- so students submit their own rows directly rather than handing them to an admin. The row
-- carries screenshots and image_paths, and a CHECK requires those two arrays to be the same
-- length -- so the files have to exist, under a path the student was allowed to write, before
-- there is a valid row to insert at all.
--
-- Nothing allowed that. Probed against production from a signed-out session, which stands in
-- for any caller that fails private.can_manage_content():
--
--     event-images/projects/<file>          ->  403 new row violates row-level security policy
--
-- The bucket's content-manager policies are bucket-wide, and 20260901000700's student policies
-- are scoped to submissions/<uid>/. Neither covers a student writing under projects/.
--
-- Same shape as the event-photo policies, and for the same reasons: the uid segment is compared
-- against auth.uid() so one student cannot write into another's folder; reading is open because
-- an approved project is published on a public page; and deleting is scoped to the student's own
-- folder so a submission that fails after its files land can be taken back rather than leaving
-- an orphan nobody can reach.
--
-- Not opened to anon. The publishable key is held by every visitor, and an anonymous write path
-- here is an unmetered upload endpoint attached to rows anon cannot even create.

set local statement_timeout = '60s';

DROP POLICY IF EXISTS "Students can upload project screenshots" ON "storage"."objects";
CREATE POLICY "Students can upload project screenshots"
  ON "storage"."objects" FOR INSERT TO "authenticated"
  WITH CHECK (
    "bucket_id" = 'event-images'
    AND ("storage"."foldername"("name"))[1] = 'projects'
    AND ("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text"
  );

DROP POLICY IF EXISTS "Students can remove their own project screenshots" ON "storage"."objects";
CREATE POLICY "Students can remove their own project screenshots"
  ON "storage"."objects" FOR DELETE TO "authenticated"
  USING (
    "bucket_id" = 'event-images'
    AND ("storage"."foldername"("name"))[1] = 'projects'
    AND ("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text"
  );

-- An approved project is published to signed-out visitors, so its screenshots have to be
-- readable by them. Stated for this prefix specifically rather than relying on the bucket-wide
-- read policy, so narrowing that one later cannot silently blank the showcase.
DROP POLICY IF EXISTS "Anyone can read project screenshots" ON "storage"."objects";
CREATE POLICY "Anyone can read project screenshots"
  ON "storage"."objects" FOR SELECT TO "authenticated", "anon"
  USING (
    "bucket_id" = 'event-images'
    AND ("storage"."foldername"("name"))[1] = 'projects'
  );

COMMENT ON POLICY "Students can upload project screenshots" ON "storage"."objects" IS
  'Project submissions are written by the student, so the screenshots must be too. Scoped to projects/<uid>/ so one student cannot write into another''s folder.';
