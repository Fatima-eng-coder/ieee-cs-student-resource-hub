-- Sign-up asks for a semester (a number) instead of a free-text "class".
--
-- A NEW column rather than a renamed or retyped class_name, for three reasons that each rule the
-- other options out:
--
--   * ALTER COLUMN class_name TYPE smallint aborts the whole migration on the first stored value
--     that is not a clean number -- "BCS", "5th" -- and nobody can read those values from outside
--     a content-manager session to clean them first.
--   * This migration reaches the database before the new site is deployed. A rename would break
--     the site that is live in between: its sign-up writes class_name and the admin roster
--     selects it by name.
--   * A CHECK added NOT VALID is still enforced on every later UPDATE of an old row, and the role
--     functions (fix_chairperson_handover) update whole profile rows -- promoting a student whose
--     old class was "BCS" would start failing.
--
-- An additive nullable column has none of those problems, and its CHECK is valid from the start
-- because the column begins empty. class_name is left exactly as it is, so nothing anyone typed
-- before is lost, and the admin roster keeps showing it as an older field.

set local statement_timeout = '60s';

ALTER TABLE "public"."profiles"
    ADD COLUMN IF NOT EXISTS "semester" smallint;

-- 1 to 12, matching date_sheets_semester_check. 8 would be tighter and wrong: the university
-- address admits any three- or four-letter programme code, and students repeat and pause.
DO $$
BEGIN
    ALTER TABLE "public"."profiles"
        ADD CONSTRAINT "profiles_semester_check"
        CHECK ("semester" IS NULL OR "semester" BETWEEN 1 AND 12);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN "public"."profiles"."semester" IS
    'Current semester, 1-12, optional. Replaces the free-text class_name for new sign-ups; '
    'class_name is kept untouched for accounts created before this existed.';

-- Carry over only what is already unambiguous: a class_name that is exactly a number from 1 to
-- 12. Anything else ("BCS", "5th", "sem 5") stays where it is rather than being guessed at.
UPDATE "public"."profiles"
    SET "semester" = btrim("class_name")::smallint
    WHERE "semester" IS NULL
      AND btrim(coalesce("class_name", '')) ~ '^(1[0-2]|[1-9])$';

-- Inert in the same way the existing column list in 20260901000100 is (authenticated already
-- holds table-level UPDATE), and kept only so that list stays a complete record.
GRANT UPDATE ("semester") ON TABLE "public"."profiles" TO "authenticated";

-- So PostgREST knows the column the moment the migration lands, rather than on its next reload.
NOTIFY pgrst, 'reload schema';
