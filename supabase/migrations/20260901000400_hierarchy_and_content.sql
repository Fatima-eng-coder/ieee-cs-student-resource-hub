-- Hierarchy roster, developer contact links, and the remaining public content collections.
--
-- Additive only: every statement is safe to run more than once. Policies are dropped and
-- recreated by name because CREATE POLICY has no IF NOT EXISTS; the whole migration runs in
-- one transaction, so no table is ever left unguarded.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_min_messages = warning;


-- ---------------------------------------------------------------------------------------
-- 1. HIERARCHY
-- ---------------------------------------------------------------------------------------

-- The role catalogue is the shape of the org chart, independent of who fills it.
-- "tier" is depth in the tree and "rank" orders siblings within a tier; both are plain ints
-- with gaps left between values so a role can be slotted between two others without
-- renumbering the rest.
CREATE TABLE IF NOT EXISTS "public"."hierarchy_roles" (
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "tier" integer DEFAULT 0 NOT NULL,
    "rank" integer DEFAULT 0 NOT NULL,
    "allows_multiple" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hierarchy_roles_pkey" PRIMARY KEY ("slug"),
    CONSTRAINT "hierarchy_roles_slug_format_check" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "hierarchy_roles_tier_check" CHECK (("tier" >= 0))
);

ALTER TABLE "public"."hierarchy_roles" OWNER TO "postgres";


-- One council per session. "is_current" is a flag rather than a position so the app never
-- has to assume the newest row is the serving council.
CREATE TABLE IF NOT EXISTS "public"."hierarchy_terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "term" "text" NOT NULL,
    "label" "text" NOT NULL,
    "is_current" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hierarchy_terms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hierarchy_terms_term_key" UNIQUE ("term"),
    CONSTRAINT "hierarchy_terms_term_check" CHECK (("btrim"("term") <> ''::"text")),
    CONSTRAINT "hierarchy_terms_label_check" CHECK (("btrim"("label") <> ''::"text"))
);

ALTER TABLE "public"."hierarchy_terms" OWNER TO "postgres";


-- "Exactly one term is current" is an invariant the public site depends on, so the database
-- enforces it instead of trusting whichever admin screen happens to write last. A partial
-- unique index over the constant true value permits any number of false rows and at most one
-- true row.
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_terms_single_current_idx"
    ON "public"."hierarchy_terms" (("is_current")) WHERE "is_current";


-- Members are NOT linked to public.profiles, and that is deliberate. The faculty advisor and
-- most joint secretaries have no login at all, and tying a roster row to an account would
-- mean that editing the org chart silently grants or revokes portal access. Roster and
-- authorisation are kept as two separate facts: portal permissions live in profiles.role,
-- the published council lives here.
CREATE TABLE IF NOT EXISTS "public"."hierarchy_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "term_id" "uuid" NOT NULL,
    "role_slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "seat" integer,
    "photo_url" "text",
    "photo_path" "text",
    "email" "text",
    "linkedin" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hierarchy_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hierarchy_members_name_check" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "hierarchy_members_seat_check" CHECK ((("seat" IS NULL) OR ("seat" > 0)))
);

ALTER TABLE "public"."hierarchy_members" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."hierarchy_members"
        ADD CONSTRAINT "hierarchy_members_term_id_fkey" FOREIGN KEY ("term_id")
        REFERENCES "public"."hierarchy_terms"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RESTRICT rather than CASCADE: retiring a role must not silently erase the people who held
-- it in past terms.
DO $$
BEGIN
    ALTER TABLE ONLY "public"."hierarchy_members"
        ADD CONSTRAINT "hierarchy_members_role_slug_fkey" FOREIGN KEY ("role_slug")
        REFERENCES "public"."hierarchy_roles"("slug") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "hierarchy_members_term_id_idx"
    ON "public"."hierarchy_members" USING "btree" ("term_id");

-- Ordering key for rendering a term's chart without a join back to the role catalogue.
CREATE INDEX IF NOT EXISTS "hierarchy_members_term_role_idx"
    ON "public"."hierarchy_members" USING "btree" ("term_id", "role_slug", "seat");

