-- Forms system: admin-built forms, their pages, their fields, and student responses.
--
-- Replaces the localStorage model in src/services/formsService.ts. The shapes here are
-- deliberately close to FormDef / FormPage / FormField / FormResponse in src/types/index.ts
-- so the admin builder can be repointed at Postgres without rethinking the concept. Where a
-- shape does differ, the difference is named in a comment on the column it affects, along
-- with which side has to move -- a mismatch nobody wrote down is a mismatch somebody
-- discovers in production.
--
-- Additive only. Every statement is safe to run more than once.


-- ---------------------------------------------------------------------------
-- 1. public.forms
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."forms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "opens_at" timestamp with time zone,
    "closes_at" timestamp with time zone,
    "max_responses" integer,
    "show_remaining" boolean DEFAULT false NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "forms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "forms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    CONSTRAINT "forms_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'closed'::"text"]))),
    -- NULL, not 0, is the "no limit" marker: 0 is a legitimate answer to "how many seats
    -- are left", so it cannot also stand for "there was never a cap". Overloading 0 would
    -- make a full form and an uncapped form indistinguishable in form_capacity().
    CONSTRAINT "forms_max_responses_check" CHECK ((("max_responses" IS NULL) OR ("max_responses" > 0))),
    -- A window that closes before it opens can never accept a response; reject it at write
    -- time rather than leaving an admin to wonder why nobody can submit.
    CONSTRAINT "forms_window_check" CHECK ((("opens_at" IS NULL) OR ("closes_at" IS NULL) OR ("closes_at" > "opens_at")))
);


ALTER TABLE "public"."forms" OWNER TO "postgres";


-- FormDef.status (src/types/index.ts:283) is 'open' | 'disabled'; this column is the wider
-- 'draft' | 'open' | 'closed'. The app model is the side that moves, because the third state
-- is load-bearing here and 'disabled' is only a rename:
--
--   'disabled'  ->  'closed'   hidden from students, data kept -- the same meaning
--   (new)           'draft'    a form still being built
--
-- Without 'draft' there is no state a half-finished form can sit in: the SELECT policy below
-- keys on status = 'open', and its only alternative would be to publish the form to every
-- visitor the moment the admin saves it for the first time. Whoever repoints formsService.ts
-- has to widen FormDef['status'] to all three and rename 'disabled'.
COMMENT ON COLUMN "public"."forms"."status" IS 'draft = being built, not public; open = accepting responses; closed = kept but not accepting. FormDef.status ''disabled'' maps to ''closed''; ''draft'' is new to the app.';

COMMENT ON COLUMN "public"."forms"."max_responses" IS 'Auto-close-at-N cap. NULL means unlimited; 0 is not usable as the sentinel because 0 is a real seats-remaining value.';

COMMENT ON COLUMN "public"."forms"."show_remaining" IS 'Whether the public form page may display seats left. When false, form_capacity() withholds the counts but still reports is_open.';

-- FormDef.isDefault had no column, which would have quietly unpinned the seeded Feedback
-- form: formsService.ts:32-36 sorts admin-created forms newest-first and appends the default
-- one last, so with the flag gone the seeded form drifts into the middle of the list by
-- created_at. Stored rather than inferred from a hardcoded id, because "which form is the
-- default" is data the admin UI can show and a future migration can move.
COMMENT ON COLUMN "public"."forms"."is_default" IS 'FormDef.isDefault: the one seeded form pinned last in every list. At most one row may set it -- see forms_one_default_idx.';


-- A partial unique index, not a CHECK: "at most one row in the table" is a statement about
-- the table, and a row constraint cannot see the other rows. Unique over a column whose only
-- permitted value inside the partial set is true admits exactly one such row.
CREATE UNIQUE INDEX IF NOT EXISTS "forms_one_default_idx" ON "public"."forms" USING "btree" ("is_default") WHERE "is_default";


CREATE OR REPLACE TRIGGER "forms_set_updated_at" BEFORE UPDATE ON "public"."forms" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


-- ---------------------------------------------------------------------------
-- 2. public.form_pages
-- ---------------------------------------------------------------------------

