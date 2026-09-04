-- Remove the synthetic responses written while load-testing the submission path.
--
-- 500 rows were inserted against the recruitment form to measure what the write path does under
-- concurrency (50, then 150, then 300 at once). Every one carries
-- student_email = 'loadtest@ieeecscui.invalid'. `.invalid` is reserved by RFC 2606 precisely so
-- that it can never belong to anybody, which is why it was chosen as the marker: this predicate
-- cannot match a real application even if somebody mistypes their address.
--
-- Deleting through a migration rather than the API because DELETE on form_responses is granted
-- to content managers only, and the load test ran as anon -- it could create these rows but not
-- remove them.
--
-- The counts are reported rather than assumed. A cleanup that silently deletes nothing looks
-- exactly like a cleanup that worked.

set local statement_timeout = '60s';

DO $$
DECLARE
  v_before  integer;
  v_deleted integer;
  v_after   integer;
  v_real    integer;
BEGIN
  SELECT count(*) INTO v_before
    FROM public.form_responses
   WHERE student_email = 'loadtest@ieeecscui.invalid';

  DELETE FROM public.form_responses
   WHERE student_email = 'loadtest@ieeecscui.invalid';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) INTO v_after
    FROM public.form_responses
   WHERE student_email = 'loadtest@ieeecscui.invalid';

  SELECT count(*) INTO v_real
    FROM public.form_responses
   WHERE student_email IS DISTINCT FROM 'loadtest@ieeecscui.invalid';

  RAISE WARNING 'load-test cleanup: % found, % deleted, % remaining; % genuine responses untouched',
    v_before, v_deleted, v_after, v_real;

  IF v_after <> 0 THEN
    RAISE EXCEPTION 'load-test rows survived the cleanup (% left)', v_after;
  END IF;
END
$$;
