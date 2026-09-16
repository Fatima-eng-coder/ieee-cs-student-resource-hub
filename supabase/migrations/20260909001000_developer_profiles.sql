-- The credits page: who built this hub, and the part of each entry the team can keep current.
--
-- The split between code and database is deliberate and is the same one the old table made.
-- A person's NAME and the WORK they are credited with are authored in src/data/developers.ts:
-- they are the record, they change about once a year, and an admin screen able to rewrite them is
-- a way to lose or misattribute somebody's work with one click. Everything that genuinely goes
-- stale -- a portrait, a job title that changes when somebody graduates, a LinkedIn that moves --
-- lives here, where any content manager can update it.
--
-- This replaces public.developer_links, which could not hold the page that is now wanted:
--
--   * five fixed link columns (portfolio, linkedin, email, github, phone) and no Instagram, so a
--     platform nobody listed in 2026 meant a schema change;
--   * no photo and no designation, both of which are now editable by request;
--   * and five rows of invented contact details -- hamza.ahsan@example.edu, a bare
--     https://linkedin.com -- for five invented people who were removed from the roster. Checked
--     against the live table before writing this: every row still held exactly its seed values
--     and none had been touched since the migration that created them, so nothing real is lost.

set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."developer_profiles" (
    -- The join key to the roster in src/data/developers.ts. Kebab-case by constraint, so a typo'd
    -- slug is refused rather than stored as a row nothing on the page will ever read.
    "slug" "text" NOT NULL,

    -- "Operations Manager IEEE CS CUI". Free text rather than a role reference: it describes a
    -- person as the credits page should name them, which for a founder is "Ex-Chairperson" -- a
    -- role no current roster holds.
    "designation" "text" DEFAULT ''::"text" NOT NULL,

    -- A url AND a path, the same pairing hierarchy_members keeps: the url is what renders, and
    -- the path is what a later replacement needs in order to delete the old file. A row holding
    -- only the url owns a file it can never clean up.
    "photo_url" "text",
    "photo_path" "text",

    -- Which placeholder portrait to draw when there is no photo. Same three values and the same
    -- reasoning as hierarchy_members.gender: 'unknown' is the honest default, and the seed below
    -- copies what the team already recorded rather than inferring anything from a name.
    "gender" "text" DEFAULT 'unknown'::"text" NOT NULL,

    -- Any number of typed links, the shape hierarchy_members.links already uses and the admin
    -- already knows how to edit. Validated by the same function, so the two cannot drift.
    "links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,

    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "developer_profiles_pkey" PRIMARY KEY ("slug"),
    CONSTRAINT "developer_profiles_slug_check"
        CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$') AND length("slug") <= 80),
    CONSTRAINT "developer_profiles_designation_check" CHECK (length("designation") <= 120),
    CONSTRAINT "developer_profiles_gender_check"
        CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'unknown'::"text"]))),
    CONSTRAINT "developer_profiles_links_check" CHECK ("private"."valid_member_links"("links")),
    -- Both halves of a photo reference or neither: a path with no url is an invisible file, and a
    -- url with no path is one nothing can ever delete. An external url with no path is allowed,
    -- because a portrait linked from elsewhere has no object in our bucket to manage.
    CONSTRAINT "developer_profiles_photo_check" CHECK (("photo_path" IS NULL) OR ("photo_url" IS NOT NULL))
);