-- FormDef.pages is a shipped feature, not a placeholder: FormBuilderPage.tsx:140 adds pages,
-- :223-231 gives each one a heading and a description, FormFillPage.tsx:173-174 renders both,
-- :103 validates one page at a time, and :88 draws the progress bar from the page count.
-- Folding every field into a single flat sort_order on form_fields would have dropped the
-- page breaks and both page texts the admin typed, turning a five-step form into one long
-- scroll with no error the admin could see. So the page is its own row.
--
-- Cheap, too: a page carries no behaviour of its own -- it is a heading, a blurb and an
-- ordinal -- so this table is three columns and one index, not a subsystem.

CREATE TABLE IF NOT EXISTS "public"."form_pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "title" "text",
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "form_pages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_pages_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE CASCADE,
    -- Redundant against the primary key on its own, and it exists anyway: a composite
    -- foreign key can only point at a unique constraint, and the one on form_fields below is
    -- what makes a field's form_id and its page's form_id physically unable to disagree.
    CONSTRAINT "form_pages_id_form_id_key" UNIQUE ("id", "form_id")
);


ALTER TABLE "public"."form_pages" OWNER TO "postgres";


COMMENT ON TABLE "public"."form_pages" IS 'FormPage in src/types/index.ts. One row per step of a multi-step form; a single-page form has exactly one.';

COMMENT ON COLUMN "public"."form_pages"."title" IS 'FormPage.title. Optional -- the builder only offers a heading once a form has more than one page.';


CREATE INDEX IF NOT EXISTS "form_pages_form_id_sort_order_idx" ON "public"."form_pages" USING "btree" ("form_id", "sort_order");


-- ---------------------------------------------------------------------------
-- 3. public.form_fields
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."form_fields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "page_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "help_text" "text",
    "placeholder" "text",
    "field_type" "text" NOT NULL,
    "required" boolean DEFAULT false NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "form_fields_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_fields_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE CASCADE,
    -- form_id is kept alongside page_id so the RLS policy and the renderer can read a whole
    -- form's fields without joining through pages. The composite reference is what keeps
    -- that copy honest: a field cannot name a page belonging to some other form.
    CONSTRAINT "form_fields_page_id_fkey" FOREIGN KEY ("page_id", "form_id") REFERENCES "public"."form_pages"("id", "form_id") ON DELETE CASCADE,
    -- Field types, reconciled against the picker in src/components/forms/fieldTypes.ts:16-27.
    -- That picker is the entire set an admin can choose, and three of its entries had no
    -- value here at all: the first admin to pick "Single choice", "File upload" or "Image
    -- upload" would have hit a CHECK violation the moment the builder is repointed at
    -- Postgres, with nothing in the UI to warn them off. The list below covers all ten.
    --
    --   app value      stored value        app value     stored value
    --   'short-text' -> short_text         'dropdown' -> select
    --   'long-text'  -> long_text          'radio'    -> radio        (added)
    --   'email'      -> email              'checkbox' -> checkbox
    --   'number'     -> number             'file'     -> file         (added)
    --   'date'       -> date               'image'    -> image        (added)
    --
    -- Two deliberate calls in that table:
    --
    -- 'multiselect' is dropped. The app's 'checkbox' is a multi-choice group (fieldTypeMeta
    -- marks it hasOptions: true), which is the widget 'multiselect' named, so one app value
    -- faced two equally plausible stored values with no rule to choose between them -- the
    -- kind of mapping that gets written twice and differently, and then exports two spellings
    -- of one question. One stored value per widget. Nothing in the app renders the
    -- multi-select dropdown that would have justified keeping the second.
    --
    -- 'phone' is kept although no picker entry emits it. A permitted value nobody writes
    -- costs nothing and is a real answer type for a society that collects WhatsApp numbers;
    -- a forbidden value somebody writes costs a failed submission.
    CONSTRAINT "form_fields_field_type_check" CHECK (("field_type" = ANY (ARRAY['short_text'::"text", 'long_text'::"text", 'email'::"text", 'phone'::"text", 'number'::"text", 'date'::"text", 'select'::"text", 'radio'::"text", 'checkbox'::"text", 'file'::"text", 'image'::"text"]))),
    CONSTRAINT "form_fields_options_check" CHECK (("jsonb_typeof"("options") = 'array'::"text"))
);


