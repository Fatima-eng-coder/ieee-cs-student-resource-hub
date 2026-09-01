-- Student profile metadata + account deletion with activity re-linking.
--
-- Every statement here is idempotent and additive: the live database holds real
-- courses, faculty, announcements and student submissions, so nothing is dropped,
-- retyped or deleted and the file may be applied more than once.


-- ---------------------------------------------------------------------------
-- 1. Profile metadata columns
-- ---------------------------------------------------------------------------
-- All nullable: the existing admin and student rows predate these fields and must
-- stay valid. There is deliberately NO CHECK on profiles.email — the live table
-- already holds admin addresses outside the university domain, so a CHECK would be
-- rejected the moment it is added, and it would permanently block the faculty and
-- alumni profiles that are planned. The university-email rule is a signup-time rule
-- (src/utils/validation.ts), not a storage rule.

ALTER TABLE "public"."profiles"
    ADD COLUMN IF NOT EXISTS "secondary_email" "text",
    ADD COLUMN IF NOT EXISTS "whatsapp" "text",
    ADD COLUMN IF NOT EXISTS "class_name" "text",
    ADD COLUMN IF NOT EXISTS "section" "text",
    ADD COLUMN IF NOT EXISTS "degree" "text",
    ADD COLUMN IF NOT EXISTS "avatar_url" "text",
    ADD COLUMN IF NOT EXISTS "avatar_path" "text",
    ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL;


-- avatar_path is stored next to avatar_url because storageCleanupService deletes the
-- object by path; a row that kept only the public URL would orphan its file forever.
COMMENT ON COLUMN "public"."profiles"."avatar_path" IS 'Storage object path for avatar_url. Required by storageCleanupService to delete the object when the avatar is replaced or the account is removed.';


-- ---------------------------------------------------------------------------
-- 2. Canonical WhatsApp number
-- ---------------------------------------------------------------------------
-- The form accepts 0317…, 92317…, +92 317 788 0059 and similar, so the number is
-- normalised to one E.164 spelling before it is written; without a single canonical
-- form two rows for the same phone would never compare equal. Safe to add as a live
-- CHECK because the column is new and therefore has no existing rows to violate it.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_catalog"."pg_constraint"
        WHERE "conrelid" = '"public"."profiles"'::"regclass"
          AND "conname" = 'profiles_whatsapp_check'
    ) THEN
        ALTER TABLE "public"."profiles"
            ADD CONSTRAINT "profiles_whatsapp_check"
            CHECK (("whatsapp" IS NULL) OR ("whatsapp" ~ '^\+923[0-9]{9}$'));
    END IF;
END
$$;


-- ---------------------------------------------------------------------------
-- 3. updated_at trigger
-- ---------------------------------------------------------------------------
-- public.set_updated_at() already exists in the baseline (it drives
-- courses_set_updated_at); a second copy of the same one-line function would only be
-- another thing to keep in sync.

CREATE OR REPLACE TRIGGER "profiles_set_updated_at"
    BEFORE UPDATE ON "public"."profiles"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


-- ---------------------------------------------------------------------------
-- 4. Activity ownership keyed on email
-- ---------------------------------------------------------------------------
-- An admin can delete a student's login. When that student signs up again with the
-- same university address Supabase issues a NEW user id, so every uuid that pointed
-- at the old login is dead. The email is the only identifier that survives the
-- round trip, so each activity row is keyed on the contributor's address alongside
-- the uuid and the uuid is repaired on the next sign-in.
--
-- The key is stored two different ways, because the tables have two different
-- exposures:
--
--   * The four submission tables below have NO public SELECT policy and no SELECT
--     grant to anon, so a student_email column on them is only ever visible to a
--     content manager. A column is the simplest place for it.
--
--   * course_materials is the one table in the set that anon can read: it carries
--     "Anyone can read verified course materials" (baseline :876) AND
--     GRANT SELECT ... TO anon (baseline :1299). RLS filters rows, never columns,
--     so a student_email column there would answer
--         GET /rest/v1/course_materials?select=student_email
--     with every contributor's university address — defeating the baseline's
--     deliberate design, where public attribution is the free-text uploaded_by that
--     defaults to 'Anonymous'. Its key therefore lives out of reach in
--     private.contribution_claims (section 4.2).

