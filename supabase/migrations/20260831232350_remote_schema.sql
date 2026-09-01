


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "private"."can_manage_content"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in (
        'webmaster',
        'vice_chairperson',
        'chairperson',
        'general_secretary'
      )
  );
$$;


ALTER FUNCTION "private"."can_manage_content"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('editor', 'moderator', 'super_admin')
  );
$$;


ALTER FUNCTION "private"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_society_member"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in (
        'webmaster',
        'vice_chairperson',
        'chairperson',
        'general_secretary',
        'joint_secretary',
        'graphic_designer',
        'operations_manager',
        'treasurer'
      )
  );
$$;


ALTER FUNCTION "private"."is_society_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."my_pending_submission_count"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (
      select count(*)
      from public.course_materials
      where created_by = (select auth.uid())
        and verification = 'pending'
    )
    +
    (
      select count(*)
      from public.paper_requests
      where submitted_by = (select auth.uid())
        and status = 'pending'
    )
    +
    (
      select count(*)
      from public.course_resource_submissions
      where submitted_by = (select auth.uid())
        and status = 'pending'
    )
    +
    (
      select count(*)
      from public.faculty_suggestions
      where submitted_by = (select auth.uid())
        and status = 'pending'
    );
$$;


ALTER FUNCTION "private"."my_pending_submission_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."pending_course_material_count"("user_id" "uuid") RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::integer
  from public.course_materials
  where created_by = user_id
    and verification = 'pending';
$$;


ALTER FUNCTION "private"."pending_course_material_count"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."prevent_too_many_pending_submissions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (select auth.uid()) is not null
     and coalesce(new.status, 'pending') = 'pending'
     and (select private.my_pending_submission_count()) >= 5 then
    raise exception 'You already have 5 pending submissions. Please wait until the team reviews one before submitting more.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."prevent_too_many_pending_submissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."course_material_duplicate_exists"("p_course_id" "text", "p_session" "text", "p_year" integer, "p_material_type" "text", "p_exclude_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
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
  select count(*) >= case
    when lower(p_material_type) in ('quiz', 'assignment') then 4
    else 1
  end
  from matching_materials;
$$;


ALTER FUNCTION "public"."course_material_duplicate_exists"("p_course_id" "text", "p_session" "text", "p_year" integer, "p_material_type" "text", "p_exclude_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    'student'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_pending_course_material_count"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::integer
  from public.course_materials
  where created_by = (select auth.uid())
    and verification = 'pending';
$$;


ALTER FUNCTION "public"."my_pending_course_material_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_lab_manual_for_non_lab_course"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  course_lab_hours integer;
begin
  if new.resource_type = 'lab_manual' then
    select coalesce(lab_hours, 0)
    into course_lab_hours
    from public.courses
    where course_code = new.course_code;

    if not found then
      raise exception 'Selected course does not exist.'
        using errcode = '23514';
    end if;

    if course_lab_hours <= 0 then
      raise exception 'Lab manual submissions are only allowed for courses with a lab component.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_lab_manual_for_non_lab_course"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "category" "text" NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcements_category_check" CHECK (("category" = ANY (ARRAY['general'::"text", 'event'::"text", 'academic'::"text", 'navigation'::"text", 'projects'::"text"])))
);

ALTER TABLE ONLY "public"."announcements" REPLICA IDENTITY FULL;


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "text" NOT NULL,
    "course_name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "session" "text" NOT NULL,
    "year" integer NOT NULL,
    "material_type" "text" NOT NULL,
    "instructor" "text" DEFAULT 'Not specified'::"text" NOT NULL,
    "file_url" "text" DEFAULT ''::"text" NOT NULL,
    "file_path" "text",
    "uploaded_by" "text" DEFAULT 'Anonymous'::"text" NOT NULL,
    "uploaded_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "verification" "text" DEFAULT 'pending'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "downloads" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_materials_downloads_check" CHECK (("downloads" >= 0)),
    CONSTRAINT "course_materials_material_type_check" CHECK (("material_type" = ANY (ARRAY['Midterm'::"text", 'Final'::"text", 'Quiz'::"text", 'Assignment'::"text"]))),
    CONSTRAINT "course_materials_session_check" CHECK (("session" = ANY (ARRAY['Spring'::"text", 'Fall'::"text"]))),
    CONSTRAINT "course_materials_verification_check" CHECK (("verification" = ANY (ARRAY['pending'::"text", 'verified'::"text"]))),
    CONSTRAINT "course_materials_year_check" CHECK ((("year" >= 2000) AND ("year" <= 2100)))
);

