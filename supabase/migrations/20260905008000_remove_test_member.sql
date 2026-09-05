-- Remove the placeholder member named 'test' from the roster.
--
-- A joint-secretary seat left behind from testing the member editor. It carries no photo, so
-- there is no storage object to sweep up alongside it -- verified before writing this.
--
-- Pinned to the row's id AND its name. The id alone would be enough, but a delete keyed on a
-- literal id is unreadable six months later, and one keyed on name alone would be a trap the
-- day somebody real is added whose name happens to be short. Requiring both means this can only
-- ever match the row it was written for.
--
-- Guarded the way the load-test cleanup should have been: it asserts the row was actually there
-- before deleting, not merely that none is there afterwards. "Nothing left to delete" and
-- "nothing was ever here" are the same query, and only one of them means the job was done.

set local statement_timeout = '60s';

DO $$
DECLARE
  v_deleted integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.hierarchy_members
     WHERE id = 'a29d35b9-9189-4b8e-bb45-265e65c2cca5' AND name = 'test'
  ) THEN
    RAISE EXCEPTION 'the test member was not found; it may already be gone, or the id has moved';
  END IF;

  DELETE FROM public.hierarchy_members
   WHERE id = 'a29d35b9-9189-4b8e-bb45-265e65c2cca5' AND name = 'test';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'expected to delete exactly 1 row, deleted %', v_deleted;
  END IF;
END
$$;