ALTER TABLE "public"."paper_requests"               ADD COLUMN IF NOT EXISTS "student_email" "text";
ALTER TABLE "public"."faculty_suggestions"          ADD COLUMN IF NOT EXISTS "student_email" "text";
ALTER TABLE "public"."course_resource_submissions"  ADD COLUMN IF NOT EXISTS "student_email" "text";
ALTER TABLE "public"."event_image_submissions"      ADD COLUMN IF NOT EXISTS "student_email" "text";


-- ---------------------------------------------------------------------------
-- 4.2 Re-link key for course_materials, out of the API's reach
-- ---------------------------------------------------------------------------
-- The schema is `private`, not `public`, because that is a stronger guarantee than a
-- public table with no grants: PostgREST only exposes the schemas it is configured
-- with (public, graphql_public), so a row here has no REST URL at all — there is no
-- ?select= that can name it, whatever a future grant does by accident. The baseline
-- already uses `private` for exactly this purpose (can_manage_content, is_admin).
--
-- Belt and braces on top of that: no grants are issued, and RLS is enabled with no
-- policy, so the table denies everything to every role except its postgres owner and
-- the SECURITY DEFINER functions below that run as him.

CREATE TABLE IF NOT EXISTS "private"."contribution_claims" (
    "table_name" "text" NOT NULL,
    "row_id" "uuid" NOT NULL,
    "student_email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contribution_claims_pkey" PRIMARY KEY ("table_name", "row_id")
);

ALTER TABLE "private"."contribution_claims" OWNER TO "postgres";

ALTER TABLE "private"."contribution_claims" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "private"."contribution_claims" IS 'Maps an activity row to the university address that may reclaim it after the owning login is deleted and recreated. Lives in private/ungranted because course_materials is world-readable and a column there would publish every contributor address.';

REVOKE ALL ON TABLE "private"."contribution_claims" FROM PUBLIC;
REVOKE ALL ON TABLE "private"."contribution_claims" FROM "anon";
REVOKE ALL ON TABLE "private"."contribution_claims" FROM "authenticated";


-- ---------------------------------------------------------------------------
-- 4.3 Backfill
-- ---------------------------------------------------------------------------
-- Backfill from the profile that owns the existing uuid. Rows whose contributor was
-- anonymous, or whose profile is already gone, simply keep a NULL student_email —
-- there is nothing to recover for them and failing the migration over it would block
-- every later change. Addresses are stored lower-cased so that two spellings of the
-- same university address can never split one student's history in two.
--
-- This runs BEFORE the stamping triggers in 4.5 are created, so the triggers cannot
-- interfere with it on a first application; on a re-application the WHERE clauses and
-- ON CONFLICT make every statement a no-op.

UPDATE "public"."paper_requests" AS "t"
SET "student_email" = "lower"("p"."email")
FROM "public"."profiles" AS "p"
WHERE "p"."id" = "t"."submitted_by"
  AND "t"."student_email" IS NULL;

UPDATE "public"."faculty_suggestions" AS "t"
SET "student_email" = "lower"("p"."email")
FROM "public"."profiles" AS "p"
WHERE "p"."id" = "t"."submitted_by"
  AND "t"."student_email" IS NULL;

UPDATE "public"."course_resource_submissions" AS "t"
SET "student_email" = "lower"("p"."email")
FROM "public"."profiles" AS "p"
WHERE "p"."id" = "t"."submitted_by"
  AND "t"."student_email" IS NULL;

UPDATE "public"."event_image_submissions" AS "t"
SET "student_email" = "lower"("p"."email")
FROM "public"."profiles" AS "p"
WHERE "p"."id" = "t"."submitted_by"
  AND "t"."student_email" IS NULL;