-- One person per role-seat per term. COALESCE keeps single-seat roles (seat IS NULL) inside
-- the same index instead of leaking through the NULLs-are-distinct rule, and it gives the
-- seed inserts below a conflict target so re-running this migration cannot duplicate a
-- council.
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_members_term_role_seat_key"
    ON "public"."hierarchy_members" USING "btree" ("term_id", "role_slug", (COALESCE("seat", 0)));


ALTER TABLE "public"."hierarchy_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."hierarchy_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."hierarchy_members" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read hierarchy roles" ON "public"."hierarchy_roles";
CREATE POLICY "Anyone can read hierarchy roles" ON "public"."hierarchy_roles"
    FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "Content managers can manage hierarchy roles" ON "public"."hierarchy_roles";
CREATE POLICY "Content managers can manage hierarchy roles" ON "public"."hierarchy_roles"
    TO "authenticated"
    USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"))
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

DROP POLICY IF EXISTS "Anyone can read hierarchy terms" ON "public"."hierarchy_terms";
CREATE POLICY "Anyone can read hierarchy terms" ON "public"."hierarchy_terms"
    FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "Content managers can manage hierarchy terms" ON "public"."hierarchy_terms";
CREATE POLICY "Content managers can manage hierarchy terms" ON "public"."hierarchy_terms"
    TO "authenticated"
    USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"))
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

DROP POLICY IF EXISTS "Anyone can read hierarchy members" ON "public"."hierarchy_members";
CREATE POLICY "Anyone can read hierarchy members" ON "public"."hierarchy_members"
    FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "Content managers can manage hierarchy members" ON "public"."hierarchy_members";
CREATE POLICY "Content managers can manage hierarchy members" ON "public"."hierarchy_members"
    TO "authenticated"
    USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"))
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

GRANT SELECT ON TABLE "public"."hierarchy_roles" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."hierarchy_roles" TO "authenticated";

GRANT SELECT ON TABLE "public"."hierarchy_terms" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."hierarchy_terms" TO "authenticated";

GRANT SELECT ON TABLE "public"."hierarchy_members" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."hierarchy_members" TO "authenticated";


-- Seed: the nine roles the app already ships in src/data/hierarchy.ts. DO NOTHING rather than
-- DO UPDATE so a title or rank an admin has since corrected is not overwritten by a re-run.
INSERT INTO "public"."hierarchy_roles" ("slug", "title", "tier", "rank", "allows_multiple")
VALUES
    ('faculty-advisor',    'Faculty Advisor',   0, 10, false),
    ('chairperson',        'Chairperson',       1, 10, false),
    ('vice-chairperson',   'Vice Chairperson',  2, 10, false),
    ('general-secretary',  'General Secretary', 3, 10, false),
    ('operations-manager', 'Operations Manager',4, 10, false),
    ('web-master',         'Web Master',        4, 20, false),
    ('treasurer',          'Treasurer',         4, 30, false),
    ('graphic-designer',   'Graphic Designer',  4, 40, false),
    ('joint-secretary',    'Joint Secretary',   5, 10, true)
ON CONFLICT ("slug") DO NOTHING;


INSERT INTO "public"."hierarchy_terms" ("term", "label", "is_current")
VALUES ('FA26', 'Fall 2026', true)
ON CONFLICT ("term") DO NOTHING;


-- photo_path stays NULL for the seeded roster: the placeholder is a static asset shipped with
-- the front end, not a storage object, so there is nothing for storageCleanupService to
-- delete. Real uploads must always write photo_url and photo_path together.
INSERT INTO "public"."hierarchy_members" ("term_id", "role_slug", "name", "seat", "photo_url")
SELECT "t"."id", "v"."role_slug", "v"."name", "v"."seat", '/brand-logo.png'
FROM "public"."hierarchy_terms" "t"
CROSS JOIN (VALUES
    ('faculty-advisor',    'Sir Muhammad Haris',           NULL::integer),
    ('chairperson',        'Hadiya Murad Hadi',            NULL),
    ('vice-chairperson',   'Wadeea Imran',                 NULL),
    ('general-secretary',  'Hammad Khaliq',                NULL),
    ('operations-manager', 'Muhammad Ahsan',               NULL),
    ('web-master',         'Shaharyar Zia',                NULL),
    ('treasurer',          'Fatima Azaz',                  NULL),
    ('graphic-designer',   'Areeba Sajjal',                NULL),
    ('joint-secretary',    'Arfa Zia',                     1),
    ('joint-secretary',    'Muhammad Talha',               2),
    ('joint-secretary',    'Rania Malik',                  3),
    ('joint-secretary',    'Muhammad Asad Ali',            4),
    ('joint-secretary',    'Muhammad Tayyab Alqan',        5),
    ('joint-secretary',    'Hania Zaki',                   6),
    ('joint-secretary',    'Mohammad Hashaam Sargaana',    7)
) AS "v"("role_slug", "name", "seat")
WHERE "t"."term" = 'FA26'
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------------------
-- 2. TERM PROMOTION
-- ---------------------------------------------------------------------------------------

