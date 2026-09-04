-- Make a navbar change say when it happened and who made it.
--
-- Somebody found three links switched off and there was no way to answer "who did this, and
-- when". nav_links carries an updated_at column, which looks like the answer and is not: there
-- is no trigger maintaining it and navLinksService never writes it, so it holds the insert time
-- for ever. Every row still reads 2026-08-26, the day the table was seeded, no matter how many
-- times it has been rewritten since. A column that looks like an audit trail and is not is
-- worse than no column, because it gets believed -- I believed it myself while investigating.
--
-- Two triggers rather than one: set_updated_at() is shared with the other content tables and
-- knows nothing about who is calling, and it is not worth changing its contract for this.

set local statement_timeout = '60s';


ALTER TABLE "public"."nav_links"
  ADD COLUMN IF NOT EXISTS "updated_by" "uuid";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."nav_links"
        ADD CONSTRAINT "nav_links_updated_by_fkey" FOREIGN KEY ("updated_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN "public"."nav_links"."updated_by" IS
  'Who last wrote this row, stamped server-side from auth.uid(). Not sent by the client, so it cannot be forged by one.';


-- Stamped in the database, not in the payload. A client-supplied "who did it" is worth nothing:
-- anyone holding the publishable key could write whatever name they liked into it.
CREATE OR REPLACE FUNCTION "private"."stamp_nav_link_author"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

ALTER FUNCTION "private"."stamp_nav_link_author"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "nav_links_stamp_author" ON "public"."nav_links";
CREATE TRIGGER "nav_links_stamp_author"
    BEFORE INSERT OR UPDATE ON "public"."nav_links"
    FOR EACH ROW EXECUTE FUNCTION "private"."stamp_nav_link_author"();

-- The missing half: this is what makes updated_at mean "last changed" rather than "created".
DROP TRIGGER IF EXISTS "nav_links_set_updated_at" ON "public"."nav_links";
CREATE TRIGGER "nav_links_set_updated_at"
    BEFORE UPDATE ON "public"."nav_links"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


-- Readable by the admin page, which is the only thing that shows it. anon has SELECT on this
-- table for the public navbar, and that read already returns every column, so there is nothing
-- to grant here -- noted so the absence does not look like an oversight.
