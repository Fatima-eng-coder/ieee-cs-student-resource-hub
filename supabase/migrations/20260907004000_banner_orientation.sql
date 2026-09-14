-- Portrait banners, and a note about where a banner's picture can come from.
--
-- site_banners has carried one implicit shape since it shipped: BannerCarousel renders every
-- banner into the same wide strip, so a portrait poster -- which is what a society is actually
-- handed for a workshop or a sponsor -- was either letterboxed into a landscape frame or cropped
-- through the middle by object-cover. There was no way to say "this one is tall".
--
-- Two values, not a free-form aspect ratio. The layout has exactly two shapes it can lay out
-- sensibly, and a number would invite a 3:7 banner that nothing on the page can place.

set local statement_timeout = '60s';

ALTER TABLE "public"."site_banners"
    ADD COLUMN IF NOT EXISTS "orientation" "text" DEFAULT 'landscape' NOT NULL;

DO $$
BEGIN
    ALTER TABLE "public"."site_banners"
        ADD CONSTRAINT "site_banners_orientation_check"
        CHECK ("orientation" = ANY (ARRAY['landscape'::"text", 'portrait'::"text"]));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN "public"."site_banners"."orientation" IS
    'How the carousel frames this banner: landscape (a wide strip) or portrait (a tall poster). '
    'Defaults to landscape, which is what every existing banner was implicitly assumed to be.';

-- Nothing is needed for "pick an existing gallery photo as this banner's image". image_url and
-- image_path are already plain columns and a gallery photo is already an object in the same
-- bucket, so reusing one is a matter of writing the URL that is already there -- no new column,
-- no copy of the file. Worth stating because the obvious next move is to add a
-- gallery_photo_id foreign key, and that would be a mistake: deleting the photo from the album
-- would then either cascade the banner away or leave it pointing at nothing, when what an admin
-- means by "use this picture" is a copy of the reference, not a lifetime dependency.
