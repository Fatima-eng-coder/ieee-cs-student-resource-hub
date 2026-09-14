-- Let a form actually collect a file.
--
-- The "File upload" and "Image upload" question types have been offered in the builder since the
-- forms module shipped, and neither uploads anything:
--
--   file   ->  FormFieldInput stored `f.name` and threw the File away. The button then showed
--              the filename, so it LOOKED attached. Every CV, certificate and scanned document
--              ever collected through this site is a filename and nothing else.
--   image  ->  stored a base64 data URL inside form_responses.answers. That one at least keeps
--              the picture, but it puts 100-400 KB of text in a jsonb cell per photo, and the
--              CSV export then writes that blob into a single spreadsheet cell -- past Excel's
--              32,767-character limit, so the column is truncated or the file refuses to open.
--
-- The blocker was never the client: no bucket on this project accepts a write from a signed-out
-- visitor, and forms are deliberately open to anon (a student does not need an account to
-- respond). This policy is the missing half.
--
-- Scoped to one prefix, exactly like the escape hatch course-documents already has for course
-- resource suggestions ("Public can upload course resource suggestion files", name ~~
-- 'suggestions/%'). Without the prefix this would be an unmetered upload endpoint for anyone
-- holding the publishable key -- which is what event-images was before 20260901000700 and
-- 20260901000800 closed it, and is not a mistake worth making twice.
--
-- event-images rather than a new bucket: buckets are created through the dashboard, its MIME
-- allowlist (png/jpeg/webp/pdf) is already the right set for form attachments, and its 5 MB
-- object cap is already enforced. course-documents was the other candidate and is wrong -- its
-- allowed_mime_types is ARRAY['application/pdf'], so it answers 415 for a JPEG before RLS runs.

set local statement_timeout = '60s';

-- INSERT only, and no UPDATE or DELETE for the uploader. A respondent who could overwrite an
-- object could swap the file under a submitted answer after it was reviewed; one who could
-- delete could empty the prefix. Orphans left by an abandoned form are swept by a content
-- manager through the bucket-wide delete policy instead.
DROP POLICY IF EXISTS "Public can upload form attachments" ON "storage"."objects";
CREATE POLICY "Public can upload form attachments" ON "storage"."objects"
    FOR INSERT TO "authenticated", "anon"
    WITH CHECK (
        "bucket_id" = 'event-images'::"text"
        -- foldername()[1] rather than a LIKE on the whole name: policies on this project key on
        -- the first path segment, and a LIKE 'form-uploads/%' would also admit a name such as
        -- 'form-uploads/../events/cover.png' if the storage layer ever stopped normalising it.
        AND ("storage"."foldername"("name"))[1] = 'form-uploads'::"text"
    );

-- Reading is already covered bucket-wide by "Public can read event images" / "Anyone can view
-- event images", and event-images is a public bucket, so the stored public URL resolves without
-- a signed request. Stated here rather than added, so the next person does not add a third
-- overlapping SELECT policy looking for one.

COMMENT ON POLICY "Public can upload form attachments" ON "storage"."objects" IS
    'Form respondents, signed in or not, may create objects under form-uploads/ in event-images. '
    'INSERT only: no overwrite, no delete. Written by formsService.uploadAttachment().';
