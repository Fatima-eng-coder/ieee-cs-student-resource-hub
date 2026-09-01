-- The diagnostic from 20260901002300 has answered, so it goes.
--
--     definer_role      postgres
--     auth_users_owner  supabase_auth_admin
--     can_delete        true
--     can_select        true
--     is_superuser      false
--
-- So public.delete_student_account()'s final statement is reachable: postgres holds DELETE on
-- auth.users by explicit grant rather than by ownership or superuser rights. The account
-- deletion path is verified end to end without an account having been deleted to find out.
--
-- Dropped rather than left in place. It is anon-callable and reports catalogue facts about the
-- auth schema, which is not something to leave exposed for a question already answered.

set local statement_timeout = '30s';

DROP FUNCTION IF EXISTS "public"."probe_auth_delete_privilege"();
