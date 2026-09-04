-- A member's gender, so a member without a photograph gets a person-shaped placeholder.
--
-- The placeholder was the society logo. On a roster where several people have no photo yet that
-- produces a column of identical logos: the eye cannot tell the cards apart, and a list of
-- people stops reading as a list of people. It also says "IEEE CS" in the slot that is supposed
-- to say who somebody is.
--
-- Three values, not two. 'unknown' is the default and it is the honest one -- gender is not
-- required to add somebody to the roster, and guessing it from a name is both unreliable and
-- not the application's business. A member nobody has set it for gets a neutral figure rather
-- than a coin flip.
--
-- Stored, rather than derived at render time, for the same reason: it is a fact about a person
-- that a human records, not something to infer.

set local statement_timeout = '60s';

ALTER TABLE "public"."hierarchy_members"
  ADD COLUMN IF NOT EXISTS "gender" "text" DEFAULT 'unknown' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "pg_constraint"
    WHERE "conname" = 'hierarchy_members_gender_check'
      AND "conrelid" = 'public.hierarchy_members'::"regclass"
  ) THEN
    ALTER TABLE "public"."hierarchy_members"
      ADD CONSTRAINT "hierarchy_members_gender_check"
      CHECK ("gender" IN ('male', 'female', 'unknown'));
  END IF;
END
$$;

COMMENT ON COLUMN "public"."hierarchy_members"."gender" IS
  'Selects the placeholder portrait for a member with no photograph. Defaults to unknown, which draws a neutral figure -- the application never guesses this from a name.';


-- Any row still pointing at the logo in the front end''s public folder is a member with no real
-- photograph, so it becomes no photograph at all and picks up the placeholder for its gender.
-- 20260902001000 already did this once; repeated because rows written since could carry it.
UPDATE "public"."hierarchy_members"
   SET "photo_url" = NULL
 WHERE "photo_url" = '/brand-logo.png';