ALTER TABLE ONLY "public"."course_materials" REPLICA IDENTITY FULL;


ALTER TABLE "public"."course_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_prerequisites" (
    "course_code" "text" NOT NULL,
    "prerequisite_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_prerequisites_check" CHECK (("course_code" <> "prerequisite_code"))
);


ALTER TABLE "public"."course_prerequisites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_resource_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_code" "text" NOT NULL,
    "course_name" "text",
    "resource_type" "text" NOT NULL,
    "suggested_title" "text",
    "suggested_value" "text",
    "file_url" "text",
    "file_path" "text",
    "notes" "text",
    "name" "text",
    "email" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "submitted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "course_resource_submissions_resource_type_check" CHECK (("resource_type" = ANY (ARRAY['cdf'::"text", 'lab_manual'::"text", 'useful_link'::"text", 'prerequisite'::"text", 'description'::"text", 'teacher_assignment'::"text", 'other'::"text"]))),
    CONSTRAINT "course_resource_submissions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."course_resource_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_teachers" (
    "course_code" "text" NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."course_teachers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_code" "text" NOT NULL,
    "course_name" "text" NOT NULL,
    "department" "text" DEFAULT 'Computer Science'::"text" NOT NULL,
    "credit_hours" integer DEFAULT 3 NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "cdf_url" "text",
    "cdf_path" "text",
    "lab_manual_url" "text",
    "lab_manual_path" "text",
    "outcomes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tips" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "useful_links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lab_hours" integer DEFAULT 0 NOT NULL,
    "theory_hours" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "courses_check" CHECK ((("lab_hours" >= 0) AND ("lab_hours" <= "credit_hours"))),
    CONSTRAINT "courses_credit_hours_check" CHECK ((("credit_hours" >= 0) AND ("credit_hours" <= 6))),
    CONSTRAINT "courses_credit_split_check" CHECK (("credit_hours" = ("theory_hours" + "lab_hours"))),
    CONSTRAINT "courses_lab_hours_check" CHECK (("lab_hours" >= 0)),
    CONSTRAINT "courses_theory_hours_check" CHECK (("theory_hours" >= 0))
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_image_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_name" "text" NOT NULL,
    "image_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "image_paths" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "submitted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_image_submissions_image_paths_array_check" CHECK (("jsonb_typeof"("image_paths") = 'array'::"text")),
    CONSTRAINT "event_image_submissions_image_urls_array_check" CHECK (("jsonb_typeof"("image_urls") = 'array'::"text")),
    CONSTRAINT "event_image_submissions_max_images_check" CHECK (((("jsonb_array_length"("image_urls") >= 1) AND ("jsonb_array_length"("image_urls") <= 3)) AND ("jsonb_array_length"("image_paths") = "jsonb_array_length"("image_urls")))),
    CONSTRAINT "event_image_submissions_status_check" CHECK (("status" = 'pending'::"text"))
);


ALTER TABLE "public"."event_image_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "long_description" "text" DEFAULT ''::"text" NOT NULL,
    "event_type" "text" NOT NULL,
    "date" "date" NOT NULL,
    "time" "text" NOT NULL,
    "venue" "text" NOT NULL,
    "cover_image_url" "text",
    "cover_image_path" "text",
    "registration_open" boolean DEFAULT false NOT NULL,
    "registration_url" "text",
    "capacity" integer DEFAULT 0 NOT NULL,
    "organizers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "featured" boolean DEFAULT false NOT NULL,
    "image_layout" "text" DEFAULT 'poster'::"text" NOT NULL,
    CONSTRAINT "events_capacity_check" CHECK (("capacity" >= 0)),
    CONSTRAINT "events_image_layout_check" CHECK (("image_layout" = ANY (ARRAY['poster'::"text", 'banner'::"text"]))),
    CONSTRAINT "events_organizers_check" CHECK (("jsonb_typeof"("organizers") = 'array'::"text"))
);

ALTER TABLE ONLY "public"."events" REPLICA IDENTITY FULL;


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faculty" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "designation" "text",
    "department" "text" DEFAULT 'Computer Science'::"text" NOT NULL,
    "email" "text",
    "office" "text",
    "photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verification" "text" DEFAULT 'verified'::"text" NOT NULL,
    "uploaded_by" "text" DEFAULT 'IEEE CS'::"text" NOT NULL,
    "uploaded_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    CONSTRAINT "faculty_verification_check" CHECK (("verification" = ANY (ARRAY['pending'::"text", 'verified'::"text"])))
);