-- course_materials is keyed on created_by, not uploaded_by: uploaded_by is the
-- free-text display name ('Anonymous' by default), created_by is the uuid.
-- DO NOTHING rather than DO UPDATE so a re-run never overwrites a claim that the
-- triggers below have since maintained.

INSERT INTO "private"."contribution_claims" ("table_name", "row_id", "student_email")
SELECT 'course_materials', "t"."id", "lower"("p"."email")
FROM "public"."course_materials" AS "t"
JOIN "public"."profiles" AS "p" ON "p"."id" = "t"."created_by"
ON CONFLICT ("table_name", "row_id") DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4.4 Indexes
-- ---------------------------------------------------------------------------
-- Indexed on lower(student_email) rather than the bare column: every lookup is the
-- case-insensitive comparison relink_student_activity() performs, and a plain btree
-- index would be ignored by it.

CREATE INDEX IF NOT EXISTS "paper_requests_student_email_idx"
    ON "public"."paper_requests" USING "btree" ("lower"("student_email"));

CREATE INDEX IF NOT EXISTS "faculty_suggestions_student_email_idx"
    ON "public"."faculty_suggestions" USING "btree" ("lower"("student_email"));

CREATE INDEX IF NOT EXISTS "course_resource_submissions_student_email_idx"
    ON "public"."course_resource_submissions" USING "btree" ("lower"("student_email"));

CREATE INDEX IF NOT EXISTS "event_image_submissions_student_email_idx"
    ON "public"."event_image_submissions" USING "btree" ("lower"("student_email"));

-- table_name leads the claim index because every lookup names one table.
CREATE INDEX IF NOT EXISTS "contribution_claims_email_idx"
    ON "private"."contribution_claims" USING "btree" ("table_name", "lower"("student_email"));


-- ---------------------------------------------------------------------------
-- 4.5 student_email is stamped by the server, never by the client
-- ---------------------------------------------------------------------------
-- anon holds INSERT on all four of these tables, and their INSERT policies check
-- only status/reviewed_by — they cannot check a column that identifies the caller,
-- because an anonymous caller has no identity to compare against. If the client
-- could write student_email, anyone holding the (public) anon key could file five
-- pending rows under a victim's address; the next time that victim signed in,
-- relink_student_activity() would adopt all five, private.my_pending_submission_count()
-- would read 5, and the baseline's limit_pending_* triggers would refuse every real
-- submission that student ever made again — with no way for them to delete the
-- planted rows, since students hold no DELETE policy on these tables.
--
-- So the value is derived here from auth.uid() and whatever the client sent is
-- thrown away. An anonymous submitter gets NULL, which is correct: they have no
-- account for a future re-link to repair.
--
-- On UPDATE the stamp is immutable once set. Only content managers can UPDATE these
-- tables today, so this is defence in depth against a future policy being loosened —
-- and it keeps relink_student_activity()'s own UPDATE of the uuid from disturbing the
-- key it just matched on. The `is not null` guard is what lets section 4.3's backfill
-- fill a blank stamp in.

CREATE OR REPLACE FUNCTION "private"."stamp_student_email"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := (select auth.uid());
begin
  if TG_OP = 'UPDATE' then
    if old.student_email is not null then
      new.student_email := old.student_email;
    end if;
    return new;
  end if;

  -- INSERT: discard the client's value unconditionally, then derive the real one.
  new.student_email := null;

  if v_uid is not null then
    select lower(p.email)
      into new.student_email
      from public.profiles p
     where p.id = v_uid;
  end if;

  return new;
end;
$$;

ALTER FUNCTION "private"."stamp_student_email"() OWNER TO "postgres";


CREATE OR REPLACE TRIGGER "paper_requests_stamp_student_email"
    BEFORE INSERT OR UPDATE ON "public"."paper_requests"
    FOR EACH ROW EXECUTE FUNCTION "private"."stamp_student_email"();

CREATE OR REPLACE TRIGGER "faculty_suggestions_stamp_student_email"
    BEFORE INSERT OR UPDATE ON "public"."faculty_suggestions"
    FOR EACH ROW EXECUTE FUNCTION "private"."stamp_student_email"();

