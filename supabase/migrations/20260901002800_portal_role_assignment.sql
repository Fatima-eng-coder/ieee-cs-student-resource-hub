-- One door for changing a portal role, and only the chairperson has the key.
--
-- Today any of the four content managers can set any role on any profile, including their own.
-- The admin page hides the control behind `currentAdmin.role === 'chairperson'`, but that is a
-- client-side gate over an API anybody can call directly:
--
--   PATCH /rest/v1/profiles?id=eq.<self>   {"role":"chairperson"}
--
-- passes "Content managers can manage profiles", and the identity trigger waves it through on
-- `if private.can_manage_content() then return new`. So a webmaster or general secretary can
-- promote themselves to chairperson. That is the hole this closes.
--
-- ---------------------------------------------------------------------------------------
-- The model
-- ---------------------------------------------------------------------------------------
--
-- Every committee member signs up once, normally, with their own university address. Nobody
-- shares a login and nobody is handed a password. The chairperson then assigns their role from
-- the portal, and that is the only manual step -- there is no DB work at any point in the year.
--
-- Deliberately NOT role mailboxes (chairperson@..., jointsecretary1@...). They look tidy and
-- cost more than they save:
--
--   * every handover becomes a password handed person to person, which is the one thing a
--     society with yearly turnover should never institutionalise;
--   * the audit trail says "chairperson" where it should say who;
--   * Supabase sends password resets to the address on the account, so each mailbox has to
--     genuinely exist and stay reachable after its holder graduates;
--   * and it contradicts everyone signing up as a student first, which is the part of the
--     proposal worth keeping.
--
-- Handover is the piece that makes this work without an administrator. Assigning `chairperson`
-- to somebody else demotes the outgoing chairperson in the same statement, so the society is
-- never left with two and never left with none.

set local statement_timeout = '60s';


-- ---------------------------------------------------------------------------------------
-- 1. At most one chairperson, enforced by the database
-- ---------------------------------------------------------------------------------------
--
-- A partial unique index over a constant, the same shape hierarchy_terms uses for "exactly one
-- current term". Any number of rows may hold any other role; only one may hold this one.
--
-- It is also why the handover below is a single UPDATE touching both rows: a unique index is
-- checked at the end of the statement, so demoting and promoting as two statements would fail
-- on the moment in between when two chairpersons exist.

CREATE UNIQUE INDEX IF NOT EXISTS "profiles_single_chairperson_idx"
    ON "public"."profiles" (("role")) WHERE "role" = 'chairperson';


-- ---------------------------------------------------------------------------------------
-- 2. Role changes only through the function
-- ---------------------------------------------------------------------------------------
--
-- The trigger now asks for a transaction-local flag that only assign_portal_role() sets. The
-- content-manager bypass stays for `email`, which the admin tooling still edits directly, and
-- is gone for `role`.
--
-- auth.uid() being null still returns early, which keeps the SQL editor working -- that is the
-- bootstrap path for the very first chairperson, who by definition cannot be appointed by one.

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

  -- No content-manager bypass here any more. Four people could manage content; only one of
  -- them should be able to decide who else can.
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


-- ---------------------------------------------------------------------------------------
-- 3. The door
-- ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."assign_portal_role"("p_user_id" "uuid", "p_role" "text")
RETURNS "jsonb"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
declare
  v_caller      uuid := (select auth.uid());
  v_caller_role text;
  v_target_role text;
  v_target_name text;
  v_handover    boolean := false;
begin
  if v_caller is null then
    raise exception 'You must be signed in to assign a role'
      using errcode = '28000';
  end if;

  select p.role into v_caller_role from public.profiles p where p.id = v_caller;

  if v_caller_role is distinct from 'chairperson' then
    raise exception 'Only the chairperson can assign portal roles.'
      using errcode = '42501';
  end if;

  if p_role not in ('student', 'chairperson', 'vice_chairperson', 'general_secretary',
                    'webmaster', 'joint_secretary', 'graphic_designer', 'operations_manager',
                    'treasurer') then
    raise exception 'There is no % role.', p_role
      using errcode = '22023';
  end if;

  select p.role, p.name into v_target_role, v_target_name
  from public.profiles p where p.id = p_user_id;

  if v_target_role is null then
    raise exception 'That account no longer exists. Refresh the list.'
      using errcode = 'P0002';
  end if;

  -- Changing your own role is the one move that can leave the society without a chairperson,
  -- and it has an intended form: hand the role to your successor, which demotes you as part of
  -- the same change. So it is refused here rather than left as a way to lock everyone out.
  if p_user_id = v_caller then
    raise exception 'You cannot change your own role. To step down, give chairperson to whoever is taking over.'
      using errcode = '42501';
  end if;

  v_handover := (p_role = 'chairperson');

  -- Lets the identity trigger distinguish this from a direct write. Transaction-local, so it
  -- cannot leak into anything else on the connection.
  perform set_config('app.role_assignment', 'on', true);

  if v_handover then
    -- Both rows in one statement, because profiles_single_chairperson_idx is checked when the
    -- statement finishes: as two updates there would be an instant with two chairpersons, and
    -- the index would reject whichever ran second.
    update public.profiles p
    set role = case when p.id = p_user_id then 'chairperson' else 'student' end
    where p.id in (p_user_id, v_caller);
  else
    update public.profiles p set role = p_role where p.id = p_user_id;
  end if;

  perform set_config('app.role_assignment', 'off', true);

  return jsonb_build_object(
    'user_id',        p_user_id,
    'name',           v_target_name,
    'previous_role',  v_target_role,
    'new_role',       p_role,
    'handover',       v_handover,
    'caller_role_now', case when v_handover then 'student' else v_caller_role end
  );
end;
$$;

ALTER FUNCTION "public"."assign_portal_role"("p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."assign_portal_role"("p_user_id" "uuid", "p_role" "text") IS
  'The only way a portal role changes. Chairperson only. Assigning chairperson to someone else demotes the caller in the same statement, so there is never more than one and never none.';

REVOKE ALL ON FUNCTION "public"."assign_portal_role"("p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."assign_portal_role"("p_user_id" "uuid", "p_role" "text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."assign_portal_role"("p_user_id" "uuid", "p_role" "text") TO "authenticated";