ALTER TABLE "public"."faculty" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faculty_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "faculty_id" "uuid",
    "teacher_name" "text" NOT NULL,
    "email" "text",
    "department" "text",
    "designation" "text",
    "office" "text",
    "course_code" "text",
    "course_name" "text",
    "suggestion_type" "text" NOT NULL,
    "notes" "text",
    "requester_name" "text",
    "requester_email" "text",
    "submitted_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "faculty_suggestions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "faculty_suggestions_suggestion_type_check" CHECK (("suggestion_type" = ANY (ARRAY['new_teacher'::"text", 'email_update'::"text", 'office_update'::"text", 'profile_update'::"text", 'course_assignment'::"text"])))
);


ALTER TABLE "public"."faculty_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nav_links" (
    "id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "path" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."nav_links" REPLICA IDENTITY FULL;


ALTER TABLE "public"."nav_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."paper_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_code" "text" NOT NULL,
    "course_name" "text",
    "material_type" "text" NOT NULL,
    "session" "text" NOT NULL,
    "year" integer NOT NULL,
    "requester_name" "text",
    "requester_email" "text",
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "submitted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "paper_requests_material_type_check" CHECK (("material_type" = ANY (ARRAY['midterm'::"text", 'final'::"text", 'quiz'::"text", 'assignment'::"text"]))),
    CONSTRAINT "paper_requests_session_check" CHECK (("session" = ANY (ARRAY['Spring'::"text", 'Fall'::"text"]))),
    CONSTRAINT "paper_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'noted'::"text", 'fulfilled'::"text", 'rejected'::"text"]))),
    CONSTRAINT "paper_requests_year_check" CHECK ((("year" >= 2000) AND ("year" <= (EXTRACT(year FROM CURRENT_DATE))::integer)))
);


ALTER TABLE "public"."paper_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'student'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'webmaster'::"text", 'vice_chairperson'::"text", 'chairperson'::"text", 'general_secretary'::"text", 'joint_secretary'::"text", 'graphic_designer'::"text", 'operations_manager'::"text", 'treasurer'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_materials"
    ADD CONSTRAINT "course_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_prerequisites"
    ADD CONSTRAINT "course_prerequisites_pkey" PRIMARY KEY ("course_code", "prerequisite_code");