CREATE OR REPLACE TRIGGER "course_resource_submissions_stamp_student_email"
    BEFORE INSERT OR UPDATE ON "public"."course_resource_submissions"
    FOR EACH ROW EXECUTE FUNCTION "private"."stamp_student_email"();

CREATE OR REPLACE TRIGGER "event_image_submissions_stamp_student_email"
    BEFORE INSERT OR UPDATE ON "public"."event_image_submissions"
    FOR EACH ROW EXECUTE FUNCTION "private"."stamp_student_email"();


-- ---------------------------------------------------------------------------
-- 4.6 The same key for course_materials, written into the private table
-- ---------------------------------------------------------------------------
-- Derived from NEW.created_by rather than auth.uid() so it matches the 4.3 backfill
-- exactly and so a content manager filing a material on a student's behalf still
-- produces a claim the student can redeem. created_by is not attacker-controlled
-- here the way a free student_email column would be: the baseline's
-- "Students can submit pending course materials" policy already forces
-- created_by = auth.uid() for everyone except a content manager.
--
-- SECURITY DEFINER because the writer holds no privilege on private.contribution_claims —
-- nobody does. The function is owned by postgres, who owns the table, so it also
-- passes the RLS that denies everyone else.

CREATE OR REPLACE FUNCTION "private"."record_contribution_claim"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text;
begin
  select lower(p.email)
    into v_email
    from public.profiles p
   where p.id = new.created_by;

  -- A created_by that resolves to no profile is left alone rather than cleared. That
  -- state is not an error, it is the whole scenario: deleting a student's login nulls
  -- created_by (or leaves it pointing at a profile that has cascaded away), and the
  -- claim is the only thing that can repair it when they sign up again. Deleting the
  -- claim here would delete the feature.
  if v_email is not null then
    insert into private.contribution_claims (table_name, row_id, student_email)
    values (TG_TABLE_NAME, new.id, v_email)
    on conflict (table_name, row_id) do update
      set student_email = excluded.student_email;
  end if;

  return new;
end;
$$;

ALTER FUNCTION "private"."record_contribution_claim"() OWNER TO "postgres";


-- Deleting the material deletes the stored address with it; the claim exists only to
-- point at a row, and outliving that row would just be an address kept for no reason.
CREATE OR REPLACE FUNCTION "private"."forget_contribution_claim"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from private.contribution_claims
   where table_name = TG_TABLE_NAME
     and row_id = old.id;

  return old;
end;
$$;

ALTER FUNCTION "private"."forget_contribution_claim"() OWNER TO "postgres";


-- UPDATE OF created_by is included so ownership and claim can never drift apart when
-- a manager reassigns a row.
CREATE OR REPLACE TRIGGER "course_materials_record_claim"
    AFTER INSERT OR UPDATE OF "created_by" ON "public"."course_materials"
    FOR EACH ROW EXECUTE FUNCTION "private"."record_contribution_claim"();

CREATE OR REPLACE TRIGGER "course_materials_forget_claim"
    AFTER DELETE ON "public"."course_materials"
    FOR EACH ROW EXECUTE FUNCTION "private"."forget_contribution_claim"();


-- ---------------------------------------------------------------------------
-- 5. relink_student_activity()
-- ---------------------------------------------------------------------------
-- Takes no argument on purpose. An email parameter would let any signed-in student
-- pass someone else's address and take ownership of their uploads, so the address is
-- read from the caller's own profile and can never be supplied from the browser.
--
-- SECURITY DEFINER because the caller does not yet own these rows — that is the
-- whole point of the call — and the row-level policies would therefore reject the
-- UPDATE. The definer's reach is bounded by the auth.uid() lookup above it, and by
-- the fact that every address it matches on was written by the server (section 4.5)
-- or by this migration's backfill, never by a client.

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

  -- No profile row yet (the signup trigger has not run): nothing to claim.
  if v_email is null then
    return jsonb_build_object('email', null, 'relinked', v_counts);
  end if;

  -- course_materials keeps its key in private.contribution_claims, so the match is a
  -- join rather than a column comparison. Same rule, different storage.
  update public.course_materials t
  set created_by = v_uid
  from private.contribution_claims c
  where c.table_name = 'course_materials'
    and c.row_id = t.id
    and lower(c.student_email) = v_email
    and t.created_by is distinct from v_uid;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('course_materials', v_n);

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

  return jsonb_build_object('email', v_email, 'relinked', v_counts);
