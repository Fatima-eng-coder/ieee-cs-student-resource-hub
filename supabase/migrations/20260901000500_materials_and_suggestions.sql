-- Two corrections to rules that were tighter than the department actually operates.
--
-- Both widen an existing constraint rather than adding one. Widening is safe on live data by
-- definition: no stored row can violate a rule that now permits more than it did before. That
-- is why these can drop and recreate a CHECK without the usual additive-only caution.

set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. More than one midterm or final per course, per term
-- ---------------------------------------------------------------------------
--
-- Not every course is centralised. A subject taught across several sections sets a separate
-- paper per section, so "one midterm per course per term" rejects the second one as a
-- duplicate. The old rule allowed 4 quizzes and assignments but only 1 midterm and 1 final:
--
--     count(*) >= case when material_type in ('quiz','assignment') then 4 else 1 end
--
-- A cap is still worth keeping — it is what stops the same paper being uploaded repeatedly —
-- so the limit rises to match quizzes rather than disappearing. Four covers a course running
-- several sections while still catching an obvious re-upload.
--
-- src/services/papersService.ts mirrors these numbers for the client-side warning. The two
-- must be changed together; the database is the one that actually enforces it.

CREATE OR REPLACE FUNCTION "public"."course_material_duplicate_exists"(
  "p_course_id" "text",
  "p_session" "text",
  "p_year" integer,
  "p_material_type" "text",
  "p_exclude_id" "uuid" DEFAULT NULL::"uuid"
) RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with matching_materials as (
    select id
    from public.course_materials
    where course_id = p_course_id
      and year = p_year
      and lower(session) = lower(p_session)
      and lower(material_type) = lower(p_material_type)
      and verification in ('pending', 'verified')
      and (p_exclude_id is null or id <> p_exclude_id)
  )
  select count(*) >= 4
  from matching_materials;
$$;

COMMENT ON FUNCTION "public"."course_material_duplicate_exists"("text", "text", integer, "text", "uuid") IS
  'Guards against the same paper being uploaded repeatedly. Four per course/term/type, because a non-centralised subject sets one paper per section.';

-- ---------------------------------------------------------------------------
-- 2. Faculty suggestions: a request that names no course, and a free-form "other"
-- ---------------------------------------------------------------------------
--
-- A student who cannot find a lecturer in the list should be able to ask for them to be added
-- without also naming a course they teach — the course is the part a student is least likely
-- to be sure about. That request needs its own type so the admin dashboard can filter for it.
--
-- 'other' additionally requires a one-line subject, because a free-form request with no
-- summary is unreviewable in a queue.

ALTER TABLE "public"."faculty_suggestions"
  ADD COLUMN IF NOT EXISTS "subject" "text";

COMMENT ON COLUMN "public"."faculty_suggestions"."subject" IS
  'One-line summary. Required when suggestion_type = ''other'', ignored otherwise.';

DO $$
BEGIN
  -- Widening only: every existing value stays valid, so no live row can be orphaned.
  ALTER TABLE "public"."faculty_suggestions"
    DROP CONSTRAINT IF EXISTS "faculty_suggestions_suggestion_type_check";

  ALTER TABLE "public"."faculty_suggestions"
    ADD CONSTRAINT "faculty_suggestions_suggestion_type_check"
    CHECK ("suggestion_type" = ANY (ARRAY[
      'new_teacher'::"text",
      'faculty_addition'::"text",
      'email_update'::"text",
      'office_update'::"text",
      'profile_update'::"text",
      'course_assignment'::"text",
      'other'::"text"
    ]));
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "pg_constraint"
    WHERE "conname" = 'faculty_suggestions_other_needs_subject'
      AND "conrelid" = 'public.faculty_suggestions'::"regclass"
  ) THEN
    -- Only constrains rows whose type is 'other', which no existing row can be: the value did
    -- not exist until the statement above. Nothing stored can fail this.
    ALTER TABLE "public"."faculty_suggestions"
      ADD CONSTRAINT "faculty_suggestions_other_needs_subject"
      CHECK (
        "suggestion_type" <> 'other'
        OR ("subject" IS NOT NULL AND "btrim"("subject") <> '')
      );
  END IF;
END
$$;

-- A faculty-addition request is precisely the case where no course is named, so the admin
-- queue can filter on it without scanning notes.
CREATE INDEX IF NOT EXISTS "faculty_suggestions_type_status_idx"
  ON "public"."faculty_suggestions" USING "btree" ("suggestion_type", "status", "created_at" DESC);
