-- Give event-images the upload ceiling every other bucket already has.
--
-- 20260904001000 recorded this bucket faithfully, including the fact that it had no
-- file_size_limit at all, and said so rather than quietly correcting it: a migration whose job
-- is to make new projects match the live one must not be the place where the two start to
-- disagree. This is that correction, applied to both.
--
-- Where the number comes from: it is not chosen here, it is the one the application has been
-- enforcing all along. bannersService, galleryService, projectsService and
-- eventImageSubmissionsService each cap uploads at 5 MB before sending them. The bucket simply
-- stops being the one part of the path that trusts the client.
--
-- The exception, now closed in the same change: eventsService.assertEventImage checked the MIME
-- type and nothing else, so an event cover had no ceiling in the browser either. That path had
-- no limit anywhere -- client or server -- and a single mis-sized upload could take a
-- meaningful bite out of the project's storage quota.
--
-- UPDATE rather than INSERT ... ON CONFLICT DO UPDATE, so this is exactly one statement about
-- exactly one column. On a fresh project the bucket is created by the previous migration and
-- corrected here a moment later; on the live project this is the only thing that changes.

set local statement_timeout = '60s';

UPDATE "storage"."buckets"
   SET "file_size_limit" = 5242880  -- 5 MB, matching the app's own MAX_BYTES
 WHERE "id" = 'event-images'
   AND "file_size_limit" IS DISTINCT FROM 5242880;