end;
$$;


ALTER FUNCTION "public"."relink_student_activity"() OWNER TO "postgres";


-- A new function is executable by PUBLIC until that default is revoked, which would
-- expose a SECURITY DEFINER writer to the anon key.
REVOKE ALL ON FUNCTION "public"."relink_student_activity"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."relink_student_activity"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."relink_student_activity"() TO "authenticated";


-- ---------------------------------------------------------------------------
-- 6. Owner update path for profiles
-- ---------------------------------------------------------------------------
-- The baseline gives a student SELECT and INSERT on their own row but no UPDATE
-- policy at all, so the new metadata columns are unwritable from the browser until
-- this policy exists.
--
-- The policy checks ownership and nothing else. role and email are pinned by the
-- trigger below instead, because a policy CANNOT do it: a policy expression sees only
-- NEW, so the only way to compare against the stored value from inside one is to
-- subquery public.profiles — and a policy ON public.profiles that reads
-- public.profiles is rewritten into itself. Postgres detects that at rewrite time and
-- raises 42P17 for EVERY update of the table by authenticated, any column, any row,
-- including the live admin path in src/services/profilesService.ts (updateRole):
--
--     ERROR:  infinite recursion detected in policy for relation "profiles"
--
-- Note that the baseline's own "Content managers can manage profiles" calls
-- private.can_manage_content() from a policy on profiles and does NOT recurse: that
-- function is SECURITY DEFINER owned by postgres, so its inner read of profiles is
-- planned with RLS off. Only a DIRECT reference to public.profiles inside the policy
-- expression recurses.
--
-- id needs no trigger: USING and WITH CHECK both pin it to auth.uid(), so a student
-- can neither reach another row nor move their own row onto another id.
--
-- DROP-then-CREATE rather than a CREATE-if-absent guard so that any environment which
-- already received the recursive first draft of this policy is repaired by re-running
-- the file, instead of silently keeping the broken definition. The name is one this
-- migration owns; nothing in the baseline is touched.

DROP POLICY IF EXISTS "Users can update own profile" ON "public"."profiles";

CREATE POLICY "Users can update own profile" ON "public"."profiles"
    FOR UPDATE TO "authenticated"
    USING (("id" = ( SELECT "auth"."uid"() AS "uid")))
    WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));


-- The trigger is the only thing in Postgres that can see OLD and NEW at once, which
-- is exactly what "this column may not change" needs.
--
-- Why each column is pinned:
--   role  — without it a student hands themselves 'chairperson' and passes
--           private.can_manage_content() everywhere in the schema.
--   email — activity re-linking is keyed on the address (section 4), so a writable
--           email would let anyone type another student's address and then claim
--           their uploads on the next call to relink_student_activity().
--
-- A null auth.uid() is let through deliberately. It means the statement did not come
-- from a signed-in browser session: a service_role key, a migration, or psql. anon
-- cannot reach this trigger at all — it holds no UPDATE privilege on public.profiles
-- (baseline :1365) and no UPDATE policy grants it rows. Blocking the null case would
-- break server-side admin tooling that works today while defending against nothing.

