-- Fill the credits page's blank designations from the current committee roster.
--
-- The five brainstormers were seeded with no designation, because none was supplied. Each of them
-- holds a role in the current term (FA26), read from hierarchy_members on 2026-09-17:
--
--   Hammad Khaliq       general-secretary
--   Areeba Sajjal       graphic-designer
--   Wadeea Imran        vice-chairperson
--   Muhammad Asad Ali   joint-secretary
--   Hadiya Murad Hadi   chairperson
--
-- The other four already match FA26 and are left alone: Muhammad Ahsan (operations-manager),
-- Fatima Azaz (treasurer) and Shaharyar Zia (web-master) are unchanged, and Syed Abbas Raza is not
-- on the FA26 roster -- his last term was SP26 as chairperson, which "Ex-Chairperson" already says.
--
-- Written in the same "<Role> IEEE CS CUI" form as the four the team supplied, so the page reads
-- consistently. Every update is guarded on the designation still being empty: this fills blanks,
-- it never replaces a title an admin has since written by hand, and re-running it is a no-op.

set local statement_timeout = '60s';

DO $$
DECLARE
    v_updated integer;
    v_total integer := 0;
BEGIN
    UPDATE "public"."developer_profiles" SET "designation" = 'General Secretary IEEE CS CUI'
        WHERE "slug" = 'hammad-khaliq' AND btrim("designation") = '';
    GET DIAGNOSTICS v_updated = ROW_COUNT; v_total := v_total + v_updated;

    UPDATE "public"."developer_profiles" SET "designation" = 'Graphic Designer IEEE CS CUI'
        WHERE "slug" = 'areeba-sajjal' AND btrim("designation") = '';
    GET DIAGNOSTICS v_updated = ROW_COUNT; v_total := v_total + v_updated;

    UPDATE "public"."developer_profiles" SET "designation" = 'Vice Chairperson IEEE CS CUI'
        WHERE "slug" = 'wadeea-imran' AND btrim("designation") = '';
    GET DIAGNOSTICS v_updated = ROW_COUNT; v_total := v_total + v_updated;

    UPDATE "public"."developer_profiles" SET "designation" = 'Joint Secretary IEEE CS CUI'
        WHERE "slug" = 'muhammad-asad-ali' AND btrim("designation") = '';
    GET DIAGNOSTICS v_updated = ROW_COUNT; v_total := v_total + v_updated;

    UPDATE "public"."developer_profiles" SET "designation" = 'Chairperson IEEE CS CUI'
        WHERE "slug" = 'hadiya-murad-hadi' AND btrim("designation") = '';
    GET DIAGNOSTICS v_updated = ROW_COUNT; v_total := v_total + v_updated;

    -- Reported rather than asserted: fewer than five simply means an admin had already filled some
    -- of these in, which is the case the guard exists for.
    RAISE NOTICE 'Filled % blank credit designation(s) from the FA26 roster.', v_total;
END $$;
