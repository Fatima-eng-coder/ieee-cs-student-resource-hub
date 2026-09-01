-- Temporary diagnostic. Answers one question and is dropped by the next migration.
--
-- public.delete_student_account() ends in `delete from auth.users where id = p_user_id`. Every
-- statement before it has been verified, but that line has not: auth.users is owned by
-- supabase_auth_admin, and whether the definer role can delete from it is a property of the
-- hosted project rather than of anything in this repo. Finding out by running the real function
-- would mean deleting a real account.
--
-- So this reports the privilege without exercising it. It is SECURITY DEFINER so that it
-- answers for the same role delete_student_account() runs as, and it reads catalogue state
-- only -- it cannot modify anything.

set local statement_timeout = '30s';

CREATE OR REPLACE FUNCTION "public"."probe_auth_delete_privilege"()
RETURNS "jsonb"
LANGUAGE "sql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  select jsonb_build_object(
    'definer_role',      current_user,
    'auth_users_owner',  (select pg_get_userbyid(relowner) from pg_class where oid = 'auth.users'::regclass),
    'can_delete',        has_table_privilege(current_user, 'auth.users', 'DELETE'),
    'can_select',        has_table_privilege(current_user, 'auth.users', 'SELECT'),
    'is_superuser',      (select usesuper from pg_user where usename = current_user)
  );
$$;

ALTER FUNCTION "public"."probe_auth_delete_privilege"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."probe_auth_delete_privilege"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."probe_auth_delete_privilege"() TO "anon";
