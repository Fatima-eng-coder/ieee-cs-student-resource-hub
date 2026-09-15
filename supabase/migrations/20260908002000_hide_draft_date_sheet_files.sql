-- An unpublished date sheet's PDF was public. Only its row was hidden.
--
-- date_sheets has "Anyone can read published date sheets" USING (is_published), so a draft row is
-- invisible to students -- and the admin drawer says so in as many words: "Only published sheets
-- are visible to students." The file behind it was never covered by that. course-documents is a
-- public bucket and its SELECT policy was `bucket_id = 'course-documents'` and nothing else, so
-- the object stayed world-readable the whole time the row was hidden.
--
-- Worse than world-readable: world-ENUMERABLE. That bucket-wide SELECT also authorises the list
-- API, so an anonymous caller can POST /storage/v1/object/list/course-documents with a prefix and
-- read back the directory. Verified against the live project -- listing the bucket root as anon
-- returns its folders. Nobody has to guess a URL; they can ask for the index.
--
-- For a university that is the wrong thing to get wrong. An unreleased exam schedule is exactly
-- the document people go looking for early, and "the row is hidden" reads like a control when it
-- is not one.
--
-- The fix narrows the SELECT policy for one prefix instead of making the bucket private. Course
-- description forms and lab manuals under cdf/ and lab-manuals/ are meant to be public and are
-- left exactly as they were; only date-sheets/ now has to prove a published row points at it.

set local statement_timeout = '60s';

-- file_path is matched on every object this policy tests, so it needs to be indexed or listing
-- the prefix becomes a sequential scan of date_sheets per object.
CREATE INDEX IF NOT EXISTS "date_sheets_file_path_idx"
    ON "public"."date_sheets" ("file_path");

DROP POLICY IF EXISTS "Anyone can view course documents" ON "storage"."objects";
CREATE POLICY "Anyone can view course documents" ON "storage"."objects"
    FOR SELECT TO "authenticated", "anon"
    USING (
        "bucket_id" = 'course-documents'::"text"
        AND (
            -- Everything outside date-sheets/ keeps the old, deliberately open rule.
            ("storage"."foldername"("name"))[1] <> 'date-sheets'::"text"
            OR EXISTS (
                SELECT 1
                FROM "public"."date_sheets" "d"
                WHERE "d"."file_path" = "storage"."objects"."name"
            )
        )
    );

-- Why the EXISTS has no `AND d.is_published`, which looks like the obvious thing to write:
--
-- the subquery runs as the CALLER, so date_sheets' own row-level security already applies to it.
-- An anonymous reader can only see published rows, so EXISTS is false for a draft and the file is
-- hidden. A content manager's policy covers every row, so EXISTS is true for a draft and they can
-- still open their own unpublished PDF in the admin drawer -- which is the behaviour the drawer
-- has always implied and never had.
--
-- Spelling the flag out here would be redundant for the student and WRONG for the admin: it would
-- hide a draft from the person who just uploaded it, and the preview in the editor would break
-- with no explanation.

COMMENT ON POLICY "Anyone can view course documents" ON "storage"."objects" IS
    'Public read for course-documents, except date-sheets/ -- those require a date_sheets row the '
    'caller is allowed to see, so an unpublished exam schedule is neither downloadable nor '
    'listable by students. Relies on date_sheets RLS applying to the subquery.';
