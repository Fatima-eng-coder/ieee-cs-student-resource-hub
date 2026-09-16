-- The shape of each gallery photo, so an album can be laid out as rows that fit together.
--
-- An album page used to be a grid of identical tiles, every photo cropped to the same wide box,
-- which cut the heads off portrait shots and gave a 40-photo album the look of a spreadsheet. The
-- layout that replaces it sizes each tile by its shape, and needs to know that shape before the
-- picture has downloaded -- otherwise every row jumps as the images arrive.
--
-- The admin picks the shape when uploading, or leaves it to be read from the picture. NULL is
-- "not recorded yet": every photo uploaded before this migration. The page measures those itself
-- and the admin portal fills the column in the next time the album is opened for editing.

set local statement_timeout = '60s';

ALTER TABLE "public"."gallery_photos"
    ADD COLUMN IF NOT EXISTS "orientation" "text";

DO $$
BEGIN
    ALTER TABLE "public"."gallery_photos"
        ADD CONSTRAINT "gallery_photos_orientation_check"
        CHECK ("orientation" IS NULL OR "orientation" IN ('landscape', 'portrait'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN "public"."gallery_photos"."orientation" IS
    'landscape or portrait: the tile shape the album page gives this photo. NULL means not recorded yet; the page reads it from the picture.';

-- Table-level grants (20260901000400) already cover a new column for both roles, and the
-- existing policies test the row, not its columns, so nothing else changes.

NOTIFY pgrst, 'reload schema';
