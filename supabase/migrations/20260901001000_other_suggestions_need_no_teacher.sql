-- An 'other' request need not name a teacher.
--
-- 20260901000500 added the type and required it to carry a one-line subject, but left
-- teacher_name NOT NULL from the baseline. Between them those two say: describe your request
-- in one line, and also name a member of faculty even when your request is not about one
-- ("two teachers listed for the same lab section", "the department filter is missing a
-- programme"). The form would have had to invent a value to satisfy the column, which is how
-- a NOT NULL turns into a column full of placeholder text.
--
-- The requirement is kept everywhere it is real: the CHECK below asks for a name on every
-- type except 'other', which is exactly the rule the old NOT NULL was trying to express.

set local statement_timeout = '60s';

ALTER TABLE "public"."faculty_suggestions" ALTER COLUMN "teacher_name" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "pg_constraint"
    WHERE "conname" = 'faculty_suggestions_teacher_name_required'
      AND "conrelid" = 'public.faculty_suggestions'::"regclass"
  ) THEN
    -- Every stored row satisfies this already: they all predate 'other' and all carry a name,
    -- because until this statement the column could not be null.
    ALTER TABLE "public"."faculty_suggestions"
      ADD CONSTRAINT "faculty_suggestions_teacher_name_required"
      CHECK (
        "suggestion_type" = 'other'
        OR ("teacher_name" IS NOT NULL AND "btrim"("teacher_name") <> '')
      );
  END IF;
END
$$;

COMMENT ON COLUMN "public"."faculty_suggestions"."teacher_name" IS
  'The faculty member the request is about. Required for every type except ''other'', where the one-line subject carries the request instead -- see faculty_suggestions_teacher_name_required.';