-- Promoting a council is two changes that must never be observable apart: the outgoing term
-- stops being current and the incoming one starts. Split across two statements, the partial
-- unique index above would reject the second one, and an admin panel that crashed between
-- them would leave the site with no serving council. This does both inside a single INSERT:
-- the aggregate over the "cleared" CTE forces that UPDATE to run to completion before the
-- INSERT emits its row, so the index never sees two current terms. The CTE skips the incoming
-- term itself so the same row is never touched twice by one command.
--
-- SECURITY DEFINER because clearing the outgoing term means writing rows the caller may not
-- own; the authorisation check is therefore made explicitly in the body rather than left to
-- RLS, which a definer function bypasses.
CREATE OR REPLACE FUNCTION "public"."start_hierarchy_term"("new_term" "text", "new_label" "text")
RETURNS "public"."hierarchy_terms"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
declare
  promoted public.hierarchy_terms;
begin
  if not private.can_manage_content() then
    raise exception 'Only content managers can start a hierarchy term'
      using errcode = '42501';
  end if;

  if coalesce(btrim(new_term), '') = '' or coalesce(btrim(new_label), '') = '' then
    raise exception 'A term code and a label are both required'
      using errcode = '22023';
  end if;

  with cleared as (
    update public.hierarchy_terms
       set is_current = false
     where is_current
       and term <> btrim(new_term)
    returning 1
  )
  insert into public.hierarchy_terms (term, label, is_current)
  select btrim(new_term), btrim(new_label), true
    from (select count(*) from cleared) as run_cleared_first
  on conflict (term) do update
     set label = excluded.label,
         is_current = true
  returning * into promoted;

  return promoted;
end;
$$;

ALTER FUNCTION "public"."start_hierarchy_term"("new_term" "text", "new_label" "text") OWNER TO "postgres";

