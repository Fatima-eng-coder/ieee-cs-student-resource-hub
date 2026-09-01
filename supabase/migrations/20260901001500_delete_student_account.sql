-- Let an admin delete a student's account without destroying what that student contributed.
--
-- This is the feature that stands in for a password reset. The decision was: rather than
-- build a reset flow, an admin deletes the account, the student signs up again on the same
-- university address, and signup calls relink_student_activity() to adopt everything they had
-- done before. That only works if the deletion keeps the rows and the addresses.
--
-- Which is most of the work here. Fifteen columns across eleven tables reference auth.users,
-- and they fall into three groups:
--
--   ON DELETE CASCADE   profiles.id                       -- goes with the login, correctly
--   ON DELETE SET NULL  faculty_suggestions.submitted_by  -- already detaches itself
--                       faculty_suggestions.reviewed_by
--                       forms.created_by
--                       form_responses.submitted_by
--   NO ACTION           everything else                   -- would raise 23503 and abort
--
-- The last group is why a bare "delete from auth.users" fails on any student who has ever
-- contributed. Each one is nulled first. The identity that survives is student_email, stamped
-- server-side by private.stamp_student_email(), and private.contribution_claims for
-- course_materials -- neither of which is touched here, because both are exactly what the
-- re-link matches on afterwards.
--
-- Nulling course_materials.created_by fires course_materials_record_claim (it is an
-- AFTER UPDATE OF created_by trigger). That is safe and deliberate: the function looks up a
-- profile for the new value, finds none for NULL, and leaves the stored claim alone. Its own
-- comment calls this out as the scenario the claim exists for.

set local statement_timeout = '120s';


CREATE OR REPLACE FUNCTION "public"."delete_student_account"("p_user_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
declare
  v_caller  uuid := (select auth.uid());
  v_role    text;
  v_email   text;
  v_name    text;
  v_kept    integer := 0;
  v_touched integer;
begin
  if not private.can_manage_content() then
    raise exception 'Only content managers can delete an account'
      using errcode = '42501';
  end if;

  -- An admin who deletes themselves is locked out of the portal with no way back in, and the
  -- action is irreversible, so it is refused rather than confirmed.
  if p_user_id = v_caller then
    raise exception 'You cannot delete your own account'
      using errcode = '42501';
  end if;

  select p.role, lower(p.email), p.name
    into v_role, v_email, v_name
    from public.profiles p
   where p.id = p_user_id;

  if not found then
    raise exception 'No account with that id'
      using errcode = 'P0002';
  end if;

  -- Deleting a fellow content manager would let any one officer remove the others. Removing
  -- someone from the committee is a role change, and it is a different, reversible decision;
  -- demote first, then delete if that is really what is wanted.
  if v_role in ('chairperson', 'vice_chairperson', 'general_secretary', 'webmaster') then
    raise exception 'That account can manage content. Change its role first if it really should be deleted.'
      using errcode = '42501';
  end if;

  -- Detach, in dependency order, every reference that would otherwise abort the delete. Each
  -- row stays exactly where it is; only the pointer to a login that is about to stop existing
  -- is cleared.
  update public.announcements               set created_by   = null where created_by   = p_user_id;
  update public.events                      set created_by   = null where created_by   = p_user_id;
  update public.courses                     set created_by   = null where created_by   = p_user_id;
  update public.gallery_albums              set created_by   = null where created_by   = p_user_id;
  update public.gallery_photos              set created_by   = null where created_by   = p_user_id;
  update public.faqs                        set created_by   = null where created_by   = p_user_id;
  update public.quick_links                 set created_by   = null where created_by   = p_user_id;
  update public.paper_requests              set reviewed_by  = null where reviewed_by  = p_user_id;
  update public.course_resource_submissions set reviewed_by  = null where reviewed_by  = p_user_id;

  -- The four that carry student_email, counted because they are the ones a re-link can bring
  -- back and therefore the number worth showing the admin before they confirm.
  update public.course_materials            set created_by   = null where created_by   = p_user_id;
  get diagnostics v_touched = row_count; v_kept := v_kept + v_touched;

  update public.paper_requests              set submitted_by = null where submitted_by = p_user_id;
  get diagnostics v_touched = row_count; v_kept := v_kept + v_touched;

  update public.course_resource_submissions set submitted_by = null where submitted_by = p_user_id;
  get diagnostics v_touched = row_count; v_kept := v_kept + v_touched;

  update public.event_image_submissions     set submitted_by = null where submitted_by = p_user_id;
  get diagnostics v_touched = row_count; v_kept := v_kept + v_touched;

  -- faculty_suggestions and form_responses detach themselves via ON DELETE SET NULL, but they
  -- are counted here so the total the admin sees matches what a re-link will actually adopt.
  select v_kept
       + (select count(*) from public.faculty_suggestions where submitted_by = p_user_id)
       + (select count(*) from public.form_responses      where submitted_by = p_user_id)
    into v_kept;

  -- profiles cascades from here (profiles_id_fkey ON DELETE CASCADE), and the auth schema's
  -- own children -- identities, sessions, refresh tokens, mfa factors -- cascade with it.
  delete from auth.users where id = p_user_id;

  return jsonb_build_object(
    'deleted_id',            p_user_id,
    'name',                  v_name,
    'email',                 v_email,
    'contributions_kept',    v_kept
  );
end;
$$;

ALTER FUNCTION "public"."delete_student_account"("p_user_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_student_account"("p_user_id" "uuid") IS
  'Removes a login and keeps its contributions. Detaches every auth.users reference that would block the delete, leaving student_email and private.contribution_claims intact so relink_student_activity() can restore the history when the student signs up again on the same address. Refuses the caller''s own account and any content manager.';

-- A definer function is executable by PUBLIC by default, which would put an anonymous visitor
-- inside the body and one bad edit away from the delete. Only signed-in callers reach the
-- role check, and the role check is what actually authorises.
REVOKE ALL ON FUNCTION "public"."delete_student_account"("p_user_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_student_account"("p_user_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."delete_student_account"("p_user_id" "uuid") TO "authenticated";