ALTER TABLE "public"."form_fields" OWNER TO "postgres";


-- 'file' and 'image' are accepted so that the picker cannot build a form the database
-- refuses, not because an upload path exists -- it does not, and none is invented here. When
-- one lands, the answer recorded for such a field is a storage object path (the same kind of
-- string profiles.avatar_path holds), so the object can be found and deleted with the
-- response; it is never the file's bytes. Until then those two types simply store nothing.
COMMENT ON COLUMN "public"."form_fields"."field_type" IS 'Renderer for this field, one per fieldTypes.ts picker entry. A file/image answer will hold a storage object path in form_responses.answers, never the file itself; no upload UI exists yet.';

COMMENT ON COLUMN "public"."form_fields"."options" IS 'Choice list for select/radio/checkbox -- the three types fieldTypeMeta marks hasOptions. Array of {id,label} objects, mirroring FormFieldOption in src/types/index.ts.';

-- FormField.description is this column under another name. Renamed rather than mirrored,
-- because "description" already means the form-level blurb on public.forms and the page blurb
-- on public.form_pages, and a third meaning of the same word inside one three-table module is
-- how the wrong one ends up rendered under a field label. The mapping layer does the rename;
-- FormField.description keeps its name in the app.
COMMENT ON COLUMN "public"."form_fields"."help_text" IS 'FormField.description in src/types/index.ts -- the hint shown under a field label. Renamed to keep it distinct from forms.description and form_pages.description.';


-- Serves both the builder (fields of one form, in display order) and the public renderer,
-- which are the only two ways this table is ever read.
CREATE INDEX IF NOT EXISTS "form_fields_form_id_sort_order_idx" ON "public"."form_fields" USING "btree" ("form_id", "sort_order");

-- The referencing side of the composite foreign key needs its own index or every page the
-- builder deletes scans the whole table to cascade; it doubles as the per-page read order.
CREATE INDEX IF NOT EXISTS "form_fields_page_id_sort_order_idx" ON "public"."form_fields" USING "btree" ("page_id", "sort_order");


-- ---------------------------------------------------------------------------
-- 4. public.form_responses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."form_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "submitted_by" "uuid",
    "student_email" "text",
    "answers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "field_labels" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_responses_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE CASCADE,
    CONSTRAINT "form_responses_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    CONSTRAINT "form_responses_answers_check" CHECK (("jsonb_typeof"("answers") = 'object'::"text")),
    CONSTRAINT "form_responses_field_labels_check" CHECK (("jsonb_typeof"("field_labels") = 'object'::"text"))
);


ALTER TABLE "public"."form_responses" OWNER TO "postgres";


-- Answers live in one jsonb object keyed by form_field id rather than in a normalised
-- answers table because a response is only ever read and exported whole -- never queried
-- or aggregated field-by-field. A child table would buy indexed per-field search that
-- nothing asks for, and cost a join plus a pivot on every single read. The label snapshot
-- settles it: CSV export must show the wording as it stood at submission time, so the
-- response has to carry its own copy of the labels regardless of how answers are stored,
-- and once labels are denormalised there is nothing left for a child table to normalise.
COMMENT ON COLUMN "public"."form_responses"."answers" IS 'jsonb object keyed by form_fields.id. Read and exported whole, never queried field-by-field.';

COMMENT ON COLUMN "public"."form_responses"."field_labels" IS 'Label wording captured at submission time, keyed by form_fields.id, so CSV exports stay readable after the form is edited or a field is deleted.';

COMMENT ON COLUMN "public"."form_responses"."submitted_by" IS 'NULL for anonymous submissions. Forms are deliberately open to signed-out students.';

COMMENT ON COLUMN "public"."form_responses"."student_email" IS 'Derived from the caller''s own profile by the BEFORE INSERT trigger below; any value sent by the client is discarded. NULL for anonymous submissions.';


