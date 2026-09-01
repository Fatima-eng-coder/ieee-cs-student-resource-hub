-- The last things the site keeps in the visitor's own browser.
--
-- Three of them are student submissions, and those are the urgent ones. Registering for an
-- event, reporting a broken route and writing to the team through the contact form all end in
-- appendToStorage('ieeecs_submissions', ...) -- a write to localStorage on the student's own
-- machine. Nobody on the committee has ever been able to read one. The form appears to work,
-- says thank you, and drops the message. For a society about to take real traffic that is the
-- most expensive bug in the codebase, so these three tables come first.
--
-- The other three are admin-managed content still living on whichever laptop last edited it:
-- promotional banners, exam date sheets, and the student project showcase.
--
-- Deliberately NOT given a table: the navigation "destinations" collection. Nothing outside its
-- own admin page reads it, and the rooms it lists are placeholders that do not exist in the
-- building. The real map is the surveyed dataset in the repo, which is shared verbatim with the
-- separate 3D navigator project -- moving it into a table here would fork it from the copy that
-- project reads and leave the two silently disagreeing. That page needs replacing, not backing.

set local statement_timeout = '120s';


-- ---------------------------------------------------------------------------------------
-- 1. Event registrations
-- ---------------------------------------------------------------------------------------
--
-- The fallback registration path, used by any event with no form attached. An event WITH an
-- internal form sends students to /forms/:id and collects through form_responses instead.

CREATE TABLE IF NOT EXISTS "public"."event_registrations" (
    "id"            "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id"      "uuid" NOT NULL,
    "name"          "text" NOT NULL,
    "email"         "text" NOT NULL,
    "roll_number"   "text",
    "batch"         "text",
    -- Stamped server-side by private.stamp_student_email(), never sent by the browser. The
    -- `email` column above is what the student typed and may be any address; this is the
    -- identity a deleted-and-rebuilt account is re-linked by.
    "student_email" "text",
    "submitted_by"  "uuid",
    "created_at"    timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_registrations_name_check"  CHECK ("btrim"("name") <> ''),
    CONSTRAINT "event_registrations_email_check" CHECK ("strpos"("email", '@') > 1)
);

ALTER TABLE "public"."event_registrations" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."event_registrations"
        ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id")
        REFERENCES "public"."events"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- SET NULL, so deleting an account keeps the registration and detaches it the way every other
-- contribution does -- and so delete_student_account() does not have to learn one more table
-- to avoid a foreign key violation.
DO $$
BEGIN
    ALTER TABLE ONLY "public"."event_registrations"
        ADD CONSTRAINT "event_registrations_submitted_by_fkey" FOREIGN KEY ("submitted_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One registration per address per event. Case-insensitive because students type their address
-- inconsistently, and two spellings of one person is a headcount that lies to whoever is
-- ordering the food. A repeat conflicts (23505) and is reported as "already registered".
CREATE UNIQUE INDEX IF NOT EXISTS "event_registrations_one_per_email_idx"
    ON "public"."event_registrations" ("event_id", "lower"("email"));

CREATE INDEX IF NOT EXISTS "event_registrations_event_id_idx"
    ON "public"."event_registrations" ("event_id", "created_at" DESC);


-- ---------------------------------------------------------------------------------------
-- 2. Contact messages
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id"            "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name"          "text" NOT NULL,
    "email"         "text" NOT NULL,
    "category"      "text" NOT NULL,
    "message"       "text" NOT NULL,
    "status"        "text" DEFAULT 'pending' NOT NULL,
    "student_email" "text",
    "submitted_by"  "uuid",
    "handled_by"    "uuid",
    "handled_at"    timestamp with time zone,
    "created_at"    timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_messages_name_check"    CHECK ("btrim"("name") <> ''),
    CONSTRAINT "contact_messages_email_check"   CHECK ("strpos"("email", '@') > 1),
    -- Bounded so one submission cannot be used to push megabytes into the table.
    CONSTRAINT "contact_messages_message_check" CHECK ("length"("btrim"("message")) BETWEEN 1 AND 4000),
    CONSTRAINT "contact_messages_status_check"  CHECK ("status" IN ('pending', 'handled', 'archived'))
);

