-- Fix the handover. 20260901002800 got this wrong and it failed on the second use.
--
-- That migration did the demotion and the promotion as one UPDATE covering both rows, with a
-- comment asserting that profiles_single_chairperson_idx "is checked when the statement
-- finishes". It is not. Postgres defers a uniqueness check to end-of-statement only for a
-- DEFERRABLE unique CONSTRAINT; a plain unique index is checked as each row is written.
--
-- So the result depended on the order the rows happened to be updated in, which is unspecified:
--
--   demote the outgoing chair first, then promote  ->  zero chairpersons in between  ->  fine
--   promote first, then demote                     ->  two chairpersons in between   ->  23505
--
-- Which is exactly the reported symptom: the first handover worked, the second was refused with
-- "Somebody already holds that role", and nothing about the data explained the difference.
--
-- The fix is to stop relying on the order and pick the one that is always legal. Two statements,
-- demotion first. The intermediate state has NO chairperson, and the index forbids two, not
-- none. Both run inside the function's transaction, so nothing outside it ever observes the gap.
--
-- Also adds the lock that was missing. Two handovers racing could both read a chairperson role
-- for the caller and both proceed; taking the row FOR UPDATE serialises them, and the loser sees
-- the state the winner left behind.

set local statement_timeout = '60s';

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

  -- FOR UPDATE: two handovers started at the same moment would otherwise both see themselves as
  -- chairperson and both act on it.
  select p.role into v_caller_role
  from public.profiles p
  where p.id = v_caller
  for update;

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
  from public.profiles p
  where p.id = p_user_id
  for update;

  if v_target_role is null then
    raise exception 'That account no longer exists. Refresh the list.'
      using errcode = 'P0002';
  end if;

  if p_user_id = v_caller then
    raise exception 'You cannot change your own role. To step down, give chairperson to whoever is taking over.'
      using errcode = '42501';
  end if;

  v_handover := (p_role = 'chairperson');

  perform set_config('app.role_assignment', 'on', true);

  if v_handover then
    -- Demotion FIRST. This is the whole fix: it leaves no chairperson for an instant, which the
    -- index allows, where promoting first leaves two, which it does not.
    update public.profiles set role = 'student' where id = v_caller;
    update public.profiles set role = 'chairperson' where id = p_user_id;
  else
    update public.profiles set role = p_role where id = p_user_id;
  end if;

  perform set_config('app.role_assignment', 'off', true);

  return jsonb_build_object(
    'user_id',         p_user_id,
    'name',            v_target_name,
    'previous_role',   v_target_role,
    'new_role',        p_role,
    'handover',        v_handover,
    'caller_role_now', case when v_handover then 'student' else v_caller_role end
  );
end;
$$;

ALTER FUNCTION "public"."assign_portal_role"("p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


-- ---------------------------------------------------------------------------------------
-- Repair anything the broken version left behind
-- ---------------------------------------------------------------------------------------
--
-- A refused handover rolled back cleanly, so no split state is expected. This reports rather
-- than assumes: if more than one chairperson somehow exists the index would already have made
-- it impossible, and if none exists that is worth knowing before somebody discovers it by being
-- unable to assign a role.

DO $$
DECLARE
  v_chairs integer;
BEGIN
  SELECT count(*) INTO v_chairs FROM public.profiles WHERE role = 'chairperson';

  IF v_chairs = 0 THEN
    RAISE WARNING 'No account currently holds chairperson. Appoint one with supabase/scripts/assign-team-roles.sql before anyone can assign roles from the portal.';
  END IF;
END
$$;
