-- Give the committee their portal access.
--
-- NOT a migration. It lives here because it needs real email addresses filled in, and because
-- it should run once, deliberately, rather than on every `supabase db push`.
--
-- ---------------------------------------------------------------------------------------
-- Do this first: create the accounts without anyone sharing a password
-- ---------------------------------------------------------------------------------------
--
-- Supabase dashboard -> Authentication -> Users -> "Invite user", once per person below.
-- Each gets an email with a link to set their own password. Nobody -- not the chairperson, not
-- whoever runs this script -- ever learns anyone else's.
--
-- Do not create these by signing up through the site. The signup form enforces the student
-- address pattern (fa24-bcs-059@isbstudent.comsats.edu.pk), which is right for students and
-- wrong for a faculty advisor, and it would set every one of them to 'student' anyway.
--
-- An invited user gets a profiles row automatically: on_auth_user_created_create_profile fires
-- on insert into auth.users and writes id, name, email and role = 'student'. This script is
-- what turns that last column into the role they actually hold.
--
-- ---------------------------------------------------------------------------------------
-- Then run this, in the SQL editor
-- ---------------------------------------------------------------------------------------
--
-- Run it ONCE, to appoint the first chairperson and the founding committee. After that nobody
-- should come back here: the chairperson assigns every role from Team Access in the portal,
-- and 20260901002800 made that the only route an application can take.
--
-- This still works because the identity trigger returns early when auth.uid() is null, which it
-- is in the SQL editor. That is the bootstrap: the first chairperson cannot be appointed by a
-- chairperson, because there isn't one yet.
--
-- Replace every '...@example.com' with the address that person was invited on. Anything left
-- as a placeholder simply matches nothing -- the report at the bottom tells you which.
--
-- The four content-manager roles (chairperson, vice_chairperson, general_secretary, webmaster)
-- can manage every piece of site content AND read student personal data. The other three can
-- sign into the portal but cannot do either. Hand them out accordingly.

BEGIN;

WITH team (email, role) AS (
  VALUES
    -- Content managers: full portal access, including student personal data.
    ('...@example.com', 'chairperson'),        -- Hadiya Murad Hadi
    ('...@example.com', 'vice_chairperson'),   -- Wadeea Imran
    ('...@example.com', 'general_secretary'),  -- Hammad Khaliq
    ('...@example.com', 'webmaster'),          -- Shaharyar Zia

    -- Portal access without content management or access to student data.
    ('...@example.com', 'treasurer'),          -- Fatima Azaz
    ('...@example.com', 'graphic_designer'),   -- Areeba Sajjal
    ('...@example.com', 'operations_manager')  -- Muhammad Ahsan

    -- Sir Muhammad Haris (faculty advisor) is deliberately absent: there is no faculty_advisor
    -- value in the role CHECK, so there is nothing to assign. He appears on the public
    -- hierarchy page without an account, which is the point of keeping the roster and the
    -- login list as two separate things -- most of the council never needs to sign in.
    --
    -- The seven joint secretaries are absent for the same reason you asked: they were excluded.
    -- 'joint_secretary' is a valid role if that changes.
)
UPDATE public.profiles AS p
SET role = t.role
FROM team AS t
WHERE lower(p.email) = lower(t.email);

-- What actually happened. Read this before committing: a person who has not accepted their
-- invitation yet has no profiles row, so their line matches nothing and they stay without
-- access until they do.
SELECT
  t.email                                    AS invited_address,
  t.role                                     AS intended_role,
  COALESCE(p.role, '-- no account yet --')   AS role_now,
  COALESCE(p.name, '')                       AS name_on_account
FROM (
  VALUES
    ('...@example.com', 'chairperson'),
    ('...@example.com', 'vice_chairperson'),
    ('...@example.com', 'general_secretary'),
    ('...@example.com', 'webmaster'),
    ('...@example.com', 'treasurer'),
    ('...@example.com', 'graphic_designer'),
    ('...@example.com', 'operations_manager')
) AS t (email, role)
LEFT JOIN public.profiles p ON lower(p.email) = lower(t.email)
ORDER BY t.role;

-- Happy with the report? COMMIT. Otherwise ROLLBACK and fix the addresses.
COMMIT;