-- New functions are executable by PUBLIC by default, which for a definer function would let
-- anon reach the body. Only signed-in callers get to the role check inside.
REVOKE ALL ON FUNCTION "public"."start_hierarchy_term"("new_term" "text", "new_label" "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."start_hierarchy_term"("new_term" "text", "new_label" "text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."start_hierarchy_term"("new_term" "text", "new_label" "text") TO "authenticated";


-- ---------------------------------------------------------------------------------------
-- 3. DEVELOPER LINKS
-- ---------------------------------------------------------------------------------------

-- The developer roster itself (names, roles, bios, skills, photos) stays hardcoded in the
-- front end. Only the contact links are editable, and the admin may not add or remove a
-- developer. That rule is modelled instead of merely documented: there is no INSERT policy
-- and no DELETE policy on this table for any role, and neither privilege is granted, so the
-- row set is fixed by migration and cannot be changed through the API at all. TRUNCATE is
-- revoked as well because it is not subject to RLS and would otherwise be a way around this.
CREATE TABLE IF NOT EXISTS "public"."developer_links" (
    "slug" "text" NOT NULL,
    "portfolio_url" "text",
    "linkedin_url" "text",
    "email" "text",
    "github_url" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "developer_links_pkey" PRIMARY KEY ("slug")
);

ALTER TABLE "public"."developer_links" OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "developer_links_set_updated_at"
    BEFORE UPDATE ON "public"."developer_links"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

-- With INSERT and DELETE closed off, rewriting the primary key would be the last remaining
-- way to remove a developer: point the row at a slug the app does not know, and that
-- developer's links vanish from the site with no INSERT available to put them back.
CREATE OR REPLACE FUNCTION "public"."developer_links_freeze_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception 'Developer slugs are fixed by the application roster and cannot be changed'
    using errcode = '42501';
end;
$$;

ALTER FUNCTION "public"."developer_links_freeze_slug"() OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "developer_links_freeze_slug"
    BEFORE UPDATE ON "public"."developer_links"
    FOR EACH ROW WHEN (("new"."slug" IS DISTINCT FROM "old"."slug"))
    EXECUTE FUNCTION "public"."developer_links_freeze_slug"();

ALTER TABLE "public"."developer_links" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read developer links" ON "public"."developer_links";
CREATE POLICY "Anyone can read developer links" ON "public"."developer_links"
    FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "Content managers can update developer links" ON "public"."developer_links";
CREATE POLICY "Content managers can update developer links" ON "public"."developer_links"
    FOR UPDATE TO "authenticated"
    USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"))
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

GRANT SELECT ON TABLE "public"."developer_links" TO "anon";
GRANT SELECT, UPDATE ON TABLE "public"."developer_links" TO "authenticated";
REVOKE TRUNCATE ON TABLE "public"."developer_links" FROM "anon", "authenticated";

-- Slugs are the ids the front end already assigns in src/data/developers.ts; a row must exist
-- for every one of them or that developer's card silently loses its links.
INSERT INTO "public"."developer_links" ("slug", "portfolio_url", "linkedin_url", "email", "github_url", "phone")
VALUES
    ('dev-1', 'https://example.dev',    'https://linkedin.com', 'hamza.ahsan@example.edu', 'https://github.com', NULL),
    ('dev-2', NULL,                     'https://linkedin.com', NULL,                      'https://github.com', NULL),
    ('dev-3', 'https://example.design', 'https://linkedin.com', NULL,                      NULL,                 NULL),
    ('dev-4', NULL,                     NULL,                   'usman.riaz@example.edu',  'https://github.com', NULL),
    ('dev-5', NULL,                     'https://linkedin.com', 'sara.malik@example.edu',  NULL,                 NULL)
ON CONFLICT ("slug") DO NOTHING;


-- ---------------------------------------------------------------------------------------
-- 4. CONTENT COLLECTIONS
-- ---------------------------------------------------------------------------------------

-- 4a. Gallery -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."gallery_albums" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "cover_image_url" "text",
    "cover_image_path" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gallery_albums_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gallery_albums_title_check" CHECK (("btrim"("title") <> ''::"text"))
);

ALTER TABLE "public"."gallery_albums" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."gallery_albums"
        ADD CONSTRAINT "gallery_albums_created_by_fkey" FOREIGN KEY ("created_by")
        REFERENCES "auth"."users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- Photos cascade with their album: an album is the only thing that owns them, and orphaned
-- rows would keep storage objects referenced and therefore uncollectable. The admin delete
-- path still has to sweep image_path values out of the bucket before removing the album.
CREATE TABLE IF NOT EXISTS "public"."gallery_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "album_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "image_path" "text",
    "caption" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gallery_photos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gallery_photos_image_url_check" CHECK (("btrim"("image_url") <> ''::"text"))
);

ALTER TABLE "public"."gallery_photos" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."gallery_photos"
        ADD CONSTRAINT "gallery_photos_album_id_fkey" FOREIGN KEY ("album_id")
        REFERENCES "public"."gallery_albums"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE ONLY "public"."gallery_photos"
        ADD CONSTRAINT "gallery_photos_created_by_fkey" FOREIGN KEY ("created_by")
        REFERENCES "auth"."users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "gallery_albums_date_idx"
    ON "public"."gallery_albums" USING "btree" ("date" DESC);

CREATE INDEX IF NOT EXISTS "gallery_photos_album_id_idx"
    ON "public"."gallery_photos" USING "btree" ("album_id", "sort_order");

CREATE OR REPLACE TRIGGER "gallery_albums_set_updated_at"
    BEFORE UPDATE ON "public"."gallery_albums"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE "public"."gallery_albums" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."gallery_photos" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read gallery albums" ON "public"."gallery_albums";
