-- Seeds public.faqs and public.quick_links from the lists the front end has been shipping in
-- src/data/faqs.ts and src/data/quickLinks.ts, so the two public pages are not blank the
-- moment they stop reading those files and start reading the database.
--
-- Neither table is touched again once it holds anything. Both key on a generated uuid, so
-- unlike the hierarchy and footer seeds there is no natural conflict target to hang an
-- ON CONFLICT DO NOTHING on, and a plain re-run would insert a second copy of all thirty rows.
-- The guard is therefore literally "seed only a completely empty table": a re-run over a table
-- that still holds one row does nothing, but a re-run over a table an admin has emptied would
-- put all of these back. The CLI does not re-run an applied migration, so that is a caveat on
-- copying this file rather than on shipping it.
--
-- public.footer_links is deliberately absent. It was seeded by
-- 20260901000400_hierarchy_and_content.sql and its fifteen live rows were checked against
-- src/data/footerLinks.ts before this migration was written — same ids, labels, paths and
-- columns, all enabled, sort_order 10..60 within each column. There is no drift to correct and
-- nothing here should overwrite an admin's later edits to them.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_min_messages = warning;


-- sort_order is gapped by 10 for the same reason the footer's is: the application reorders by
-- swapping two neighbouring values, but a later "insert between these two" wants room to land
-- in without renumbering everything below it.
--
-- It runs unbroken across the FAQ list, which the application orders as one collection because
-- the public page's "All" tab shows it as one. Quick links restart at 10 in each category, the
-- way footer links restart in each column: the public page draws one card per category, so
-- that is the only span in which one quick link is above or below another.
--
-- created_by stays NULL. It records which admin wrote a row, and no admin wrote these.
INSERT INTO "public"."faqs" ("question", "answer", "category", "sort_order")
SELECT "v"."question", "v"."answer", "v"."category", "v"."sort_order"
FROM (VALUES
    ('What is IEEE Computer Society?',
     'IEEE Computer Society is the world’s leading membership organization for computing professionals, and our Islamabad Branch Chapter brings its resources, events, and mentorship directly to students on campus.',
     'IEEE CS', 10),
    ('How do I become a member?',
     'You can join by filling out the membership form linked on our Instagram bio or by visiting our booth during orientation week.',
     'IEEE CS', 20),
    ('Are past papers verified before publishing?',
     'Yes. Every submitted paper is reviewed by a moderator and marked as Verified, Pending, or Unverified so you know how much to trust it.',
     'Past Papers', 30),
    ('Can I request a paper that isn’t on the site?',
     'Yes, use the "Request Missing Paper" form on the Past Papers page and we will try to source it from other students.',
     'Past Papers', 40),
    ('Where can I find a course’s CDF or lab manual?',
     'Open the course from the Courses page — CDF and lab manual links are listed on the course detail page when available.',
     'Courses', 50),
    ('Do you show teacher ratings?',
     'No. We intentionally do not publish teacher ratings or reviews. We only provide factual contact and course-assignment information.',
     'Courses', 60),
    ('How do I register for an event?',
     'Open the event detail page and click "Register" to fill out the short registration form. You’ll get an on-screen confirmation.',
     'Events', 70),
    ('What if an event is full?',
     'Registration closes automatically once capacity is reached. Keep an eye on the Announcements page for additional slots.',
     'Events', 80),
    ('How accurate is the CS Block navigation tool?',
     'Routes are contributed and checked by student volunteers. If you find an incorrect route, please use the "Report Wrong Route" form.',
     'Navigation', 90),
    ('Can I submit my semester project to the Projects Expo?',
     'Yes, any student project is welcome. Use the "Submit Project" form on the Projects Expo page.',
     'Projects Expo', 100),
    ('How can I contribute resources?',
     'Visit the Contribute page for a full list of ways to help — past papers, course corrections, project submissions, navigation reports, and more.',
     'Contributions', 110),
    ('The site isn’t loading a PDF correctly, what do I do?',
     'Please report the issue via the Contact form under the "Technical Issues" category with as much detail as possible.',
     'Technical Issues', 120)
) AS "v"("question", "answer", "category", "sort_order")
WHERE NOT EXISTS (SELECT 1 FROM "public"."faqs");


INSERT INTO "public"."quick_links" ("label", "url", "category", "sort_order")
SELECT "v"."label", "v"."url", "v"."category", "v"."sort_order"
FROM (VALUES
    ('CUOnline Portal',                    'https://cuonline.example.edu',    'University Portals', 10),
    ('Learning Management System (LMS)',   'https://lms.example.edu',         'University Portals', 20),
    ('Academic Calendar',                  'https://example.edu/calendar',    'University Portals', 30),
    ('Department Website',                 'https://example.edu/cs',          'University Portals', 40),
    ('Past Papers Archive',                '/past-papers',                    'Past Paper Links',   10),
    ('Contribute Course Material',         '/past-papers/contribute',         'Past Paper Links',   20),
    ('Request a Missing Paper',            '/past-papers/request',            'Past Paper Links',   30),
    ('Course Directory',                   '/courses',                        'Academic Resources', 10),
    ('Teacher Directory',                  '/courses/teachers',               'Academic Resources', 20),
    ('Suggest a Course Correction',        '/courses/suggest-correction',     'Academic Resources', 30),
    ('IEEE CS Instagram',                  'https://instagram.com',           'Society Links',      10),
    ('IEEE CS LinkedIn',                   'https://linkedin.com',            'Society Links',      20),
    ('IEEE CS WhatsApp Channel',           'https://whatsapp.com',            'Society Links',      30),
    ('Event Registration Forms',           '/events',                         'Event Links',        10),
    ('Report a Navigation Issue',          '/navigation/report',              'Forms',              10),
    ('General Feedback Form',              '/contribute',                     'Forms',              20),
    ('FAQ & Contact',                      '/faq-contact',                    'Student Help',       10),
    ('CS Block Navigation',                '/navigation',                     'Student Help',       20)
) AS "v"("label", "url", "category", "sort_order")
WHERE NOT EXISTS (SELECT 1 FROM "public"."quick_links");
