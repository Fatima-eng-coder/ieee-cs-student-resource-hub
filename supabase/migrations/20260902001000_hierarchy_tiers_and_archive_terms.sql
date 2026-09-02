-- Hierarchy: the published tier layout, a way to file an archive term, and the removal of a
-- front-end asset path from the roster rows.
--
-- THE INTENDED FINAL TIERS. The public tree groups members by hierarchy_roles.tier and orders
-- them inside a tier by rank, so this table is the whole shape of the chart. After this
-- migration it reads:
--
--   tier 0   faculty-advisor      rank 10
--   tier 1   chairperson          rank 10
--   tier 2   vice-chairperson     rank 10
--            general-secretary    rank 20
--   tier 3   operations-manager   rank 10
--            web-master           rank 20
--            treasurer            rank 30
--            graphic-designer     rank 40
--   tier 4   joint-secretary      rank 10   (shared role; seat orders the holders)
--
-- Five tiers, 0 through 4, contiguous and with no gaps — anything rendering the chart can
-- treat tier as a row index rather than a sparse key.
--
-- Nothing here is destructive and every statement is safe to re-run.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_min_messages = warning;


-- ---------------------------------------------------------------------------
-- 1. Vice Chairperson and General Secretary share a level
-- ---------------------------------------------------------------------------
--
-- They were tiers 2 and 3, which drew the General Secretary as reporting to the Vice
-- Chairperson. They are peers, so they share tier 2 and everything below shifts up one.
--
-- Rank is what distinguishes them now that tier no longer does, so it is set deliberately
-- rather than left at the default: Vice Chairperson first, then General Secretary. The four
-- core-team roles keep the 10/20/30/40 order the site has been publishing all along — only
-- their tier number changes, not the order a visitor reads them in.
--
-- src/data/hierarchy.ts still ships the old numbers. That is not drift to repair here: the
-- static catalogue is the seed the first migration was written from, no page merges the two,
-- and every surface reads public.hierarchy_roles.

UPDATE "public"."hierarchy_roles" SET "tier" = 0, "rank" = 10 WHERE "slug" = 'faculty-advisor';
UPDATE "public"."hierarchy_roles" SET "tier" = 1, "rank" = 10 WHERE "slug" = 'chairperson';

UPDATE "public"."hierarchy_roles" SET "tier" = 2, "rank" = 10 WHERE "slug" = 'vice-chairperson';
UPDATE "public"."hierarchy_roles" SET "tier" = 2, "rank" = 20 WHERE "slug" = 'general-secretary';

UPDATE "public"."hierarchy_roles" SET "tier" = 3, "rank" = 10 WHERE "slug" = 'operations-manager';
UPDATE "public"."hierarchy_roles" SET "tier" = 3, "rank" = 20 WHERE "slug" = 'web-master';
UPDATE "public"."hierarchy_roles" SET "tier" = 3, "rank" = 30 WHERE "slug" = 'treasurer';
UPDATE "public"."hierarchy_roles" SET "tier" = 3, "rank" = 40 WHERE "slug" = 'graphic-designer';

UPDATE "public"."hierarchy_roles" SET "tier" = 4, "rank" = 10 WHERE "slug" = 'joint-secretary';


-- ---------------------------------------------------------------------------
-- 2. "No photograph" is NULL, not a path into the front-end's public folder
-- ---------------------------------------------------------------------------
--
-- Every one of the fifteen seeded members carries photo_url = '/brand-logo.png' with
-- photo_path = NULL. That string is not a photograph and not even a URL — it is the path of
-- an asset in the Vite public folder, so the database was holding a fact about the front-end
-- build. Rename the file, serve the site under a base path, and every row breaks.
--
-- It also made two different situations indistinguishable: a member whose photograph has not
-- been supplied, and a member whose portrait somebody deliberately chose not to publish. Both
-- are now NULL, which is what the column already means everywhere else in the schema.
--
-- Nothing changes for a visitor. Every surface that draws a member already falls back to the
-- society logo on an empty photo — HierarchyPage, AboutPage, HierarchyOrbit and the admin
-- roster all render `member.photo || PLACEHOLDER_PHOTO` — so the logo keeps appearing exactly
-- where it appears today, now as a rendering decision rather than as stored data.
--
-- photo_path is deliberately untouched: it is already NULL on every one of these rows (no
-- upload has ever landed), and a row that did own a stored file must keep pointing at it.

UPDATE "public"."hierarchy_members"
   SET "photo_url" = NULL
 WHERE "photo_url" = '/brand-logo.png'
   AND "photo_path" IS NULL;


-- ---------------------------------------------------------------------------
-- 3. Filing a term that is not the current one
-- ---------------------------------------------------------------------------
--
-- public.start_hierarchy_term is the only way to create a term today, and it promotes what it
-- creates: it clears is_current on the incumbent and sets it on the new row. Used to enter a
-- 2024 council for the archive it would hand the site's serving council to a term from two
-- years ago, which is the opposite of what backfilling means.
--
-- So backfilling gets its own function. It never touches is_current on any row, which keeps
-- hierarchy_terms_single_current_idx — the partial unique index permitting at most one
-- current term — satisfied by construction rather than by care.
--
-- The gate is private.can_manage_content(), the same authority that owns the roster rows and
-- the member-photos bucket; it is the chairperson, vice chairperson, general secretary and
-- webmaster. A term nobody may fill is not worth creating, so the two permissions are one.
--
-- SECURITY DEFINER for the same reason start_hierarchy_term is: the function raises 42501
-- with a sentence an admin can read, where a bare RLS refusal on the table would come back as
-- zero rows and no error at all.
--
-- ON CONFLICT is an update of the label alone. A code that already exists is a term someone
-- typed twice or a label being corrected — never a reason to change which term is serving, so
-- is_current is left exactly as it was found. Adding the term that is already current
-- therefore renames it and nothing more.

CREATE OR REPLACE FUNCTION "public"."add_hierarchy_term"("new_term" "text", "new_label" "text")
RETURNS "public"."hierarchy_terms"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
declare
  added public.hierarchy_terms;
begin
  if not private.can_manage_content() then
    raise exception 'Only content managers can add a hierarchy term'
      using errcode = '42501';
  end if;

  if coalesce(btrim(new_term), '') = '' or coalesce(btrim(new_label), '') = '' then
    raise exception 'A term code and a label are both required'
      using errcode = '22023';
  end if;

  insert into public.hierarchy_terms (term, label, is_current)
  values (btrim(new_term), btrim(new_label), false)
  on conflict (term) do update
     set label = excluded.label
  returning * into added;

  return added;
end;
$$;


ALTER FUNCTION "public"."add_hierarchy_term"("new_term" "text", "new_label" "text") OWNER TO "postgres";

-- Matching start_hierarchy_term: revoked from PUBLIC so an anonymous visitor cannot reach it
-- at all, then granted to authenticated, where the function's own check decides.
REVOKE ALL ON FUNCTION "public"."add_hierarchy_term"("new_term" "text", "new_label" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_hierarchy_term"("new_term" "text", "new_label" "text") TO "authenticated";
