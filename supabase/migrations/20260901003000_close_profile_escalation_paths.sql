-- Two ways round assign_portal_role() that made "the only way a portal role changes" untrue.
--
-- 20260901002800 closed the front door: role can only be written by that function, and only a
-- chairperson can call it. Both of these walk past it without ever writing to the role column.
--
-- ---------------------------------------------------------------------------------------
-- 1. Deleting the chairperson
-- ---------------------------------------------------------------------------------------
--
-- "Content managers can manage profiles" carries no FOR clause, so it is FOR ALL — DELETE
-- included — and `authenticated` holds a table-wide DELETE grant on public.profiles. There is
-- no BEFORE DELETE trigger. So any content manager, with nothing but the publishable key and
-- their own session:
--
--     DELETE FROM profiles WHERE role = 'chairperson';
--
-- leaves the society with none. assign_portal_role() then refuses everybody, because
-- `v_caller_role is distinct from 'chairperson'` is true for every caller alive. The deleted
-- chairperson cannot put themselves back either: the only INSERT policy they satisfy is "Users
-- can create own student profile", which pins role to 'student'. Unrecoverable from the
-- application, at any privilege level, for ever.
--
-- public.delete_student_account() already refuses exactly this — it will not delete a content
-- manager and will not delete the caller — but that guard only protects the RPC. The table was
-- still open next to it.
--
-- The fix is to take DELETE off the table for everyone and leave the RPC as the only route.
-- It is SECURITY DEFINER owned by postgres, so it is unaffected by both changes below.

set local statement_timeout = '60s';

DROP POLICY IF EXISTS "Content managers can manage profiles" ON "public"."profiles";

-- Restated without DELETE. SELECT is deliberately absent too: "Content managers can read all
-- profiles" already grants it and duplicating it here would mean two places to keep in step.
CREATE POLICY "Content managers can write profiles" ON "public"."profiles"
    FOR UPDATE TO "authenticated"
    USING ((SELECT "private"."can_manage_content"()))
    WITH CHECK ((SELECT "private"."can_manage_content"()));

CREATE POLICY "Content managers can add profiles" ON "public"."profiles"
    FOR INSERT TO "authenticated"
    WITH CHECK ((SELECT "private"."can_manage_content"()));

-- A policy is only half of it: this codebase has been bitten before by a policy with no grant
-- (inert) and, here, by a grant with a policy that was wider than anyone realised. Nothing in
-- the app deletes a profile except delete_student_account(), which does not need this.
REVOKE DELETE ON TABLE "public"."profiles" FROM "authenticated";
REVOKE DELETE ON TABLE "public"."profiles" FROM "anon";


-- ---------------------------------------------------------------------------------------
-- 2. Moving the chairperson's row onto another account
-- ---------------------------------------------------------------------------------------
--
-- private.enforce_profile_identity_columns() guards `role` and `email`. It does not guard `id`,
-- and — worse — its trigger is
--
--     WHEN (old.role IS DISTINCT FROM new.role OR old.email IS DISTINCT FROM new.email)
--
-- so an UPDATE touching only `id` never reaches the function at all. The row-level check that
-- would otherwise stop it is `can_manage_content()`, a predicate on the CALLER that says nothing
-- about the row, so it passes for any value. `authenticated` has a table-wide UPDATE grant that
-- covers the column.
--
-- Which gives a content manager: sign up a second account, then
--
--     UPDATE profiles SET id = '<my other account>' WHERE role = 'chairperson';
--
-- and sign in as that account. Chairperson, without the role column ever being written, without
-- the function, the flag, the locks or the confirmation.
--
-- 20260901000100 argued the inert column grants were acceptable because "the trigger above is
-- the real control". That is only true if the trigger covers every column that can carry the
-- role — and the primary key is one of them.

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

  -- The primary key is an identity column like any other here: it is the whole of the link
  -- between a profile and the login that may use it. Repointing it hands somebody the row.
  if new.id is distinct from old.id then
    raise exception 'A profile cannot be moved to a different account.'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     and coalesce(current_setting('app.role_assignment', true), '') <> 'on' then
    raise exception 'Roles are assigned through the Team Access page, not by writing to this column.'
      using errcode = '42501';
  end if;

  if new.email is distinct from old.email and not private.can_manage_content() then
    raise exception 'You cannot change the email your account is linked by.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

ALTER FUNCTION "private"."enforce_profile_identity_columns"() OWNER TO "postgres";

-- Widened, or the branch above is unreachable by the exact update it exists to stop.
CREATE OR REPLACE TRIGGER "profiles_guard_identity_columns"
    BEFORE UPDATE ON "public"."profiles"
    FOR EACH ROW
    WHEN ((("old"."id"    IS DISTINCT FROM "new"."id")
        OR ("old"."role"  IS DISTINCT FROM "new"."role")
        OR ("old"."email" IS DISTINCT FROM "new"."email")))
    EXECUTE FUNCTION "private"."enforce_profile_identity_columns"();


-- ---------------------------------------------------------------------------------------
-- 3. The comment on assign_portal_role still describes the design that was replaced
-- ---------------------------------------------------------------------------------------

COMMENT ON FUNCTION "public"."assign_portal_role"("p_user_id" "uuid", "p_role" "text") IS
  'The only way a portal role changes. Chairperson only. Handing chairperson to somebody else demotes the caller first and promotes the successor second, so the moment in between has no chairperson rather than two -- which is what profiles_single_chairperson_idx permits. Both rows are taken FOR UPDATE, so concurrent handovers serialise on the caller row.';
