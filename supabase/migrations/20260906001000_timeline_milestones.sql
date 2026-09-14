-- The chapter timeline, moved out of src/data/timeline.ts and into a table the team can edit.
--
-- What shipped in that file was invented: a founding date, a first hackathon, a membership
-- count, a regional award. A visitor has no way to tell a made-up milestone from a real one,
-- so none of it is carried across here. The table starts EMPTY on purpose and the public page
-- says as much until somebody records something that actually happened.
--
-- A milestone is a date, a heading and a description. Nothing else: no photo, no link, no
-- published flag. Anything in this table is on the public page, which is the same rule the FAQ
-- and quick-link tables run on, and it keeps the editor down to the three fields that were
-- asked for rather than a form of switches nobody set.

CREATE TABLE IF NOT EXISTS "public"."timeline_milestones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,

    -- A date, not a timestamptz. A milestone happened on a day, not at an instant; storing an
    -- instant would put it on the wrong side of midnight for anyone reading in another
    -- timezone, and there is no hour of the day to record in the first place.
    "happened_on" "date" NOT NULL,

    "title" "text" NOT NULL,

    -- Optional, and NOT NULL DEFAULT '' rather than nullable so "left blank" and "cleared" are
    -- the same stored value. A date and a heading are a perfectly good milestone -- "Chapter
    -- founded" needs no gloss -- and refusing to save one would only get filler prose typed
    -- into a field that then shows on the public page.
    "description" "text" DEFAULT ''::"text" NOT NULL,

    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "timeline_milestones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timeline_milestones_title_check" CHECK (("btrim"("title") <> ''::"text")),

    -- A typo'd year is the mistake this field actually attracts, and an 0202 or a 20255 would
    -- drag the whole rail out to a scale where every real milestone lands on the same pixel.
    -- 1963 is when the IEEE itself was formed, so nothing true can fall below it. Fixed dates
    -- rather than now(): a CHECK containing now() is not reproducible on a dump and restore.
    CONSTRAINT "timeline_milestones_happened_on_check"
        CHECK (("happened_on" >= '1963-01-01'::"date" AND "happened_on" <= '2100-12-31'::"date"))
);

ALTER TABLE "public"."timeline_milestones" OWNER TO "postgres";

-- ON DELETE SET NULL, unlike the plain reference faqs carries. delete_student_account() clears
-- created_by table by table before removing a login, and a table it has never heard of would
-- abort that delete with a foreign-key error rather than a sentence anyone can act on. Only a
-- content manager can write here, and that function already refuses to delete an account that
-- holds one of those roles -- but roles change, and a demoted chairperson who once added a
-- milestone would otherwise be undeletable for a reason nothing on screen explains.
DO $$
BEGIN
    ALTER TABLE ONLY "public"."timeline_milestones"
        ADD CONSTRAINT "timeline_milestones_created_by_fkey" FOREIGN KEY ("created_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Both the public page and the admin table read this in date order, and it is the only order
-- either of them ever asks for.
CREATE INDEX IF NOT EXISTS "timeline_milestones_happened_on_idx"
    ON "public"."timeline_milestones" USING "btree" ("happened_on");

CREATE OR REPLACE TRIGGER "timeline_milestones_set_updated_at"
    BEFORE UPDATE ON "public"."timeline_milestones"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE "public"."timeline_milestones" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read timeline milestones" ON "public"."timeline_milestones";
CREATE POLICY "Anyone can read timeline milestones" ON "public"."timeline_milestones"
    FOR SELECT TO "authenticated", "anon" USING (true);

-- The same four roles that manage every other piece of site content: chairperson,
-- vice chairperson, general secretary, webmaster. private.can_manage_content() is the single
-- definition of that set, so this table cannot drift out of step with the rest of the portal.
DROP POLICY IF EXISTS "Content managers can manage timeline milestones" ON "public"."timeline_milestones";
CREATE POLICY "Content managers can manage timeline milestones" ON "public"."timeline_milestones"
    TO "authenticated"
    USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"))
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

GRANT SELECT ON TABLE "public"."timeline_milestones" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."timeline_milestones" TO "authenticated";

-- ALTER DEFAULT PRIVILEGES on this schema hands TRUNCATE to anon and authenticated on every
-- new table. TRUNCATE ignores row level security entirely, so leaving it would let any signed-in
-- student empty the whole timeline in one statement while the policies above still read as
-- airtight. Same reasoning, same REVOKE as the tables in 20260901000400.
REVOKE TRUNCATE ON TABLE "public"."timeline_milestones" FROM "anon", "authenticated";
