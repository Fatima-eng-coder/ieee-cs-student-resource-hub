-- Correcting the record from 20260901000700, and closing what it found.
--
-- That migration's comment says an upload to the event-images bucket was refused for a
-- signed-out visitor. That probe was wrong: it wrote to `probe/…`, and the bucket's rule
-- keys on the FIRST path segment. Re-probed against production across several prefixes:
--
--     probe3/x.jpg              ->  403 row-level security
--     submissionsX/x.jpg        ->  403 row-level security
--     events/x.jpg              ->  403 row-level security
--     submissions/x.jpg         ->  ALLOWED        <- signed out
--     submissions/deep/er/x.jpg ->  ALLOWED        <- signed out
--
-- and then read the schema rather than guessing at it. The permission was already there:
--
--     CREATE POLICY "Public can upload event image submissions" ON storage.objects
--       FOR INSERT TO authenticated, anon
--       WITH CHECK (bucket_id = 'event-images'
--                   AND (storage.foldername(name))[1] = 'submissions');
--
-- So storage was never the blocker. The only thing standing between a student and a photo
-- contribution was the missing INSERT grant on public.event_image_submissions, and
-- 20260901000100 had already fixed that. 20260901000700's storage policy is real but
-- redundant -- strictly narrower than the policy above, which is why it changed nothing.
--
-- What the re-probe did find is a hole worth closing. Anyone holding the publishable key --
-- which is every visitor, by design -- can write files into this bucket without signing in,
-- and since 20260901000700 those files can no longer become a row in
-- event_image_submissions. Uploading with no way to submit is not a feature; it is unmetered
-- storage for strangers. The narrower policy from 700 stays and this one goes, so an upload
-- now requires a session and lands in a folder named after the uploader.

set local statement_timeout = '60s';

DROP POLICY IF EXISTS "Public can upload event image submissions" ON "storage"."objects";

-- The three 1x1 JPEGs the probes above wrote have to come back out, and anon holds no DELETE
-- on this bucket, so the browser that made them cannot take them back. SQL is no help either:
-- storage.objects refuses a direct DELETE ("Direct deletion from storage tables is not
-- allowed. Use the Storage API instead.", 42501) -- which is how the first draft of this file
-- failed, taking the DROP above down with it in the same transaction.
--
-- So the removal has to go through the Storage API, and that needs a policy. This one is
-- scoped to the single literal folder the probes used. It is a uuid of all zeros: no account
-- has that id, auth.uid() can never equal it, and so no real student's submission can ever
-- live behind this policy. It is dropped again in the next migration, once the files are out.
DROP POLICY IF EXISTS "Temporary: clear probe uploads" ON "storage"."objects";
CREATE POLICY "Temporary: clear probe uploads"
  ON "storage"."objects" FOR DELETE TO "authenticated", "anon"
  USING (
    "bucket_id" = 'event-images'
    AND "name" LIKE 'submissions/00000000-0000-0000-0000-000000000000/%'
  );