-- created_at rides along in the same index because the admin list and the CSV export both
-- read one form's responses newest-first; form_id leading still serves the plain lookups
-- and the capacity count.
CREATE INDEX IF NOT EXISTS "form_responses_form_id_created_at_idx" ON "public"."form_responses" USING "btree" ("form_id", "created_at" DESC);

-- Partial: most responses are anonymous, and an email nobody supplied is not worth indexing.
-- A plain btree on the bare column is the right shape here -- unlike the five tables in
-- 20260901000100_student_profiles.sql, which index lower(student_email) because they hold
-- addresses written before any normalisation existed. Every value in this column is written
-- by the trigger below and is therefore already lower-cased.
CREATE INDEX IF NOT EXISTS "form_responses_student_email_idx" ON "public"."form_responses" USING "btree" ("student_email") WHERE ("student_email" IS NOT NULL);


-- ---------------------------------------------------------------------------
-- 5. student_email is derived, never accepted
-- ---------------------------------------------------------------------------

-- student_email used to be an ordinary writable column. The INSERT policy pins submitted_by
-- to the caller's own uid but says nothing about the address, so an anonymous submitter could
-- type any student's university address and their answers would appear in the admin's CSV
-- export attributed to that student. Nothing downstream could tell the difference: the export
-- is the one place this column is read, and on an anonymous row there is no uid to contradict
-- it.
--
-- So the address is never taken from the request. A BEFORE INSERT trigger overwrites whatever
-- arrived with the address on the caller's own profile, and with NULL when there is no
-- caller. This is the same fix the profiles track applies to the five submission tables, and
-- deliberately the same mechanism: a WITH CHECK on the policy cannot express it, because the
-- policy has no way to read another user's profile row. Row-level WITH CHECK is evaluated
-- after BEFORE triggers have run, so the policy sees -- and cannot disagree with -- the
-- derived value.
--
-- The trigger function is not written here. 20260901000100_student_profiles.sql already
-- defines private.stamp_student_email() for exactly this problem on its five submission
-- tables, it touches nothing but NEW.student_email so it fits any table carrying that
-- column, and it runs first. Attaching it is the whole change: a second copy of the same
-- function is a second copy to keep in step, and this one is now load-bearing on six tables.
--
-- BEFORE INSERT only, where those five stamp on INSERT OR UPDATE. They defend an update path
-- that exists; form_responses has no UPDATE policy and no UPDATE grant for any role, so
-- there is nothing here for an UPDATE branch to protect.

CREATE OR REPLACE TRIGGER "form_responses_stamp_student_email" BEFORE INSERT ON "public"."form_responses" FOR EACH ROW EXECUTE FUNCTION "private"."stamp_student_email"();


-- Deliberately NOT added to relink_student_activity(). That function repairs ownership by
-- rewriting submitted_by on rows a returning student contributed, and a form response is the
-- one thing in this schema that is never rewritten: there is no UPDATE policy and no UPDATE
-- grant on this table, because a submitted answer is a record of what someone said. Reaching
-- past that with a SECURITY DEFINER writer would undo the rule three sections below.
--
-- The column earns its place anyway. It is what the admin export shows, and now that it is
-- derived server-side it is the only trustworthy identity on a row that is otherwise
-- anonymous -- one that still names the right student after the login it belonged to has been
-- deleted, which is the entire reason the other five tables carry the same column.


-- ---------------------------------------------------------------------------
-- 6. Counting rule -- enforced in the database, not in the client
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "private"."enforce_form_response_limits"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  parent public.forms%rowtype;
  taken integer;