ALTER TABLE "public"."developer_profiles" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."developer_profiles"
        ADD CONSTRAINT "developer_profiles_updated_by_fkey" FOREIGN KEY ("updated_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE TRIGGER "developer_profiles_set_updated_at"
    BEFORE UPDATE ON "public"."developer_profiles"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

-- A slug is the key the roster in code joins on. Rewriting one would detach a person's photo and
-- links from them with no error anywhere -- the page would simply show them bare -- so it is
-- refused outright. The old table had the same guard, for the same reason.
CREATE OR REPLACE FUNCTION "private"."developer_profiles_freeze_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception 'A developer''s slug is fixed by the roster in the site''s code and cannot be changed'
    using errcode = '42501';
end;
$$;

ALTER FUNCTION "private"."developer_profiles_freeze_slug"() OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "developer_profiles_freeze_slug"
    BEFORE UPDATE ON "public"."developer_profiles"
    FOR EACH ROW WHEN (("new"."slug" IS DISTINCT FROM "old"."slug"))
    EXECUTE FUNCTION "private"."developer_profiles_freeze_slug"();

-- ---------------------------------------------------------------------------------------
-- 2. Access
-- ---------------------------------------------------------------------------------------

ALTER TABLE "public"."developer_profiles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read developer profiles" ON "public"."developer_profiles";
CREATE POLICY "Anyone can read developer profiles" ON "public"."developer_profiles"
    FOR SELECT TO "authenticated", "anon" USING (true);

-- INSERT is granted this time, unlike on the old table, and it is safe for a specific reason:
-- a row here cannot add a person to the page. Who appears is decided by the roster in code, and
-- a row for a slug the roster does not name is simply never read. What INSERT buys is that
-- adding somebody to src/data/developers.ts is the ONLY edit needed -- the admin screen creates
-- their row on first save -- instead of also needing a migration nobody remembers to write.
DROP POLICY IF EXISTS "Content managers can add developer profiles" ON "public"."developer_profiles";
CREATE POLICY "Content managers can add developer profiles" ON "public"."developer_profiles"
    FOR INSERT TO "authenticated"
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

DROP POLICY IF EXISTS "Content managers can update developer profiles" ON "public"."developer_profiles";
CREATE POLICY "Content managers can update developer profiles" ON "public"."developer_profiles"
    FOR UPDATE TO "authenticated"
    USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"))
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

-- Still no DELETE, for anyone. Removing a row would silently strip a credited person's photo and
-- links, and there is no case where that is the thing an admin meant.
GRANT SELECT ON TABLE "public"."developer_profiles" TO "anon";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."developer_profiles" TO "authenticated";
REVOKE TRUNCATE ON TABLE "public"."developer_profiles" FROM "anon", "authenticated";

COMMENT ON TABLE "public"."developer_profiles" IS
    'Editable half of the credits page: portrait, designation, placeholder gender and links. Names '
    'and credited work are authored in src/data/developers.ts, keyed by slug.';

-- ---------------------------------------------------------------------------------------
-- 3. Seed
-- ---------------------------------------------------------------------------------------

-- Designations exactly as the team supplied them. The five brainstormers were given no title,
-- so theirs start empty and render as nothing rather than as an invented one.
--
-- Genders are NOT guessed from names. Every one of these nine people already has a row in
-- hierarchy_members with a gender the team set there, and each value below was read from that
-- record (Syed Abbas Raza is listed there as "S. Abbas Raza"). All are editable from the admin
-- screen; they only choose which placeholder is drawn until a real photo is uploaded.
INSERT INTO "public"."developer_profiles" ("slug", "designation", "gender")
VALUES
    ('syed-abbas-raza',   'Ex-Chairperson IEEE CS CUI',     'male'),
    ('muhammad-ahsan',    'Operations Manager IEEE CS CUI', 'male'),
    ('fatima-azaz',       'Treasurer IEEE CS CUI',          'female'),
    ('shaharyar-zia',     'Web Master IEEE CS CUI',         'male'),
    ('hammad-khaliq',     '',                               'male'),
    ('areeba-sajjal',     '',                               'female'),
    ('wadeea-imran',      '',                               'female'),
    ('muhammad-asad-ali', '',                               'male'),
    ('hadiya-murad-hadi', '',                               'female')
-- DO NOTHING, so re-running this never overwrites a designation or gender an admin has since
-- corrected.
ON CONFLICT ("slug") DO NOTHING;

-- ---------------------------------------------------------------------------------------
-- 4. Retire the old table
-- ---------------------------------------------------------------------------------------

-- The front end that read developer_links treats a missing table as "no links yet"
-- (isMissingTable in the old developerLinksService), so a deployment still running that code
-- keeps rendering rather than erroring while this change is rolled out. Its roster is empty in
-- any case, so there is nothing for it to show.
DROP TABLE IF EXISTS "public"."developer_links";
DROP FUNCTION IF EXISTS "public"."developer_links_freeze_slug"();
