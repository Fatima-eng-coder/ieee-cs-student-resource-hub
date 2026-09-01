-- A bucket for hierarchy member photographs.
--
-- public.hierarchy_members already has photo_url and photo_path, but there was nowhere for
-- the bytes to go. Probed against production from a signed-out browser, listing every name
-- the app might plausibly have used:
--
--   GET /storage/v1/object/public/event-images/<missing>          ->  404 NoSuchKey
--   GET /storage/v1/object/public/course-documents/<missing>      ->  404 NoSuchKey
--   GET /storage/v1/object/public/course-material-files/<missing> ->  404 NoSuchKey
--   GET /storage/v1/object/public/member-photos/<missing>         ->  404 NoSuchBucket
--   ... and the same for avatars, photos, people, team-photos, profile-photos, hierarchy,
--       hierarchy-photos, faculty-photos, gallery, images, media, uploads, assets, public
--
-- So exactly three buckets exist, all of them holding a different kind of content. A member
-- portrait is not an event image: it has a different retention story (it outlives the term
-- it was uploaded for, because previous councils stay published), a much smaller size
-- envelope, and a different set of people who may replace it. Filing it under a bucket named
-- for something else would also put it in the path of any future cleanup pass written for
-- that bucket's own contents.
--
-- Nothing here is destructive and every statement is safe to re-run.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_min_messages = warning;


-- Public, because these photographs are published on the About page, the hierarchy page and
-- the homepage, all of which are read by signed-out visitors. A private bucket would mean a
-- signed URL per portrait per page load, with an expiry to get wrong, protecting nothing
-- that is not already on a public page.
--
-- The limits are the app's own contract restated where it can be enforced: AvatarCropper
-- publishes a 512px JPEG, which lands around 40 KB, so 2 MB is generous by a wide margin and
-- still small enough that a mis-wired upload cannot fill the project's storage quota.
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES (
    'member-photos',
    'member-photos',
    true,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT ("id") DO NOTHING;


-- Reading is open to everyone, matching the bucket being public: without this policy the
-- object rows are invisible to the API even though the file itself is served, which breaks
-- listing and removal while leaving the site looking fine.
DROP POLICY IF EXISTS "Anyone can read member photos" ON "storage"."objects";
CREATE POLICY "Anyone can read member photos"
    ON "storage"."objects" FOR SELECT TO "authenticated", "anon"
    USING ("bucket_id" = 'member-photos');

-- Writing is the same authority that owns the roster rows themselves, so a photo can never
-- be attached by someone who could not have added the person. Deliberately not opened to
-- `anon`: the publishable key is held by every visitor, and an anonymous write path here is
-- an unmetered upload endpoint.
DROP POLICY IF EXISTS "Content managers can upload member photos" ON "storage"."objects";
CREATE POLICY "Content managers can upload member photos"
    ON "storage"."objects" FOR INSERT TO "authenticated"
    WITH CHECK (
        "bucket_id" = 'member-photos'
        AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")
    );

DROP POLICY IF EXISTS "Content managers can replace member photos" ON "storage"."objects";
CREATE POLICY "Content managers can replace member photos"
    ON "storage"."objects" FOR UPDATE TO "authenticated"
    USING (
        "bucket_id" = 'member-photos'
        AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")
    )
    WITH CHECK (
        "bucket_id" = 'member-photos'
        AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")
    );

-- Removal matters as much as upload: replacing a portrait leaves the old object behind, and
-- without a DELETE policy the previous file is unreachable forever — the client that wrote
-- it cannot take it back, and storage.objects refuses a direct SQL delete.
DROP POLICY IF EXISTS "Content managers can remove member photos" ON "storage"."objects";
CREATE POLICY "Content managers can remove member photos"
    ON "storage"."objects" FOR DELETE TO "authenticated"
    USING (
        "bucket_id" = 'member-photos'
        AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")
    );
