-- Record each committee member's gender, so the roster stops being a wall of identical
-- neutral figures.
--
-- Keyed on name rather than id on purpose: several people appear in more than one term and more
-- than one role -- Hadiya as chairperson and vice-chairperson, Shaharyar as treasurer and web
-- master -- and they are the same person each time. Setting it per name keeps every card for one
-- person in agreement.
--
-- Only rows still at 'unknown' are touched, so a value already set by hand in the admin panel
-- wins over this list. This runs once and should never overrule a human.
--
-- These are read from the names, which in Urdu and Arabic convention are strongly gendered.
-- Anything the application does with the value is cosmetic -- it selects a placeholder drawing
-- and is never rendered as text -- and it is a dropdown in the member drawer, so a wrong call
-- here is visible and corrected in seconds. 'Sir Muhammad Haris' carries the honorific used for
-- a male teacher.
--
-- Deliberately NOT covered: the row named 'test'. It is leftover test data rather than a person,
-- and giving it a gender would be tidying the wrong problem.

set local statement_timeout = '60s';

UPDATE "public"."hierarchy_members" AS m
   SET "gender" = v.gender
  FROM (VALUES
    ('Aaliyan',                   'male'),
    ('Asad',                      'male'),
    ('Hammad Khaliq',             'male'),
    ('Hashir Mehmood',            'male'),
    ('Mohammad Hashaam Sargaana', 'male'),
    ('Muhammad Ahsan',            'male'),
    ('Muhammad Asad Ali',         'male'),
    ('Muhammad Talha',            'male'),
    ('Muhammad Tayyab Alqan',     'male'),
    ('S. Abbas Raza',             'male'),
    ('Shaharyar Zia',             'male'),
    ('Sir Muhammad Haris',        'male'),
    ('Areeba Sajjal',             'female'),
    ('Arfa Zia',                  'female'),
    ('Eman Ramzan',               'female'),
    ('Fatima Azaz',               'female'),
    ('Hadiya Murad Hadi',         'female'),
    ('Hania Zaki',                'female'),
    ('Mahnoor Fatima',            'female'),
    ('Rania Malik',               'female'),
    ('Wadeea Imran',              'female')
  ) AS v(name, gender)
 WHERE m."name" = v.name
   AND m."gender" = 'unknown';
