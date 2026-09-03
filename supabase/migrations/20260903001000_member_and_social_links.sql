-- Typed links: several per committee member, and the chapter's own social accounts.
--
-- Two separate problems with the same shape, so they get the same answer.
--
-- hierarchy_members has exactly two contact columns, `email` and `linkedin`. A committee member
-- with a portfolio, a GitHub and an Instagram has nowhere to put any of them, and adding a
-- column per platform means a migration every time somebody joins a new one.
--
-- The footer's social icons are hardcoded to https://instagram.com and https://linkedin.com —
-- the platforms'' own homepages, not this chapter's accounts. Nobody can fix that without a
-- deploy, which is the same class of problem as the banners: content living in the build.

set local statement_timeout = '120s';


-- ---------------------------------------------------------------------------------------
-- 1. A member's links
-- ---------------------------------------------------------------------------------------
--
-- jsonb rather than a child table. A member's links are only ever read with the member, never
-- queried across members, never joined and never counted — so a table would buy an id, a
-- foreign key and a second round trip on every roster read, for nothing anyone will use. The
-- CHECK below is what keeps it from becoming a junk drawer.
--
-- Shape: [{"type":"github","label":"","url":"https://…"}, …]
--   type   one of the platforms below, so the front end can pick an icon without guessing
--   label  optional override; empty means "use the platform's own name"
--   url    required, non-empty
--
-- `email` and `linkedin` stay exactly where they are. They are populated on nobody today, but
-- they are a published shape and dropping them in the same migration that introduces their
-- replacement would mean a window where a rollback loses data. Section 3 folds any values into
-- the new array; the columns can be retired later, once nothing reads them.

ALTER TABLE "public"."hierarchy_members"
  ADD COLUMN IF NOT EXISTS "links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL;

-- A CHECK may not contain a subquery, and validating every element of a jsonb array needs one.
-- It may call an IMMUTABLE function, so the loop lives here instead. IMMUTABLE is honest: the
-- result depends on nothing but the argument.
CREATE OR REPLACE FUNCTION "private"."valid_member_links"("value" "jsonb")
RETURNS boolean
LANGUAGE "sql"
IMMUTABLE
AS $$
  select jsonb_typeof(value) = 'array'
     and jsonb_array_length(value) <= 8
     and not exists (
       select 1
       from jsonb_array_elements(value) as entry
       where jsonb_typeof(entry) <> 'object'
          or entry->>'url' is null
          or btrim(entry->>'url') = ''
          or length(entry->>'url') > 500
          or entry->>'type' not in (
               'portfolio', 'github', 'linkedin', 'instagram',
               'facebook', 'x', 'youtube', 'email', 'other'
             )
     );
$$;

ALTER FUNCTION "private"."valid_member_links"("value" "jsonb") OWNER TO "postgres";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "pg_constraint"
    WHERE "conname" = 'hierarchy_members_links_check'
      AND "conrelid" = 'public.hierarchy_members'::"regclass"
  ) THEN
    ALTER TABLE "public"."hierarchy_members"
      ADD CONSTRAINT "hierarchy_members_links_check"
      CHECK ("private"."valid_member_links"("links"));
  END IF;
END
$$;

COMMENT ON COLUMN "public"."hierarchy_members"."links" IS
  'Typed contact links, [{type,label,url}]. jsonb because they are only ever read with the member -- never queried across members -- and a column per platform would mean a migration every time somebody joins a new one.';


-- ---------------------------------------------------------------------------------------
-- 2. The chapter's social accounts
-- ---------------------------------------------------------------------------------------
--
-- A table, not jsonb, because this IS queried on its own: the footer reads it without reading
-- anything else, and it is ordered and toggled independently. Same shape as the other site
-- content tables so it inherits their admin patterns.

CREATE TABLE IF NOT EXISTS "public"."social_links" (
    "id"          "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform"    "text" NOT NULL,
    "url"         "text" NOT NULL,
    "label"       "text" DEFAULT '' NOT NULL,
    "is_published" boolean DEFAULT true NOT NULL,
    "sort_order"  integer DEFAULT 0 NOT NULL,
    "created_by"  "uuid",
    "created_at"  timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at"  timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "social_links_url_check" CHECK ("btrim"("url") <> '' AND "length"("url") <= 500),
    CONSTRAINT "social_links_platform_check"
      CHECK ("platform" IN ('instagram', 'linkedin', 'facebook', 'x', 'youtube', 'github', 'website', 'email')),
    -- One account per platform. Two Instagram rows is a mistake every time, and the footer has
    -- no way to say which is the real one.
    CONSTRAINT "social_links_platform_key" UNIQUE ("platform")
);

ALTER TABLE "public"."social_links" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."social_links"
        ADD CONSTRAINT "social_links_created_by_fkey" FOREIGN KEY ("created_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "social_links_published_idx"
    ON "public"."social_links" ("is_published", "sort_order");

CREATE OR REPLACE TRIGGER "social_links_set_updated_at"
    BEFORE UPDATE ON "public"."social_links"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

GRANT SELECT ON TABLE "public"."social_links" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."social_links" TO "authenticated";

ALTER TABLE "public"."social_links" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read published social links" ON "public"."social_links";
CREATE POLICY "Anyone can read published social links" ON "public"."social_links"
    FOR SELECT TO "anon", "authenticated" USING ("is_published");

DROP POLICY IF EXISTS "Content managers can manage social links" ON "public"."social_links";
CREATE POLICY "Content managers can manage social links" ON "public"."social_links"
    TO "authenticated"
    USING ((SELECT "private"."can_manage_content"()))
    WITH CHECK ((SELECT "private"."can_manage_content"()));

COMMENT ON TABLE "public"."social_links" IS
  'The chapter''s own social accounts, shown in the footer. Replaces hardcoded links to instagram.com and linkedin.com -- the platforms'' own homepages rather than this chapter''s profiles.';


-- ---------------------------------------------------------------------------------------
-- 3. Fold any existing member contacts into the new array
-- ---------------------------------------------------------------------------------------
--
-- Nobody has an email or a linkedin set today, so this moves nothing in practice. It is written
-- anyway: "the table is empty" is only true the first time this runs, and a member who did have
-- one must not lose it the moment the front end starts reading `links` instead.

UPDATE public.hierarchy_members
   SET links = (
         SELECT coalesce(jsonb_agg(entry), '[]'::jsonb)
         FROM (
           SELECT jsonb_build_object('type', 'linkedin', 'label', '', 'url', btrim(linkedin)) AS entry
           WHERE linkedin IS NOT NULL AND btrim(linkedin) <> ''
           UNION ALL
           SELECT jsonb_build_object('type', 'email', 'label', '', 'url', 'mailto:' || btrim(email))
           WHERE email IS NOT NULL AND btrim(email) <> ''
         ) AS folded
       )
 WHERE links = '[]'::jsonb
   AND ((linkedin IS NOT NULL AND btrim(linkedin) <> '')
     OR (email IS NOT NULL AND btrim(email) <> ''));