CREATE POLICY "Anyone can read gallery albums" ON "public"."gallery_albums"
    FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "Content managers can manage gallery albums" ON "public"."gallery_albums";
CREATE POLICY "Content managers can manage gallery albums" ON "public"."gallery_albums"
    TO "authenticated"
    USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"))
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

DROP POLICY IF EXISTS "Anyone can read gallery photos" ON "public"."gallery_photos";
CREATE POLICY "Anyone can read gallery photos" ON "public"."gallery_photos"
    FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "Content managers can manage gallery photos" ON "public"."gallery_photos";
CREATE POLICY "Content managers can manage gallery photos" ON "public"."gallery_photos"
    TO "authenticated"
    USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"))
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

GRANT SELECT ON TABLE "public"."gallery_albums" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."gallery_albums" TO "authenticated";

GRANT SELECT ON TABLE "public"."gallery_photos" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."gallery_photos" TO "authenticated";


-- 4b. FAQs --------------------------------------------------------------------------------

-- Category is a CHECK on text, matching the FAQ union in src/types/index.ts. Widening it
-- later is one ALTER; a Postgres enum would be a type change plus a rewrite.
CREATE TABLE IF NOT EXISTS "public"."faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "category" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "faqs_question_check" CHECK (("btrim"("question") <> ''::"text")),
    CONSTRAINT "faqs_answer_check" CHECK (("btrim"("answer") <> ''::"text")),
    CONSTRAINT "faqs_category_check" CHECK (("category" = ANY (ARRAY['IEEE CS'::"text", 'Past Papers'::"text", 'Courses'::"text", 'Events'::"text", 'Navigation'::"text", 'Projects Expo'::"text", 'Contributions'::"text", 'Technical Issues'::"text"])))
);

ALTER TABLE "public"."faqs" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."faqs"
        ADD CONSTRAINT "faqs_created_by_fkey" FOREIGN KEY ("created_by")
        REFERENCES "auth"."users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "faqs_category_sort_idx"
    ON "public"."faqs" USING "btree" ("category", "sort_order");

CREATE OR REPLACE TRIGGER "faqs_set_updated_at"
    BEFORE UPDATE ON "public"."faqs"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE "public"."faqs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read faqs" ON "public"."faqs";
CREATE POLICY "Anyone can read faqs" ON "public"."faqs"
    FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "Content managers can manage faqs" ON "public"."faqs";
CREATE POLICY "Content managers can manage faqs" ON "public"."faqs"
    TO "authenticated"
    USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"))
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

GRANT SELECT ON TABLE "public"."faqs" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."faqs" TO "authenticated";


-- 4c. Quick links -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."quick_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "url" "text" NOT NULL,
    "category" "text" NOT NULL,
    "icon" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "quick_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quick_links_label_check" CHECK (("btrim"("label") <> ''::"text")),
    CONSTRAINT "quick_links_url_check" CHECK (("btrim"("url") <> ''::"text")),
    CONSTRAINT "quick_links_category_check" CHECK (("category" = ANY (ARRAY['University Portals'::"text", 'Academic Resources'::"text", 'Society Links'::"text", 'Forms'::"text", 'Event Links'::"text", 'Past Paper Links'::"text", 'Student Help'::"text"])))
);

ALTER TABLE "public"."quick_links" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."quick_links"
        ADD CONSTRAINT "quick_links_created_by_fkey" FOREIGN KEY ("created_by")
        REFERENCES "auth"."users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "quick_links_category_sort_idx"
    ON "public"."quick_links" USING "btree" ("category", "sort_order");

CREATE OR REPLACE TRIGGER "quick_links_set_updated_at"
    BEFORE UPDATE ON "public"."quick_links"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE "public"."quick_links" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read quick links" ON "public"."quick_links";
CREATE POLICY "Anyone can read quick links" ON "public"."quick_links"
    FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "Content managers can manage quick links" ON "public"."quick_links";
CREATE POLICY "Content managers can manage quick links" ON "public"."quick_links"
    TO "authenticated"
    USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"))
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

GRANT SELECT ON TABLE "public"."quick_links" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."quick_links" TO "authenticated";


-- 4d. Footer links ------------------------------------------------------------------------