ALTER TABLE ONLY "public"."course_resource_submissions"
    ADD CONSTRAINT "course_resource_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_teachers"
    ADD CONSTRAINT "course_teachers_pkey" PRIMARY KEY ("course_code", "teacher_id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_course_code_key" UNIQUE ("course_code");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_image_submissions"
    ADD CONSTRAINT "event_image_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faculty"
    ADD CONSTRAINT "faculty_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faculty_suggestions"
    ADD CONSTRAINT "faculty_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nav_links"
    ADD CONSTRAINT "nav_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."paper_requests"
    ADD CONSTRAINT "paper_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "course_materials_duplicate_lookup_idx" ON "public"."course_materials" USING "btree" ("course_id", "session", "year", "material_type", "verification");



CREATE INDEX "course_materials_public_lookup_idx" ON "public"."course_materials" USING "btree" ("verification", "course_id", "material_type", "session", "year");



CREATE INDEX "course_resource_submissions_course_code_idx" ON "public"."course_resource_submissions" USING "btree" ("course_code");



CREATE INDEX "course_resource_submissions_created_at_idx" ON "public"."course_resource_submissions" USING "btree" ("created_at" DESC);



CREATE INDEX "course_resource_submissions_status_idx" ON "public"."course_resource_submissions" USING "btree" ("status");



CREATE UNIQUE INDEX "courses_code_unique_idx" ON "public"."courses" USING "btree" ("lower"("course_code"));



CREATE INDEX "event_image_submissions_created_at_idx" ON "public"."event_image_submissions" USING "btree" ("created_at" DESC);



CREATE INDEX "events_date_idx" ON "public"."events" USING "btree" ("date");



CREATE INDEX "events_featured_idx" ON "public"."events" USING "btree" ("featured") WHERE ("featured" = true);



CREATE INDEX "events_published_date_idx" ON "public"."events" USING "btree" ("is_published", "date");



CREATE INDEX "events_type_idx" ON "public"."events" USING "btree" ("event_type");



CREATE INDEX "faculty_suggestions_course_code_idx" ON "public"."faculty_suggestions" USING "btree" ("course_code");



CREATE INDEX "faculty_suggestions_created_at_idx" ON "public"."faculty_suggestions" USING "btree" ("created_at" DESC);



CREATE INDEX "faculty_suggestions_faculty_id_idx" ON "public"."faculty_suggestions" USING "btree" ("faculty_id");



CREATE INDEX "faculty_suggestions_status_idx" ON "public"."faculty_suggestions" USING "btree" ("status");



CREATE OR REPLACE TRIGGER "courses_set_updated_at" BEFORE UPDATE ON "public"."courses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "limit_pending_course_resource_submissions" BEFORE INSERT ON "public"."course_resource_submissions" FOR EACH ROW WHEN (("new"."status" = 'pending'::"text")) EXECUTE FUNCTION "private"."prevent_too_many_pending_submissions"();



CREATE OR REPLACE TRIGGER "limit_pending_faculty_suggestions" BEFORE INSERT ON "public"."faculty_suggestions" FOR EACH ROW WHEN (("new"."status" = 'pending'::"text")) EXECUTE FUNCTION "private"."prevent_too_many_pending_submissions"();



CREATE OR REPLACE TRIGGER "limit_pending_paper_requests" BEFORE INSERT ON "public"."paper_requests" FOR EACH ROW WHEN (("new"."status" = 'pending'::"text")) EXECUTE FUNCTION "private"."prevent_too_many_pending_submissions"();



CREATE OR REPLACE TRIGGER "prevent_lab_manual_for_non_lab_course_trigger" BEFORE INSERT OR UPDATE OF "course_code", "resource_type" ON "public"."course_resource_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_lab_manual_for_non_lab_course"();



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."course_materials"
    ADD CONSTRAINT "course_materials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."course_prerequisites"
    ADD CONSTRAINT "course_prerequisites_course_code_fkey" FOREIGN KEY ("course_code") REFERENCES "public"."courses"("course_code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_prerequisites"
    ADD CONSTRAINT "course_prerequisites_prerequisite_code_fkey" FOREIGN KEY ("prerequisite_code") REFERENCES "public"."courses"("course_code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."course_resource_submissions"
    ADD CONSTRAINT "course_resource_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."course_resource_submissions"
    ADD CONSTRAINT "course_resource_submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."course_teachers"
    ADD CONSTRAINT "course_teachers_course_code_fkey" FOREIGN KEY ("course_code") REFERENCES "public"."courses"("course_code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_teachers"
    ADD CONSTRAINT "course_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."faculty"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."event_image_submissions"
    ADD CONSTRAINT "event_image_submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."faculty_suggestions"
    ADD CONSTRAINT "faculty_suggestions_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculty"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."faculty_suggestions"
    ADD CONSTRAINT "faculty_suggestions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."faculty_suggestions"
    ADD CONSTRAINT "faculty_suggestions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."paper_requests"
    ADD CONSTRAINT "paper_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."paper_requests"
    ADD CONSTRAINT "paper_requests_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can create pending paper requests" ON "public"."paper_requests" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("status" = 'pending'::"text") AND ("reviewed_by" IS NULL) AND ("reviewed_at" IS NULL)));



CREATE POLICY "Anyone can read announcements" ON "public"."announcements" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read course prerequisites" ON "public"."course_prerequisites" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read course teachers" ON "public"."course_teachers" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read courses" ON "public"."courses" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read faculty" ON "public"."faculty" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read navbar links" ON "public"."nav_links" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read published events" ON "public"."events" FOR SELECT TO "authenticated", "anon" USING (("is_published" = true));



CREATE POLICY "Anyone can read verified course materials" ON "public"."course_materials" FOR SELECT TO "authenticated", "anon" USING (("verification" = 'verified'::"text"));



CREATE POLICY "Anyone can submit pending course resource submissions" ON "public"."course_resource_submissions" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("status" = 'pending'::"text") AND ("course_code" IS NOT NULL) AND ("resource_type" = ANY (ARRAY['cdf'::"text", 'lab_manual'::"text", 'useful_link'::"text", 'prerequisite'::"text", 'description'::"text", 'teacher_assignment'::"text", 'other'::"text"]))));



CREATE POLICY "Content managers can create announcements" ON "public"."announcements" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can delete announcements" ON "public"."announcements" FOR DELETE TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can delete course resource submissions" ON "public"."course_resource_submissions" FOR DELETE TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can delete event image submissions" ON "public"."event_image_submissions" FOR DELETE TO "authenticated" USING ("private"."can_manage_content"());



