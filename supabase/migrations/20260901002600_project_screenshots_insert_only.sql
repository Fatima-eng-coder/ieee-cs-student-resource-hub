-- Students may add project screenshots. They may not take them away again.
--
-- 20260901002100 gave the author INSERT and DELETE under event-images/projects/<uid>/, mirroring
-- the event-photo policies. For photo submissions that pairing is right: the row is reviewed and
-- either published into an album or discarded, so an author deleting their own pending upload
-- costs nothing.
--
-- A project is different. It stays the author's row after it is approved, and its screenshots
-- are what the public showcase renders. With DELETE in the author's hands, anyone whose project
-- was published could empty their folder and leave three broken images on a public page, with
-- the files unrecoverable. The showcase is the society's shopfront; that is not a control to
-- hand out.
--
-- So the author's DELETE goes. Content managers keep theirs through the bucket-wide policy, and
-- projectsService's own delete path runs as one.
--
-- The cost is an orphaned file when an upload lands and the row insert then fails -- a CHECK, the
-- pending-submission ceiling, a dropped connection. That is a few kilobytes nobody can see, and
-- it is the right side of this trade against a broken public page.

set local statement_timeout = '60s';

DROP POLICY IF EXISTS "Students can remove their own project screenshots" ON "storage"."objects";

COMMENT ON POLICY "Students can upload project screenshots" ON "storage"."objects" IS
  'Insert only, deliberately. An author whose project has been approved must not be able to delete the screenshots the public showcase is rendering; content managers remove them through the bucket-wide policy.';