begin
  -- SECURITY DEFINER so the check still sees the parent row once the form stops being
  -- publicly selectable; without it a closed form would read as "not found" and the
  -- submitter would get a misleading error.
  --
  -- FOR UPDATE is what makes the cap real. Two students submitting the last seat at the
  -- same moment would both count N-1 and both be let in; locking the forms row serialises
  -- them so the second one counts N and is rejected. Contention is per-form and only for
  -- the length of an insert.
  select * into parent
  from public.forms
  where id = new.form_id
  for update;

  if not found then
    raise exception 'That form no longer exists.'
      using errcode = '23503';
  end if;

  if parent.status <> 'open' then
    raise exception 'This form is not accepting responses.'
      using errcode = '23514';
  end if;

  if parent.opens_at is not null and now() < parent.opens_at then
    raise exception 'This form is not open yet.'
      using errcode = '23514';
  end if;

  if parent.closes_at is not null and now() >= parent.closes_at then
    raise exception 'This form has closed.'
      using errcode = '23514';
  end if;

  if parent.max_responses is not null then
    select count(*) into taken
    from public.form_responses
    where form_id = new.form_id;

    if taken >= parent.max_responses then
      raise exception 'This form is full. All % places have been taken.', parent.max_responses
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."enforce_form_response_limits"() OWNER TO "postgres";


-- The public page's own countdown is a courtesy to the student, not the limit. This trigger
-- is the limit: it holds even against a hand-rolled request straight at PostgREST.
CREATE OR REPLACE TRIGGER "enforce_form_response_limits" BEFORE INSERT ON "public"."form_responses" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_form_response_limits"();


-- ---------------------------------------------------------------------------
-- 7. public.form_capacity -- seats left without exposing responses
-- ---------------------------------------------------------------------------

-- Parameter is p_form_id, not form_id, to match the p_-prefix convention the existing
-- public functions use and because a bare form_id would be ambiguous against the column
-- of the same name inside the body.
CREATE OR REPLACE FUNCTION "public"."form_capacity"("p_form_id" "uuid")
    RETURNS TABLE("max_responses" integer, "response_count" integer, "remaining" integer, "is_open" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  -- SECURITY DEFINER lets the public page learn the count without any read privilege on
  -- form_responses. Every column is table-qualified so nothing resolves against the
  -- identically named OUT columns.
  select
    case when f.show_remaining then f.max_responses end,
    case
      when f.show_remaining
      then (select count(*)::integer from public.form_responses r where r.form_id = f.id)
    end,
    case
      when f.show_remaining and f.max_responses is not null
      then greatest(
        f.max_responses - (select count(*)::integer from public.form_responses r where r.form_id = f.id),
        0
      )
    end,
    -- is_open is reported truthfully even when the counts are withheld: a student is
    -- entitled to know whether submitting will work, just not how many others have.
    f.status = 'open'
      and (f.opens_at is null or now() >= f.opens_at)
      and (f.closes_at is null or now() < f.closes_at)
      and (
        f.max_responses is null
        or (select count(*) from public.form_responses r where r.form_id = f.id) < f.max_responses
      )
  from public.forms f
  where f.id = p_form_id;
$$;


ALTER FUNCTION "public"."form_capacity"("p_form_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."form_capacity"("p_form_id" "uuid") IS 'Seats-left readout for the public form page. Returns NULL counts when the form has show_remaining = false, but always a correct is_open.';


-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."forms" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."form_pages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."form_fields" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."form_responses" ENABLE ROW LEVEL SECURITY;


-- forms ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can read open forms" ON "public"."forms";
CREATE POLICY "Anyone can read open forms" ON "public"."forms" FOR SELECT TO "authenticated", "anon" USING (("status" = 'open'::"text"));

DROP POLICY IF EXISTS "Content managers can manage forms" ON "public"."forms";
CREATE POLICY "Content managers can manage forms" ON "public"."forms" TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));


-- form_pages ----------------------------------------------------------------

-- Same rule as the fields: a page is only as public as the form it belongs to, so the test
-- is on the parent's status rather than anything stored on the page itself.
DROP POLICY IF EXISTS "Anyone can read pages of open forms" ON "public"."form_pages";
CREATE POLICY "Anyone can read pages of open forms" ON "public"."form_pages" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."forms" "f"
  WHERE (("f"."id" = "form_pages"."form_id") AND ("f"."status" = 'open'::"text")))));

DROP POLICY IF EXISTS "Content managers can manage form pages" ON "public"."form_pages";
CREATE POLICY "Content managers can manage form pages" ON "public"."form_pages" TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));