CREATE POLICY "Content managers can delete events" ON "public"."events" FOR DELETE TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can delete faculty suggestions" ON "public"."faculty_suggestions" FOR DELETE TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can delete paper requests" ON "public"."paper_requests" FOR DELETE TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can insert events" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can manage course materials" ON "public"."course_materials" TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can manage course prerequisites" ON "public"."course_prerequisites" TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can manage course teachers" ON "public"."course_teachers" TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can manage courses" ON "public"."courses" TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can manage faculty" ON "public"."faculty" TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can manage navbar links" ON "public"."nav_links" TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can manage profiles" ON "public"."profiles" TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can read all course materials" ON "public"."course_materials" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can read all events" ON "public"."events" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can read all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can read course resource submissions" ON "public"."course_resource_submissions" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can read event image submissions" ON "public"."event_image_submissions" FOR SELECT TO "authenticated" USING ("private"."can_manage_content"());



CREATE POLICY "Content managers can read faculty suggestions" ON "public"."faculty_suggestions" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can read paper requests" ON "public"."paper_requests" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can review faculty suggestions" ON "public"."faculty_suggestions" FOR UPDATE TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can update announcements" ON "public"."announcements" FOR UPDATE TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can update course resource submissions" ON "public"."course_resource_submissions" FOR UPDATE TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can update events" ON "public"."events" FOR UPDATE TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers can update paper requests" ON "public"."paper_requests" FOR UPDATE TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));



CREATE POLICY "Content managers manage faculty" ON "public"."faculty" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['webmaster'::"text", 'vice_chairperson'::"text", 'chairperson'::"text", 'general_secretary'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['webmaster'::"text", 'vice_chairperson'::"text", 'chairperson'::"text", 'general_secretary'::"text"]))))));



CREATE POLICY "Public can create pending faculty suggestions" ON "public"."faculty_suggestions" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("status" = 'pending'::"text") AND ("reviewed_by" IS NULL) AND ("reviewed_at" IS NULL)));



CREATE POLICY "Public can submit event images" ON "public"."event_image_submissions" FOR INSERT TO "authenticated", "anon" WITH CHECK (("status" = 'pending'::"text"));



CREATE POLICY "Public read verified faculty" ON "public"."faculty" FOR SELECT USING ((("verification" = 'verified'::"text") OR ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "Students can read own pending course materials" ON "public"."course_materials" FOR SELECT TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("verification" = 'pending'::"text")));



CREATE POLICY "Students can submit pending course materials" ON "public"."course_materials" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("verification" = 'pending'::"text") AND (( SELECT "private"."pending_course_material_count"(( SELECT "auth"."uid"() AS "uid")) AS "pending_course_material_count") < 5)));



CREATE POLICY "Users can create own student profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) AND ("role" = 'student'::"text")));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_prerequisites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_resource_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_teachers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_image_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."faculty" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."faculty_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nav_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."paper_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."announcements";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."course_materials";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."nav_links";



GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "private"."can_manage_content"() TO "authenticated";



GRANT ALL ON FUNCTION "private"."is_society_member"() TO "authenticated";



GRANT ALL ON FUNCTION "private"."my_pending_submission_count"() TO "authenticated";



GRANT ALL ON FUNCTION "private"."pending_course_material_count"("user_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."course_material_duplicate_exists"("p_course_id" "text", "p_session" "text", "p_year" integer, "p_material_type" "text", "p_exclude_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_new_user_profile"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."my_pending_course_material_count"() TO "authenticated";


















GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."announcements" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_materials" TO "anon";
GRANT ALL ON TABLE "public"."course_materials" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_materials" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_prerequisites" TO "anon";
GRANT ALL ON TABLE "public"."course_prerequisites" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_prerequisites" TO "service_role";



GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_resource_submissions" TO "anon";
GRANT ALL ON TABLE "public"."course_resource_submissions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_resource_submissions" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_teachers" TO "anon";
GRANT ALL ON TABLE "public"."course_teachers" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_teachers" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."courses" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_image_submissions" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_image_submissions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_image_submissions" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."events" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."faculty" TO "anon";
GRANT ALL ON TABLE "public"."faculty" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."faculty" TO "service_role";



GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."faculty_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."faculty_suggestions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."faculty_suggestions" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."nav_links" TO "anon";
GRANT ALL ON TABLE "public"."nav_links" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."nav_links" TO "service_role";



GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."paper_requests" TO "anon";
GRANT ALL ON TABLE "public"."paper_requests" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."paper_requests" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";



































