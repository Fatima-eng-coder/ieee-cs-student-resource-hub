-- Per-question format rules: a number field that only accepts numbers, a registration-number
-- field that only accepts FA24-BCS-059.
--
-- Forms had exactly one rule, `required`. A question asking for a registration number accepted
-- "idk"; a question asking for an email accepted a phone number. Nobody found out until somebody
-- read the spreadsheet, by which point the student who mistyped it is gone.
--
-- Two halves, and the second is the one that makes it a rule rather than a hint:
--
--   1. form_fields.format  -- what the admin asked for, authored in the builder.
--   2. private.enforce_form_answer_formats()  -- a BEFORE INSERT trigger that re-checks every
--      answer against its field's format server-side.
--
-- The trigger is not belt-and-braces. `anon` holds GRANT INSERT on form_responses and the INSERT
-- policy is deliberately wide (20260901000200_forms.sql:463-466) so that signed-out students can
-- submit; anything checked only in the browser can be walked straight past with curl and the
-- publishable key. This repo's own standard, written at the top of src/utils/validation.ts, is
-- that "a rule that lives only in the browser is a suggestion, not a constraint".
--
-- A FIXED LIST, never an admin-authored regex. A pattern typed into the builder and then executed
-- inside a BEFORE INSERT trigger is a ReDoS vector pointed at our own database, reachable by an
-- anonymous submitter with one POST. The presets below cover what was actually asked for and
-- cannot be turned into one.

set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------------------

ALTER TABLE "public"."form_fields"
    ADD COLUMN IF NOT EXISTS "format" "text" DEFAULT 'none' NOT NULL;

-- Mirrors FormFieldFormat in src/utils/formFormats.ts. A CHECK rather than an enum for the same
-- reason faqs.category is one: widening it later is a single ALTER instead of a type change.
DO $$
BEGIN
    ALTER TABLE "public"."form_fields"
        ADD CONSTRAINT "form_fields_format_check" CHECK ("format" = ANY (ARRAY[
            'none'::"text",
            'integer'::"text",
            'decimal'::"text",
            'email'::"text",
            'gmail'::"text",
            'university-email'::"text",
            'registration-number'::"text",
            'phone-pk'::"text",
            'url'::"text"
        ]));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN "public"."form_fields"."format" IS
    'Format demanded of this answer. Mirrors FormFieldFormat in src/utils/formFormats.ts, and is '
    're-checked server-side by private.enforce_form_answer_formats().';

-- ---------------------------------------------------------------------------------------
-- 2. The server-side check
-- ---------------------------------------------------------------------------------------

-- POSIX patterns, mirroring POSTGRES_PATTERN in src/utils/formFormats.ts.
--
-- Three things differ from the JavaScript on purpose, each a trap validation.ts already
-- documents:
--   * explicit [0-9]/[a-zA-Z] classes rather than \d or \w, which drift when ported;
--   * newlines are rejected before the pattern runs, because a POSIX '$' matches before a
--     trailing newline where JavaScript's does not -- without that, "ok@x.com\nanything" would
--     pass here while failing in the browser;
--   * the plain-email rules are LOOSER here than in the browser. This is a backstop against a
--     scripted POST, not a second opinion about typos; a server rule stricter than the client's
--     would reject a value the form had already told the student was fine.
CREATE OR REPLACE FUNCTION "private"."format_pattern"("p_format" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_format
    when 'integer'             then '^-?[0-9]+$'
    when 'decimal'             then '^-?[0-9]+(\.[0-9]+)?$'
    when 'email'               then '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$'
    when 'gmail'               then '^[a-zA-Z0-9._%+-]+@[gG][mM][aA][iI][lL]\.[cC][oO][mM]$'
    when 'university-email'    then '^[a-zA-Z]{2}[0-9]{2}-[a-zA-Z]{3,4}-[0-9]{3,4}@isbstudent\.comsats\.edu\.pk$'
    when 'registration-number' then '^[a-zA-Z]{2}[0-9]{2}-[a-zA-Z]{3,4}-[0-9]{3,4}$'
    when 'phone-pk'            then '^(\+92|0092|92|0)?3[0-9]{9}$'
    when 'url'                 then '^https?://[^[:space:]]+$'
    else null
  end;
$$;

ALTER FUNCTION "private"."format_pattern"("text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "private"."enforce_form_answer_formats"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  field    record;
  answer   jsonb;
  value    text;
  pattern  text;
begin
  -- SECURITY DEFINER for the same reason its sibling enforce_form_response_limits() is one:
  -- form_fields is only selectable while the form is published, and a check that could not see
  -- the fields would silently pass every answer on a closed form.
  for field in
    select f.id, f.label, f.format
    from public.form_fields f
    where f.form_id = new.form_id
      and f.format is not null
      and f.format <> 'none'
  loop
    answer := new.answers -> field.id::text;

    -- Absent or null: `required` decides whether that is allowed, not this. A format that also
    -- rejected a missing answer would make every optional question mandatory.
    continue when answer is null or jsonb_typeof(answer) = 'null';

    -- Only scalar strings carry a format. A checkbox answer is an array and has no shape to
    -- check; anything else is a client bug, not a student's mistake.
    continue when jsonb_typeof(answer) <> 'string';

    value := answer #>> '{}';
    continue when btrim(value) = '';

    -- Before the pattern, not after: see the note above about POSIX '$' and trailing newlines.
    if value ~ '[\n\r]' then
      raise exception 'The answer to "%" is not in the required format.', field.label
        using errcode = '23514';
    end if;

    pattern := private.format_pattern(field.format);
    continue when pattern is null;

    if value !~ pattern then
      raise exception 'The answer to "%" is not in the required format.', field.label
        using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

ALTER FUNCTION "private"."enforce_form_answer_formats"() OWNER TO "postgres";

-- Fires after the availability trigger. Both are BEFORE INSERT, and Postgres runs same-timing
-- triggers in name order, so "form_responses_enforce_formats" sorting after
-- "form_responses_enforce_limits" is what keeps "this form is closed" the error a late submitter
-- sees rather than a complaint about one of their answers.
CREATE OR REPLACE TRIGGER "form_responses_enforce_formats"
    BEFORE INSERT ON "public"."form_responses"
    FOR EACH ROW EXECUTE FUNCTION "private"."enforce_form_answer_formats"();

COMMENT ON FUNCTION "private"."enforce_form_answer_formats"() IS
    'Re-checks each answer against its form_fields.format. anon can INSERT into form_responses, '
    'so the browser-side check in src/utils/formFormats.ts is a courtesy and this is the rule.';
