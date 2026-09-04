-- The three storage buckets that no migration ever created, and the fifteen policies that go
-- with them.
--
-- 20260901001200 created `member-photos` properly. `event-images`, `course-documents` and
-- `course-material-files` were made by clicking in the Supabase dashboard and were never
-- written down, so they exist in the project this was built against and nowhere else. The same
-- is true of fifteen policies on storage.objects: the migrations reference these buckets in
-- passing -- 20260901000700, 000800 and 002100 all add prefix-scoped student policies to
-- `event-images` -- but nothing declares the buckets or the content-manager policies that make
-- them usable.
--
-- What that costs: provision a fresh project, run `db push`, and the site comes up looking
-- perfectly healthy, because every read path is a public URL and every list is empty anyway.
-- Then every upload fails with "Bucket not found" and every stored file 404s -- event artwork,
-- banners, gallery photos, project screenshots, course CDFs, lab manuals, date sheets and past
-- papers, all at once, with nothing in the UI explaining why.
--
-- Every value below is transcribed from the live project (`supabase db dump --schema storage`,
-- plus the bucket rows from a data-only dump), not invented. This is a faithful record of what
-- is already there, which is why it is safe to apply to that project: the bucket insert is
-- ON CONFLICT DO NOTHING and each policy is dropped by name before it is recreated, so
-- re-running it against the source of truth changes nothing at all.
--
-- One thing deliberately reproduced rather than corrected: `event-images` has no
-- file_size_limit. Every other bucket caps uploads (50 MB, 20 MB, 2 MB). Tightening it here
-- would make new projects quietly disagree with the live one, which is the exact class of
-- problem this migration exists to end. It should be fixed in both places, in its own change.

set local statement_timeout = '120s';

SET client_min_messages = warning;


-- ---------------------------------------------------------------------------------------
-- 1. The buckets
-- ---------------------------------------------------------------------------------------
--
-- All three are public: everything in them is linked straight from public pages, so a private
-- bucket would mean minting a signed URL per file per page load to protect nothing.
--
-- The MIME allowlists are load-bearing and are enforced BEFORE row-level security, so they are
-- the reason `course-documents` refuses a JPEG with 415 no matter who is uploading. Getting one
-- wrong here does not fail loudly; it fails as a confusing 415 in somebody else's browser.

INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES
    -- Documents only. A 50 MB ceiling because scanned course handbooks are genuinely large.
    ('course-documents', 'course-documents', true, 52428800,
     ARRAY['application/pdf']),

    -- Past papers: PDFs, plus images because a phone photograph of a paper is a legitimate
    -- submission and students send them constantly.
    ('course-material-files', 'course-material-files', true, 20971520,
     ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),

    -- Event artwork, banners, gallery photos, project screenshots and student photo
    -- submissions all share this bucket, separated by path prefix rather than by bucket.
    ('event-images', 'event-images', true, NULL,
     ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
ON CONFLICT ("id") DO NOTHING;


-- ---------------------------------------------------------------------------------------
-- 2. The policies
-- ---------------------------------------------------------------------------------------
--
-- Transcribed verbatim from the live project. A public bucket still needs a SELECT policy: the
-- file itself is served either way, but without one the object ROWS are invisible to the API,
-- which breaks listing and deletion while leaving the site looking fine -- the same trap
-- 20260901001200 called out for member-photos.

DROP POLICY IF EXISTS "Anyone can view course documents" ON "storage"."objects";
CREATE POLICY "Anyone can view course documents" ON "storage"."objects" FOR SELECT TO "authenticated", "anon" USING (("bucket_id" = 'course-documents'::"text"));

DROP POLICY IF EXISTS "Anyone can view course material files" ON "storage"."objects";
CREATE POLICY "Anyone can view course material files" ON "storage"."objects" FOR SELECT TO "authenticated", "anon" USING (("bucket_id" = 'course-material-files'::"text"));

DROP POLICY IF EXISTS "Anyone can view event images" ON "storage"."objects";
CREATE POLICY "Anyone can view event images" ON "storage"."objects" FOR SELECT TO "authenticated", "anon" USING (("bucket_id" = 'event-images'::"text"));

DROP POLICY IF EXISTS "Content managers can delete course documents" ON "storage"."objects";
CREATE POLICY "Content managers can delete course documents" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'course-documents'::"text") AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")));

DROP POLICY IF EXISTS "Content managers can delete course material files" ON "storage"."objects";
CREATE POLICY "Content managers can delete course material files" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'course-material-files'::"text") AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")));

DROP POLICY IF EXISTS "Content managers can delete event images" ON "storage"."objects";
CREATE POLICY "Content managers can delete event images" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'event-images'::"text") AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")));

DROP POLICY IF EXISTS "Content managers can update course documents" ON "storage"."objects";
CREATE POLICY "Content managers can update course documents" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'course-documents'::"text") AND ( SELECT "private"."can_manage_content"() AS "can_manage_content"))) WITH CHECK ((("bucket_id" = 'course-documents'::"text") AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")));

DROP POLICY IF EXISTS "Content managers can update course material files" ON "storage"."objects";
CREATE POLICY "Content managers can update course material files" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'course-material-files'::"text") AND ( SELECT "private"."can_manage_content"() AS "can_manage_content"))) WITH CHECK ((("bucket_id" = 'course-material-files'::"text") AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")));

DROP POLICY IF EXISTS "Content managers can update event images" ON "storage"."objects";
CREATE POLICY "Content managers can update event images" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'event-images'::"text") AND ( SELECT "private"."can_manage_content"() AS "can_manage_content"))) WITH CHECK ((("bucket_id" = 'event-images'::"text") AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")));

DROP POLICY IF EXISTS "Content managers can upload course documents" ON "storage"."objects";
CREATE POLICY "Content managers can upload course documents" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'course-documents'::"text") AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")));

DROP POLICY IF EXISTS "Content managers can upload event images" ON "storage"."objects";
CREATE POLICY "Content managers can upload event images" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'event-images'::"text") AND ( SELECT "private"."can_manage_content"() AS "can_manage_content")));

DROP POLICY IF EXISTS "Public can read event images" ON "storage"."objects";
CREATE POLICY "Public can read event images" ON "storage"."objects" FOR SELECT TO "authenticated", "anon" USING (("bucket_id" = 'event-images'::"text"));

DROP POLICY IF EXISTS "Public can upload course resource suggestion files" ON "storage"."objects";
CREATE POLICY "Public can upload course resource suggestion files" ON "storage"."objects" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("bucket_id" = 'course-documents'::"text") AND ("name" ~~ 'suggestions/%'::"text")));

DROP POLICY IF EXISTS "Students can upload course material files" ON "storage"."objects";
CREATE POLICY "Students can upload course material files" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("bucket_id" = 'course-material-files'::"text"));

DROP POLICY IF EXISTS "Users can delete their own failed course material uploads" ON "storage"."objects";
CREATE POLICY "Users can delete their own failed course material uploads" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'course-material-files'::"text") AND (("storage"."foldername"("name"))[3] = (( SELECT "auth"."uid"() AS "uid"))::"text")));