CREATE OR REPLACE FUNCTION "private"."enforce_profile_identity_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_auth_email text;
begin
  if v_uid is null then
    return new;
  end if;

  -- INSERT is the signup path, and it is the dangerous one: the baseline's INSERT policy
  -- pins id and role but never email, and this migration is what introduces
  -- relink_student_activity(). Without this branch a new account could be created carrying
  -- somebody else's university address and then adopt every contribution they ever made.
  -- The address is taken from auth.users, never from what the browser sent.
  if tg_op = 'INSERT' then
    select lower(u.email) into v_auth_email from auth.users u where u.id = v_uid;

    if new.id is distinct from v_uid then
      raise exception 'You can only create your own profile.'
        using errcode = '42501';
    end if;

    if v_auth_email is not null then
      new.email := v_auth_email;
    end if;

    return new;
  end if;

  -- Content managers keep the admin role editor working. Safe to call from here for
  -- the same reason the baseline's policies call it: SECURITY DEFINER, owned by
  -- postgres, so its read of public.profiles does not re-enter this table's RLS.
  if private.can_manage_content() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'You cannot change your own role.'
      using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    raise exception 'You cannot change the email your account is linked by.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

ALTER FUNCTION "private"."enforce_profile_identity_columns"() OWNER TO "postgres";


-- The WHEN clause keeps ordinary profile edits — name, whatsapp, avatar — from paying
-- for a can_manage_content() lookup they can never fail.
CREATE OR REPLACE TRIGGER "profiles_guard_identity_columns"
    BEFORE UPDATE ON "public"."profiles"
    FOR EACH ROW
    WHEN ((("old"."role" IS DISTINCT FROM "new"."role")
        OR ("old"."email" IS DISTINCT FROM "new"."email")))
    EXECUTE FUNCTION "private"."enforce_profile_identity_columns"();

-- Separate trigger because a WHEN clause cannot reference OLD on INSERT.
CREATE OR REPLACE TRIGGER "profiles_guard_identity_on_insert"
    BEFORE INSERT ON "public"."profiles"
    FOR EACH ROW
    EXECUTE FUNCTION "private"."enforce_profile_identity_columns"();

-- Two people cannot share an address, so a claim can never be ambiguous. Case-insensitive
-- because the re-link matches that way and universities are inconsistent about casing.
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_email_lower_key"
    ON "public"."profiles" USING "btree" ("lower"("email"));


-- This grant is INERT and is kept only to record the intended column list. It is not
-- protecting anything: the baseline carries GRANT ALL ON TABLE public.profiles TO
-- authenticated (baseline :1366), a table-level UPDATE already covers every column,
-- and adding column grants on top of a table grant subtracts nothing. Narrowing it
-- would take a REVOKE — not additive, and it would also strip the content managers'
-- ability to change other people's roles from the admin UI, so it is deliberately not
-- done here. The trigger above is the real control; do not read this list as a wall.

GRANT UPDATE (
    "name",
    "secondary_email",
    "whatsapp",
    "class_name",
    "section",
    "degree",
    "avatar_url",
    "avatar_path"
) ON TABLE "public"."profiles" TO "authenticated";


-- ---------------------------------------------------------------------------
-- 7. Missing grants on event_image_submissions
-- ---------------------------------------------------------------------------
-- Pre-existing and unrelated to the columns above, but fixed here because section 4
-- adds a column to this table and would otherwise look like it wired up a feature
-- that cannot run. The baseline gives event_image_submissions three policies —
-- "Public can submit event images" (INSERT, anon+authenticated), "Content managers
-- can read event image submissions" (SELECT) and "Content managers can delete event
-- image submissions" (DELETE) — but grants anon and authenticated only
-- REFERENCES,TRIGGER,TRUNCATE,MAINTAIN (baseline :1320-1321). Privileges are checked
-- before policies, so all three policies are dead: the event-photo feature returns
-- "permission denied for table event_image_submissions" the moment it is wired up.
--
-- These grants only re-open what the policies already describe. SELECT and DELETE go
-- to authenticated alone and stay filtered to content managers by the existing
-- policies, so a student sees no rows and can delete none — including the new
-- student_email column. No UPDATE is granted, because no UPDATE policy exists.

GRANT INSERT ON TABLE "public"."event_image_submissions" TO "anon";
GRANT INSERT ON TABLE "public"."event_image_submissions" TO "authenticated";
GRANT SELECT ON TABLE "public"."event_image_submissions" TO "authenticated";
GRANT DELETE ON TABLE "public"."event_image_submissions" TO "authenticated";
