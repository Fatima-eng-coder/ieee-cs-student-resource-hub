-- Actually remove the 500 synthetic responses. 20260905003000 did not.
--
-- That one keyed on student_email, which a BEFORE INSERT trigger overwrites: for an anonymous
-- submitter it is set to null, so the marker the load test sent never reached the row and the
-- delete matched nothing. field_labels is different -- it is the response payload itself,
-- written by the client and rewritten by nothing -- so `field_labels ? 'loadtest'` identifies
-- exactly the rows the test created and nothing else. A genuine response can only carry that key
-- if a real form has a field whose id is literally "loadtest"; none does.
--
-- The guards below are the actual lesson. The previous attempt asserted that no marked rows
-- remained afterwards, and that passed for the worst possible reason: no row had ever carried
-- the marker, so "none left" was true before it started. A check that cannot distinguish "I
-- cleaned it up" from "I was looking in the wrong place" is not a check. So this asserts BOTH
-- that the predicate matched something to begin with, and that nothing survives.

set local statement_timeout = '120s';

DO $$
DECLARE
  v_before  integer;
  v_deleted integer;
  v_after   integer;
  v_genuine integer;
BEGIN
  SELECT count(*) INTO v_before   FROM public.form_responses WHERE field_labels ? 'loadtest';
  SELECT count(*) INTO v_genuine  FROM public.form_responses WHERE NOT (field_labels ? 'loadtest');

  -- The failure the last attempt could not see. If the predicate matches nothing, the marker is
  -- wrong and the rows are still out there under some other shape.
  IF v_before = 0 THEN
    RAISE EXCEPTION 'load-test marker matched no rows; the predicate is wrong, not the table clean';
  END IF;

  DELETE FROM public.form_responses WHERE field_labels ? 'loadtest';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) INTO v_after FROM public.form_responses WHERE field_labels ? 'loadtest';

  IF v_after <> 0 THEN
    RAISE EXCEPTION 'load-test rows survived (% remaining of %)', v_after, v_before;
  END IF;

  IF v_deleted <> v_before THEN
    RAISE EXCEPTION 'deleted % but expected %', v_deleted, v_before;
  END IF;

  RAISE WARNING 'load-test cleanup: deleted % rows; % genuine responses untouched', v_deleted, v_genuine;
END
$$;