ALTER TABLE "public"."contact_messages" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."contact_messages"
        ADD CONSTRAINT "contact_messages_submitted_by_fkey" FOREIGN KEY ("submitted_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE ONLY "public"."contact_messages"
        ADD CONSTRAINT "contact_messages_handled_by_fkey" FOREIGN KEY ("handled_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "contact_messages_status_idx"
    ON "public"."contact_messages" ("status", "created_at" DESC);


-- ---------------------------------------------------------------------------------------
-- 3. Navigation reports
-- ---------------------------------------------------------------------------------------
--
-- A student saying "this route is wrong". The building dataset is surveyed by hand, so this
-- queue is the only channel through which a survey error can find its way back.

CREATE TABLE IF NOT EXISTS "public"."navigation_reports" (
    "id"            "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route"         "text" NOT NULL,
    "issue"         "text" NOT NULL,
    "reporter_name" "text",
    "status"        "text" DEFAULT 'pending' NOT NULL,
    "student_email" "text",
    "submitted_by"  "uuid",
    "reviewed_by"   "uuid",
    "reviewed_at"   timestamp with time zone,
    "created_at"    timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "navigation_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "navigation_reports_route_check"  CHECK ("btrim"("route") <> ''),
    CONSTRAINT "navigation_reports_issue_check"  CHECK ("length"("btrim"("issue")) BETWEEN 1 AND 2000),
    CONSTRAINT "navigation_reports_status_check" CHECK ("status" IN ('pending', 'fixed', 'rejected'))
);

ALTER TABLE "public"."navigation_reports" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."navigation_reports"
        ADD CONSTRAINT "navigation_reports_submitted_by_fkey" FOREIGN KEY ("submitted_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE ONLY "public"."navigation_reports"
        ADD CONSTRAINT "navigation_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "navigation_reports_status_idx"
    ON "public"."navigation_reports" ("status", "created_at" DESC);


-- ---------------------------------------------------------------------------------------
-- 4. Site banners
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."site_banners" (
    "id"               "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title"            "text" NOT NULL,
    "subtitle"         "text" DEFAULT '' NOT NULL,
    "image_url"        "text",
    "image_path"       "text",
    "cta_label"        "text" DEFAULT '' NOT NULL,
    "cta_link"         "text" DEFAULT '' NOT NULL,
    "banner_type"      "text" DEFAULT 'announcement' NOT NULL,
    "is_published"     boolean DEFAULT true NOT NULL,
    "sort_order"       integer DEFAULT 0 NOT NULL,
    "created_by"       "uuid",
    "created_at"       timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at"       timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "site_banners_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_banners_title_check" CHECK ("btrim"("title") <> ''),
    CONSTRAINT "site_banners_type_check"
        CHECK ("banner_type" IN ('sponsor', 'workshop', 'announcement', 'partner', 'campaign')),
    -- A call to action with a label and nowhere to go is a dead button; both or neither.
    CONSTRAINT "site_banners_cta_check"
        CHECK (("btrim"("cta_label") = '') = ("btrim"("cta_link") = ''))
);

ALTER TABLE "public"."site_banners" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."site_banners"
        ADD CONSTRAINT "site_banners_created_by_fkey" FOREIGN KEY ("created_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "site_banners_published_idx"
    ON "public"."site_banners" ("is_published", "sort_order");

CREATE OR REPLACE TRIGGER "site_banners_set_updated_at"
    BEFORE UPDATE ON "public"."site_banners"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


-- ---------------------------------------------------------------------------------------
-- 5. Date sheets
-- ---------------------------------------------------------------------------------------
--
-- The file lives in the existing course-documents bucket under a date-sheets/ prefix rather
-- than in a new bucket of its own: it is the same kind of object, published to the same
-- audience, under the same content-manager write policies that already cover that bucket.

CREATE TABLE IF NOT EXISTS "public"."date_sheets" (
    "id"            "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title"         "text" NOT NULL,
    "program"       "text" NOT NULL,
    "semester"      integer NOT NULL,
    "term"          "text" NOT NULL,
    "year"          integer NOT NULL,
    "file_url"      "text",
    "file_path"     "text",
    "is_published"  boolean DEFAULT false NOT NULL,
    "created_by"    "uuid",
    "created_at"    timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at"    timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "date_sheets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "date_sheets_title_check"    CHECK ("btrim"("title") <> ''),
    CONSTRAINT "date_sheets_semester_check" CHECK ("semester" BETWEEN 1 AND 12),
    -- Wide enough to hold an archive and to be entered a year ahead, narrow enough that a
    -- mistyped year is caught at the point of entry.
    CONSTRAINT "date_sheets_year_check"     CHECK ("year" BETWEEN 2000 AND 2100),
    CONSTRAINT "date_sheets_term_check"     CHECK ("btrim"("term") <> ''),
    -- Publishing a date sheet with no sheet attached is the one state that is never useful.
    CONSTRAINT "date_sheets_published_needs_file_check"
        CHECK (NOT "is_published" OR ("file_url" IS NOT NULL AND "btrim"("file_url") <> ''))
);

ALTER TABLE "public"."date_sheets" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."date_sheets"
        ADD CONSTRAINT "date_sheets_created_by_fkey" FOREIGN KEY ("created_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "date_sheets_lookup_idx"
    ON "public"."date_sheets" ("is_published", "year" DESC, "program", "semester");

CREATE OR REPLACE TRIGGER "date_sheets_set_updated_at"
    BEFORE UPDATE ON "public"."date_sheets"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


-- ---------------------------------------------------------------------------------------
-- 6. Project showcase
-- ---------------------------------------------------------------------------------------
--
-- Student-submitted, so it is moderated: a row is only public once a content manager has
-- approved it. The public page is behind a coming-soon screen today, which does not change
-- what this table has to be -- the admin can start collecting now, and turning the page on
-- later must not mean discovering the data was never stored.

CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id"           "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title"        "text" NOT NULL,
    "tagline"      "text" DEFAULT '' NOT NULL,
    "description"  "text" DEFAULT '' NOT NULL,
    "creators"     "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tech_stack"   "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "screenshots"  "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "image_paths"  "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "github_url"   "text",
    "demo_url"     "text",
    "category"     "text",
    "status"       "text" DEFAULT 'pending' NOT NULL,
    "author_name"  "text" DEFAULT '' NOT NULL,
    "author_id"    "uuid",
    "student_email" "text",
    "reviewed_by"  "uuid",
    "reviewed_at"  timestamp with time zone,
    "created_at"   timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at"   timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "projects_title_check"  CHECK ("btrim"("title") <> ''),
    CONSTRAINT "projects_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
    CONSTRAINT "projects_creators_array_check"    CHECK ("jsonb_typeof"("creators") = 'array'),
    CONSTRAINT "projects_tech_array_check"        CHECK ("jsonb_typeof"("tech_stack") = 'array'),
    CONSTRAINT "projects_screenshots_array_check" CHECK ("jsonb_typeof"("screenshots") = 'array'),
    -- Mirrors event_image_submissions: a path per screenshot, so the admin delete path can
    -- sweep the bucket without guessing which file belonged to which row.
    CONSTRAINT "projects_image_paths_check"
        CHECK ("jsonb_typeof"("image_paths") = 'array'
               AND "jsonb_array_length"("image_paths") = "jsonb_array_length"("screenshots")),
    CONSTRAINT "projects_screenshot_count_check"  CHECK ("jsonb_array_length"("screenshots") <= 3)
);

ALTER TABLE "public"."projects" OWNER TO "postgres";

DO $$
BEGIN
    ALTER TABLE ONLY "public"."projects"
        ADD CONSTRAINT "projects_author_id_fkey" FOREIGN KEY ("author_id")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE ONLY "public"."projects"
        ADD CONSTRAINT "projects_reviewed_by_fkey" FOREIGN KEY ("reviewed_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "projects_status_idx"
    ON "public"."projects" ("status", "created_at" DESC);

CREATE OR REPLACE TRIGGER "projects_set_updated_at"
    BEFORE UPDATE ON "public"."projects"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


-- ---------------------------------------------------------------------------------------
-- 7. student_email is stamped by the server on every one of the submission tables
-- ---------------------------------------------------------------------------------------
--
-- Same reasoning as 20260901000100 section 4.5: anon can insert into these tables and their
-- policies cannot check a column identifying a caller who has no identity. If the client could
-- write student_email, anyone holding the publishable key could file rows under a victim's
-- address and have relink_student_activity() hand them over. The value is derived from
-- auth.uid() and whatever the browser sent is discarded.

CREATE OR REPLACE TRIGGER "event_registrations_stamp_student_email"
    BEFORE INSERT OR UPDATE ON "public"."event_registrations"
    FOR EACH ROW EXECUTE FUNCTION "private"."stamp_student_email"();

CREATE OR REPLACE TRIGGER "contact_messages_stamp_student_email"
    BEFORE INSERT OR UPDATE ON "public"."contact_messages"
    FOR EACH ROW EXECUTE FUNCTION "private"."stamp_student_email"();

CREATE OR REPLACE TRIGGER "navigation_reports_stamp_student_email"
    BEFORE INSERT OR UPDATE ON "public"."navigation_reports"
    FOR EACH ROW EXECUTE FUNCTION "private"."stamp_student_email"();

CREATE OR REPLACE TRIGGER "projects_stamp_student_email"
    BEFORE INSERT OR UPDATE ON "public"."projects"
    FOR EACH ROW EXECUTE FUNCTION "private"."stamp_student_email"();


-- ---------------------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------------------
--
-- A policy without a grant is inert -- the request is refused before any policy is consulted.
-- That was the bug behind "students cannot add pictures to events", so every table below gets
-- its grants stated next to its policies rather than left to a default.
--
-- TRUNCATE is never granted: it is not filtered by row-level security and leaves nothing to
-- audit. 20260901000600 revokes it from the schema default, and these tables inherit that.

GRANT SELECT ON TABLE "public"."site_banners" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."site_banners" TO "authenticated";

GRANT SELECT ON TABLE "public"."date_sheets" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."date_sheets" TO "authenticated";

GRANT SELECT ON TABLE "public"."projects" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."projects" TO "authenticated";

-- The three submission tables: anyone may write one, only the committee may read them back.
-- No SELECT for anon anywhere here -- these rows carry names, addresses and roll numbers.
GRANT INSERT ON TABLE "public"."event_registrations" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."event_registrations" TO "authenticated";

GRANT INSERT ON TABLE "public"."contact_messages" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."contact_messages" TO "authenticated";

GRANT INSERT ON TABLE "public"."navigation_reports" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."navigation_reports" TO "authenticated";


-- ---------------------------------------------------------------------------------------
-- 9. Row level security
-- ---------------------------------------------------------------------------------------

ALTER TABLE "public"."site_banners"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."date_sheets"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."projects"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_registrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."contact_messages"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."navigation_reports"  ENABLE ROW LEVEL SECURITY;


-- Published content is public; everything about it is managed by content managers. The read
-- policy names is_published so an unfinished banner or an unreleased date sheet is not served
-- to visitors while it is being prepared.

DROP POLICY IF EXISTS "Anyone can read published banners" ON "public"."site_banners";
CREATE POLICY "Anyone can read published banners" ON "public"."site_banners"
    FOR SELECT TO "anon", "authenticated" USING ("is_published");

DROP POLICY IF EXISTS "Content managers can manage banners" ON "public"."site_banners";
CREATE POLICY "Content managers can manage banners" ON "public"."site_banners"
    TO "authenticated"
    USING ((SELECT "private"."can_manage_content"()))
    WITH CHECK ((SELECT "private"."can_manage_content"()));


DROP POLICY IF EXISTS "Anyone can read published date sheets" ON "public"."date_sheets";
CREATE POLICY "Anyone can read published date sheets" ON "public"."date_sheets"
    FOR SELECT TO "anon", "authenticated" USING ("is_published");

DROP POLICY IF EXISTS "Content managers can manage date sheets" ON "public"."date_sheets";
CREATE POLICY "Content managers can manage date sheets" ON "public"."date_sheets"
    TO "authenticated"
    USING ((SELECT "private"."can_manage_content"()))
    WITH CHECK ((SELECT "private"."can_manage_content"()));


DROP POLICY IF EXISTS "Anyone can read approved projects" ON "public"."projects";
CREATE POLICY "Anyone can read approved projects" ON "public"."projects"
    FOR SELECT TO "anon", "authenticated" USING ("status" = 'approved');

-- A student may see their own submission while it waits, so "did it arrive?" has an answer
-- that is not "ask an admin".
DROP POLICY IF EXISTS "Students can read their own projects" ON "public"."projects";
CREATE POLICY "Students can read their own projects" ON "public"."projects"
    FOR SELECT TO "authenticated" USING ("author_id" = (SELECT "auth"."uid"()));

-- Submitting is open to signed-in students, and the row is pinned to them and to 'pending'.
-- Without pinning the status a student could publish straight to the public page.
DROP POLICY IF EXISTS "Students can submit projects" ON "public"."projects";
CREATE POLICY "Students can submit projects" ON "public"."projects"
    FOR INSERT TO "authenticated"
    WITH CHECK ("status" = 'pending' AND "author_id" = (SELECT "auth"."uid"()));

DROP POLICY IF EXISTS "Content managers can manage projects" ON "public"."projects";
CREATE POLICY "Content managers can manage projects" ON "public"."projects"
    TO "authenticated"
    USING ((SELECT "private"."can_manage_content"()))
    WITH CHECK ((SELECT "private"."can_manage_content"()));


-- The three submission tables. Writing is open to everyone, including signed-out visitors:
-- an event registration or a broken-route report from somebody without an account is still
-- worth having, and requiring a login to say "this route is wrong" would mean never hearing
-- it. Reading is restricted to content managers, because these rows are personal data.

DROP POLICY IF EXISTS "Anyone can register for an event" ON "public"."event_registrations";
CREATE POLICY "Anyone can register for an event" ON "public"."event_registrations"
    FOR INSERT TO "anon", "authenticated"
    WITH CHECK ("submitted_by" IS NULL OR "submitted_by" = (SELECT "auth"."uid"()));

DROP POLICY IF EXISTS "Content managers can manage registrations" ON "public"."event_registrations";
CREATE POLICY "Content managers can manage registrations" ON "public"."event_registrations"
    TO "authenticated"
    USING ((SELECT "private"."can_manage_content"()))
    WITH CHECK ((SELECT "private"."can_manage_content"()));


DROP POLICY IF EXISTS "Anyone can send a message" ON "public"."contact_messages";
CREATE POLICY "Anyone can send a message" ON "public"."contact_messages"
    FOR INSERT TO "anon", "authenticated"
    WITH CHECK ("status" = 'pending'
                AND "handled_by" IS NULL
                AND ("submitted_by" IS NULL OR "submitted_by" = (SELECT "auth"."uid"())));

DROP POLICY IF EXISTS "Content managers can manage messages" ON "public"."contact_messages";
CREATE POLICY "Content managers can manage messages" ON "public"."contact_messages"
    TO "authenticated"
    USING ((SELECT "private"."can_manage_content"()))
    WITH CHECK ((SELECT "private"."can_manage_content"()));


DROP POLICY IF EXISTS "Anyone can report a route" ON "public"."navigation_reports";
CREATE POLICY "Anyone can report a route" ON "public"."navigation_reports"
    FOR INSERT TO "anon", "authenticated"
    WITH CHECK ("status" = 'pending'
                AND "reviewed_by" IS NULL
                AND ("submitted_by" IS NULL OR "submitted_by" = (SELECT "auth"."uid"())));

DROP POLICY IF EXISTS "Content managers can manage navigation reports" ON "public"."navigation_reports";
CREATE POLICY "Content managers can manage navigation reports" ON "public"."navigation_reports"
    TO "authenticated"
    USING ((SELECT "private"."can_manage_content"()))
    WITH CHECK ((SELECT "private"."can_manage_content"()));


-- ---------------------------------------------------------------------------------------
-- 10. Comments
-- ---------------------------------------------------------------------------------------

COMMENT ON TABLE "public"."event_registrations" IS
  'Sign-ups for an event that has no attached form. An event with an internal form collects through form_responses instead; both are exported the same way.';

COMMENT ON TABLE "public"."contact_messages" IS
  'The public contact form. Readable only by content managers -- every row carries a name and an address.';

COMMENT ON TABLE "public"."navigation_reports" IS
  'Student reports of a wrong route. The building dataset is surveyed by hand, so this is the only channel a survey error can come back through.';

COMMENT ON TABLE "public"."site_banners" IS
  'Promotional banners. Only is_published rows are readable by visitors.';

COMMENT ON TABLE "public"."date_sheets" IS
  'Exam date sheets. The file lives in the course-documents bucket under date-sheets/; a row cannot be published without one.';

COMMENT ON TABLE "public"."projects" IS
  'Student project showcase, moderated: only status = approved is public. Students may read back their own pending submission.';
