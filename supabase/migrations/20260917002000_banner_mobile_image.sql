-- A second picture for a banner, shown on phones.
--
-- A banner's artwork is laid out for a wide screen. On a phone the same file is either shrunk
-- until its text is unreadable or cropped through the middle, and the fix an admin actually
-- reaches for is a second version of the artwork cut for a tall screen. That is what these hold.
--
-- Optional, with the desktop picture as the fallback: a banner with no phone picture behaves
-- exactly as every banner did before this, which is also what every existing row keeps doing.

set local statement_timeout = '60s';

ALTER TABLE "public"."site_banners"
    ADD COLUMN IF NOT EXISTS "mobile_image_url" "text",
    ADD COLUMN IF NOT EXISTS "mobile_image_path" "text";

DO $$
BEGIN
    -- A phone picture needs a desktop picture beside it. image_url stays the one image every
    -- surface can rely on; a row whose only artwork is the phone version would show nothing on a
    -- laptop and nothing in the admin table's preview.
    ALTER TABLE "public"."site_banners"
        ADD CONSTRAINT "site_banners_mobile_image_check"
        CHECK ("mobile_image_url" IS NULL OR "image_url" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    -- A path means nothing without the url it belongs to: it would be a file nothing displays.
    ALTER TABLE "public"."site_banners"
        ADD CONSTRAINT "site_banners_mobile_path_check"
        CHECK ("mobile_image_path" IS NULL OR "mobile_image_url" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN "public"."site_banners"."mobile_image_url" IS
    'Optional artwork for screens narrower than 40rem (Tailwind sm). NULL means phones show image_url.';

-- orientation is left in place. It is no longer offered in the editor -- with a separate phone
-- picture the question it answered no longer needs asking -- and the editor now fills it in from
-- the desktop picture's own dimensions, so the value stays true rather than going stale.