-- form_fields ---------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can read fields of open forms" ON "public"."form_fields";
CREATE POLICY "Anyone can read fields of open forms" ON "public"."form_fields" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."forms" "f"
  WHERE (("f"."id" = "form_fields"."form_id") AND ("f"."status" = 'open'::"text")))));

DROP POLICY IF EXISTS "Content managers can manage form fields" ON "public"."form_fields";
CREATE POLICY "Content managers can manage form fields" ON "public"."form_fields" TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content")) WITH CHECK (( SELECT "private"."can_manage_content"() AS "can_manage_content"));


-- form_responses ------------------------------------------------------------

-- Insert is wide open by design; the BEFORE INSERT trigger, not this policy, decides
-- whether the form is still taking answers. The one thing the policy does police is
-- attribution: a signed-in submitter may only stamp their own id, and anonymous stays NULL.
-- student_email is not policed here at all -- it cannot be, since the policy has no way to
-- read a profile row -- and is instead overwritten by stamp_student_email() before this
-- check ever runs.
DROP POLICY IF EXISTS "Anyone can submit form responses" ON "public"."form_responses";
CREATE POLICY "Anyone can submit form responses" ON "public"."form_responses" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("submitted_by" IS NULL) OR ("submitted_by" = ( SELECT "auth"."uid"() AS "uid"))));

-- No student-facing SELECT policy of any kind. Responses are other people's answers, and
-- there is no version of the product where one student reads another's.
DROP POLICY IF EXISTS "Content managers can read form responses" ON "public"."form_responses";
CREATE POLICY "Content managers can read form responses" ON "public"."form_responses" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

DROP POLICY IF EXISTS "Content managers can delete form responses" ON "public"."form_responses";
CREATE POLICY "Content managers can delete form responses" ON "public"."form_responses" FOR DELETE TO "authenticated" USING (( SELECT "private"."can_manage_content"() AS "can_manage_content"));

-- Deliberately no UPDATE policy on form_responses: a submitted answer is a record of what
-- someone said, so nobody -- student or admin -- edits it after the fact.


-- ---------------------------------------------------------------------------
-- Grants (a policy is inert without one)
-- ---------------------------------------------------------------------------

GRANT SELECT ON TABLE "public"."forms" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."forms" TO "authenticated";

GRANT SELECT ON TABLE "public"."form_pages" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."form_pages" TO "authenticated";

GRANT SELECT ON TABLE "public"."form_fields" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."form_fields" TO "authenticated";

-- anon gets INSERT and nothing else: signed-out students submit, and cannot read back a
-- single row -- not their own, not anyone's. Inserts must therefore not ask PostgREST for
-- the created row.
GRANT INSERT ON TABLE "public"."form_responses" TO "anon";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."form_responses" TO "authenticated";


REVOKE ALL ON FUNCTION "public"."form_capacity"("p_form_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."form_capacity"("p_form_id" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."form_capacity"("p_form_id" "uuid") TO "authenticated";


-- ---------------------------------------------------------------------------
-- TRUNCATE
-- ---------------------------------------------------------------------------

-- ALTER DEFAULT PRIVILEGES in the baseline (20260831232350_remote_schema.sql:1392-1393)
-- hands TRUNCATE to anon and authenticated on every table created in public. TRUNCATE is not
-- filtered by row level security, so all the careful policing above -- anon may insert and
-- never read, a submitted answer is never edited, only content managers may delete -- is
-- worth nothing against one statement from the anon key that empties form_responses and
-- destroys every submission the society has collected. Nothing above would even record that
-- it happened.
--
-- Taking the grant back costs nothing: no code path truncates these tables, deletes still go
-- through the DELETE policy, and service_role keeps its own grant for maintenance. The
-- sibling migration 20260901000400_hierarchy_and_content.sql already does exactly this on
-- the nine tables it creates; leaving these four out was the inconsistency, not the fix.
REVOKE TRUNCATE ON TABLE
    "public"."forms",
    "public"."form_pages",
    "public"."form_fields",
    "public"."form_responses"
FROM "anon", "authenticated";
