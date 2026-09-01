-- Take student_email off public.projects, and finish the re-link story for the new tables.
--
-- public.projects is world-readable for approved rows, and row-level security filters ROWS, not
-- COLUMNS. So `GET /rest/v1/projects?select=student_email` hands every approved submitter's
-- university address to anyone holding the publishable key -- which is every visitor.
--
-- This is the same trap 20260901000100 called out for course_materials, and the fix is the one
-- that migration already established: the address moves to private.contribution_claims, which
-- lives in a schema PostgREST does not expose, holds no grants, and has RLS on with no policy.
-- There is no ?select= that can name it.
--
-- The other three tables added in 20260901002000 keep their student_email column, and that is
-- correct rather than inconsistent: event_registrations, contact_messages and navigation_reports
-- grant anon INSERT only, so nobody without a content-manager session can read any column of
-- them at all. projects is the only one of the four that publishes rows.

set local statement_timeout = '120s';


-- ---------------------------------------------------------------------------------------
-- 1. Move the key out of reach
-- ---------------------------------------------------------------------------------------

-- Nothing to carry over in practice -- the table is empty -- but written as a migration rather
-- than assumed, because "it is empty" is only true the first time this runs.
INSERT INTO "private"."contribution_claims" ("table_name", "row_id", "student_email")
SELECT 'projects', "p"."id", "lower"("p"."student_email")
FROM "public"."projects" AS "p"
WHERE "p"."student_email" IS NOT NULL
ON CONFLICT ("table_name", "row_id") DO NOTHING;

DROP TRIGGER IF EXISTS "projects_stamp_student_email" ON "public"."projects";

ALTER TABLE "public"."projects" DROP COLUMN IF EXISTS "student_email";


-- ---------------------------------------------------------------------------------------
-- 2. Keep the claim in step with the row
-- ---------------------------------------------------------------------------------------
--
-- private.record_contribution_claim() reads new.created_by, and projects names that column
-- author_id, so it needs its own. Same behaviour otherwise, including the part that matters:
-- an author_id resolving to no profile leaves the stored claim alone rather than clearing it.
-- That is not an edge case, it is the whole scenario -- deleting a student's login nulls
-- author_id, and the claim is the only thing that can repair it when they sign up again.

CREATE OR REPLACE FUNCTION "private"."record_project_claim"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text;
begin
  select lower(p.email)
    into v_email
    from public.profiles p
   where p.id = new.author_id;

  if v_email is not null then
    insert into private.contribution_claims (table_name, row_id, student_email)
    values ('projects', new.id, v_email)
    on conflict (table_name, row_id) do update
      set student_email = excluded.student_email;
  end if;

  return new;
end;
$$;

ALTER FUNCTION "private"."record_project_claim"() OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "projects_record_claim"
    AFTER INSERT OR UPDATE OF "author_id" ON "public"."projects"
    FOR EACH ROW EXECUTE FUNCTION "private"."record_project_claim"();

-- Deleting the project deletes the stored address with it: the claim exists only to point at a
-- row, and outliving that row would be an address kept for no reason.
CREATE OR REPLACE TRIGGER "projects_forget_claim"
    AFTER DELETE ON "public"."projects"
    FOR EACH ROW EXECUTE FUNCTION "private"."forget_contribution_claim"();


-- ---------------------------------------------------------------------------------------
-- 3. Re-link the four tables added since that function was written
-- ---------------------------------------------------------------------------------------
--
-- relink_student_activity() is what makes "delete the account, sign up again" work. It was
-- written before event_registrations, contact_messages, navigation_reports and projects
-- existed, so a returning student got their papers and suggestions back and silently lost
-- their registrations, their messages and their project submissions.
--
-- projects joins through the claims table for the same reason course_materials does; the other
-- three match on their own student_email column.

CREATE OR REPLACE FUNCTION "public"."relink_student_activity"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_counts jsonb := '{}'::jsonb;
  v_n      integer;
