-- Take TRUNCATE away from anon and authenticated on every table in public.
--
-- The project's ALTER DEFAULT PRIVILEGES grants TRUNCATE to both roles on everything created
-- in this schema. TRUNCATE is not filtered by row-level security and leaves no rows behind to
-- audit, so a single request carrying nothing but the public anon key can empty a table while
-- every policy on it still reads as airtight. Reproduced against a copy of this schema:
--
--     set role anon;
--     truncate table public.profiles;        -- 5 rows -> 0
--     truncate table public.course_materials; -- cascades to course_prerequisites
--
-- Nothing in the app has ever needed TRUNCATE — deletes go through DELETE, which RLS does
-- filter. Two of the new migrations already revoke it on the tables they create; this closes
-- the same hole on the tables that were already here, which are the ones holding real data.
--
-- Written as a loop over the catalogue rather than a fixed list so a table added later is
-- covered the next time this runs, and so it cannot drift out of step with the schema.

set local statement_timeout = '120s';

DO $$
DECLARE
  target regclass;
BEGIN
  FOR target IN
    SELECT c.oid::regclass
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON TABLE %s FROM anon, authenticated', target);
  END LOOP;
END
$$;

-- Stop the default from handing it back on the next table anyone creates. Scoped to the roles
-- that create objects here, matching how the existing defaults were granted.
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE TRUNCATE ON TABLES FROM "anon";
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE TRUNCATE ON TABLES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE TRUNCATE ON TABLES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE TRUNCATE ON TABLES FROM "authenticated";
