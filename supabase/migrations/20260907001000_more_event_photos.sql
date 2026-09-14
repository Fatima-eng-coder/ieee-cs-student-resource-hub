-- Raise the cap on photos in one event-photo submission from 3 to 10.
--
-- Three was low enough to be the wrong unit. Somebody who was at an event has a camera roll, not
-- a shortlist, and the only way to send twelve photos was to send four separate submissions --
-- which cost the sender four trips through the form and cost the reviewer four queue entries
-- that all belong to the same event and have to be judged as one set.
--
-- The ceiling stays low enough to matter. It is what stops a single submission from being an
-- arbitrary-length upload, and the number is repeated in the client (MAX_EVENT_PHOTOS in
-- src/services/eventImageSubmissionsService.ts) so the picker stops before the database has to.
-- Keep the two in step.

set local statement_timeout = '60s';

ALTER TABLE "public"."event_image_submissions"
    DROP CONSTRAINT IF EXISTS "event_image_submissions_max_images_check";

-- The paired-length half is the part that carries the real invariant: image_urls and image_paths
-- are one list written twice, a public URL and the bucket key behind it, and a row where they
-- disagree has a photo that either cannot be shown or cannot be deleted. Restated rather than
-- split into its own constraint so the name the client already maps to a friendly message
-- (friendlyPublicError matches on 'max_images') keeps covering both failures.
ALTER TABLE "public"."event_image_submissions"
    ADD CONSTRAINT "event_image_submissions_max_images_check"
    CHECK (
        "jsonb_array_length"("image_urls") >= 1
        AND "jsonb_array_length"("image_urls") <= 10
        AND "jsonb_array_length"("image_paths") = "jsonb_array_length"("image_urls")
    );

COMMENT ON CONSTRAINT "event_image_submissions_max_images_check"
    ON "public"."event_image_submissions" IS
    'Between 1 and 10 photos per submission, with image_paths paired 1:1 to image_urls. '
    'Mirrored by MAX_EVENT_PHOTOS in src/services/eventImageSubmissionsService.ts.';