-- Deliberately shaped like public.nav_links: a text primary key holding the id the front end
-- already uses, so the seeded rows line up with the app's own constants and a re-run cannot
-- duplicate them. The column is named "footer_column" rather than "column" because the latter
-- is a reserved word that every query would have to quote.
CREATE TABLE IF NOT EXISTS "public"."footer_links" (
    "id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "path" "text" NOT NULL,
    "footer_column" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "footer_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "footer_links_label_check" CHECK (("btrim"("label") <> ''::"text")),
    CONSTRAINT "footer_links_path_check" CHECK (("btrim"("path") <> ''::"text")),
    CONSTRAINT "footer_links_footer_column_check" CHECK (("footer_column" = ANY (ARRAY['Explore'::"text", 'Society'::"text", 'Support'::"text"])))
);

ALTER TABLE "public"."footer_links" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "footer_links_column_sort_idx"
    ON "public"."footer_links" USING "btree" ("footer_column", "sort_order");

CREATE OR REPLACE TRIGGER "footer_links_set_updated_at"
    BEFORE UPDATE ON "public"."footer_links"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE "public"."footer_links" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read footer links" ON "public"."footer_links";
CREATE POLICY "Anyone can read footer links" ON "public"."footer_links"
    FOR SELECT TO "authenticated", "anon" USING (true);

DROP POLICY IF EXISTS "Content managers can manage footer links" ON "public"."footer_links";
CREATE POLICY "Content managers can manage footer links" ON "public"."footer_links"
    TO "authenticated"
    USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"))
    WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

GRANT SELECT ON TABLE "public"."footer_links" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."footer_links" TO "authenticated";

-- Seeded so the footer is not blank the moment it starts reading from the database. The ids
-- are the app's own, so an admin who has already renamed or disabled one keeps that edit.
INSERT INTO "public"."footer_links" ("id", "label", "path", "footer_column", "sort_order")
VALUES
    ('fl-papers',      'Past Papers',           '/past-papers',         'Explore', 10),
    ('fl-courses',     'Courses',               '/courses',             'Explore', 20),
    ('fl-datesheets',  'Date Sheets',           '/date-sheets',         'Explore', 30),
    ('fl-events',      'Events',                '/events',              'Explore', 40),
    ('fl-projects',    'Projects Expo',         '/projects-expo',       'Explore', 50),
    ('fl-forms',       'Forms',                 '/forms',               'Explore', 60),
    ('fl-about',       'About Us',              '/about',               'Society', 10),
    ('fl-hierarchy',   'Hierarchy',             '/about/hierarchy',     'Society', 20),
    ('fl-timeline',    'Timeline',              '/about/timeline',      'Society', 30),
    ('fl-gallery',     'Gallery',               '/gallery',             'Society', 40),
    ('fl-developers',  'Developers',            '/developers',          'Society', 50),
    ('fl-contribute',  'Contribute',            '/contribute',          'Support', 10),
    ('fl-faq',         'FAQ & Contact',         '/faq-contact',         'Support', 20),
    ('fl-quicklinks',  'Quick Links',           '/quick-links',         'Support', 30),
    ('fl-privacy',     'Privacy & Disclaimer',  '/privacy-disclaimer',  'Support', 40)
ON CONFLICT ("id") DO NOTHING;


-- ---------------------------------------------------------------------------------------
-- 5. TRUNCATE
-- ---------------------------------------------------------------------------------------

-- ALTER DEFAULT PRIVILEGES on this schema hands TRUNCATE to anon and authenticated on every
-- table created in public. TRUNCATE is not filtered by row level security, so that grant
-- would let any signed-in student — or an anonymous visitor — empty these tables in one
-- statement while every policy above still reads as airtight. Taking it back on the tables
-- this migration creates costs nothing: the API never truncates, and service_role keeps its
-- own grant. The same exposure exists on the tables already live and is left alone here
-- because that is not this migration's call to make.
REVOKE TRUNCATE ON TABLE
    "public"."hierarchy_roles",
    "public"."hierarchy_terms",
    "public"."hierarchy_members",
    "public"."gallery_albums",
    "public"."gallery_photos",
    "public"."faqs",
    "public"."quick_links",
    "public"."footer_links"
FROM "anon", "authenticated";
