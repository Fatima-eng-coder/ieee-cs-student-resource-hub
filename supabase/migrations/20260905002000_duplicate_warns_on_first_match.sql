-- Warn on the first matching paper, not the fourth.
--
-- This function answers "does a paper for this sitting already exist" for a student who cannot
-- see pending rows, and it answered false until there were four of them. That threshold made
-- sense when the answer was used to REFUSE a write: three copies of a sitting is normal, since
-- a non-centralised subject sets one paper per section, and refusing the second would have been
-- wrong.
--
-- It is no longer used to refuse anything. Approving is now an admin decision taken with every
-- copy of the sitting listed in front of them, and submitting shows the student the existing
-- paper and lets them go ahead. All this value does now is decide whether somebody is told what
-- is already there -- and being told about the first copy is the entire point. At four, a
-- student uploading the second copy was shown nothing at all.

set local statement_timeout = '60s';

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
  select count(*) >= 1
  from matching_materials;
$$;

ALTER FUNCTION "public"."course_material_duplicate_exists"("p_course_id" "text", "p_session" "text", "p_year" integer, "p_material_type" "text", "p_exclude_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."course_material_duplicate_exists"("p_course_id" "text", "p_session" "text", "p_year" integer, "p_material_type" "text", "p_exclude_id" "uuid") IS
  'True when any paper already exists for this course, session, year and type. Used to TELL somebody what is there -- a student before they submit, who cannot see pending rows themselves -- never to refuse a write. Nothing is capped: several papers per sitting is normal where a subject sets one per section.';