begin
  if v_uid is null then
    raise exception 'relink_student_activity: no authenticated user'
      using errcode = '28000';
  end if;

  select lower(p.email) into v_email
  from public.profiles p
  where p.id = v_uid;

  if v_email is null then
    return jsonb_build_object('email', null, 'relinked', v_counts);
  end if;

  update public.course_materials t
  set created_by = v_uid
  from private.contribution_claims c
  where c.table_name = 'course_materials'
    and c.row_id = t.id
    and lower(c.student_email) = v_email
    and t.created_by is distinct from v_uid;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('course_materials', v_n);

  update public.projects t
  set author_id = v_uid
  from private.contribution_claims c
  where c.table_name = 'projects'
    and c.row_id = t.id
    and lower(c.student_email) = v_email
    and t.author_id is distinct from v_uid;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('projects', v_n);

  update public.paper_requests t
  set submitted_by = v_uid
  where lower(t.student_email) = v_email
    and t.submitted_by is distinct from v_uid;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('paper_requests', v_n);

  update public.faculty_suggestions t
  set submitted_by = v_uid
  where lower(t.student_email) = v_email
    and t.submitted_by is distinct from v_uid;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('faculty_suggestions', v_n);

  update public.course_resource_submissions t
  set submitted_by = v_uid
  where lower(t.student_email) = v_email
    and t.submitted_by is distinct from v_uid;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('course_resource_submissions', v_n);

  update public.event_image_submissions t
  set submitted_by = v_uid
  where lower(t.student_email) = v_email
    and t.submitted_by is distinct from v_uid;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('event_image_submissions', v_n);

  update public.event_registrations t
  set submitted_by = v_uid
  where lower(t.student_email) = v_email
    and t.submitted_by is distinct from v_uid;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('event_registrations', v_n);

  update public.contact_messages t
  set submitted_by = v_uid
  where lower(t.student_email) = v_email
    and t.submitted_by is distinct from v_uid;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('contact_messages', v_n);

  update public.navigation_reports t
  set submitted_by = v_uid
  where lower(t.student_email) = v_email
    and t.submitted_by is distinct from v_uid;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('navigation_reports', v_n);

  -- form_responses is deliberately absent, and stays absent: there is no UPDATE policy and no
  -- UPDATE grant on that table because a submitted answer is a record of what someone said.
  -- Reaching past that with a definer function would undo the rule.

  return jsonb_build_object('email', v_email, 'relinked', v_counts);
end;
$$;

ALTER FUNCTION "public"."relink_student_activity"() OWNER TO "postgres";


-- ---------------------------------------------------------------------------------------
-- 4. And the pending-submission ceiling
-- ---------------------------------------------------------------------------------------
--
-- A pending project is a queued submission like any other, so it counts against the same five.
-- The other three new tables are not queued work a committee reviews one at a time -- a
-- registration is not a submission waiting for approval -- so they stay out of this count.

CREATE OR REPLACE FUNCTION "private"."my_pending_submission_count"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (select count(*) from public.course_materials
      where created_by = (select auth.uid()) and verification = 'pending')
    + (select count(*) from public.paper_requests
        where submitted_by = (select auth.uid()) and status = 'pending')
    + (select count(*) from public.course_resource_submissions
        where submitted_by = (select auth.uid()) and status = 'pending')
    + (select count(*) from public.faculty_suggestions
        where submitted_by = (select auth.uid()) and status = 'pending')
    + (select count(*) from public.event_image_submissions
        where submitted_by = (select auth.uid()) and status = 'pending')
    + (select count(*) from public.projects
        where author_id = (select auth.uid()) and status = 'pending');
$$;

ALTER FUNCTION "private"."my_pending_submission_count"() OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "limit_pending_projects"
    BEFORE INSERT ON "public"."projects"
    FOR EACH ROW WHEN (("new"."status" = 'pending'::"text"))
    EXECUTE FUNCTION "private"."prevent_too_many_pending_submissions"();


COMMENT ON TABLE "public"."projects" IS
  'Student project showcase, moderated: only status = approved is public. The submitter''s address is NOT a column here -- the table publishes rows, and RLS filters rows rather than columns, so it lives in private.contribution_claims instead.';
