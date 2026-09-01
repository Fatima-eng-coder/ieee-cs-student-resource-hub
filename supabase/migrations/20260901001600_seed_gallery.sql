-- Seed the gallery with the albums the site has been shipping from src/data/gallery.ts.
--
-- public.gallery_albums and public.gallery_photos were created empty in 20260901000400 and
-- nothing has ever written to them: until now the Gallery page read a localStorage collection
-- seeded from that TypeScript file, so a visitor on a fresh browser saw these three albums and
-- an admin's edits never left their own machine. Moving the pages onto the tables would blank
-- the public Gallery page unless the rows it used to synthesise exist for real. These are those
-- rows, verbatim.
--
-- Why fixed uuids and ON CONFLICT (id) DO NOTHING, rather than a guard on title+date:
--
--   * There is no unique index on (title, date), so `ON CONFLICT (title, date)` will not even
--     parse. Adding one purely to make a seed idempotent would be a schema change in service of
--     a one-off insert, and it would then forbid two albums of the same event in one day.
--   * The photos have to name their album. With the album ids fixed, every photo row carries its
--     album_id as a literal instead of a `(SELECT id FROM gallery_albums WHERE title = …)`
--     subquery that silently inserts nothing the moment somebody renames an album.
--   * DO NOTHING on the id means an admin who has already retitled, re-dated or re-covered one
--     of these keeps that edit if this file is ever replayed.
--
-- The one case this does not cover: an album deliberately deleted by an admin would come back on
-- a replay, because DO NOTHING cannot tell "already here" from "deliberately gone". Supabase
-- records applied migrations and will not re-run this, so that is a hypothetical; it is called
-- out here so nobody copies the pattern into something that does re-run.
--
-- image_url holds the URLs exactly as src/data/gallery.ts has them — public Unsplash addresses
-- this project does not host — and image_path stays NULL. image_path names an object inside the
-- storage bucket, and there is no object behind these; leaving it NULL is what keeps the admin
-- delete sweep from asking the bucket to remove files that were never there.

set local statement_timeout = '60s';

-- The uuids are arbitrary but deliberate: `0a11e400` reads as "gallery", the last block is the
-- album number, and a photo's last block is <album><index> so any row can be traced back to the
-- seed entry it came from at a glance.
INSERT INTO "public"."gallery_albums" ("id", "title", "date", "description", "cover_image_url", "cover_image_path", "sort_order")
VALUES
    (
        '0a11e400-0000-4000-8000-000000000001',
        'TechNova Hackathon 2025',
        '2025-08-03',
        'Highlights from our 24-hour flagship hackathon.',
        'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=900&q=80',
        NULL,
        0
    ),
    (
        '0a11e400-0000-4000-8000-000000000002',
        'Modern Web Systems Workshop',
        '2026-07-18',
        'Photos from the two-day workshop.',
        'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80',
        NULL,
        0
    ),
    (
        '0a11e400-0000-4000-8000-000000000003',
        'Projects Expo 2025',
        '2025-12-05',
        'Student projects on display.',
        'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80',
        NULL,
        0
    )
ON CONFLICT ("id") DO NOTHING;

-- Photo sort_order is the dense 0..n-1 index the app writes and reads, so each album opens with
-- its photos in the order src/data/gallery.ts listed them.
--
-- Album sort_order above is a different thing and is left at the column default of 0 on every
-- row on purpose: albums are read ordered by sort_order and then by date descending, so an
-- all-zero column leaves the gallery reading newest-first the way it always has, while keeping
-- sort_order free for pinning one album above the rest later.
INSERT INTO "public"."gallery_photos" ("id", "album_id", "image_url", "image_path", "caption", "sort_order")
VALUES
    (
        '0a11e400-0000-4000-8000-000000010001',
        '0a11e400-0000-4000-8000-000000000001',
        'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=900&q=80',
        NULL,
        'Opening ceremony',
        0
    ),
    (
        '0a11e400-0000-4000-8000-000000010002',
        '0a11e400-0000-4000-8000-000000000001',
        'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80',
        NULL,
        'Teams brainstorming',
        1
    ),
    (
        '0a11e400-0000-4000-8000-000000010003',
        '0a11e400-0000-4000-8000-000000000001',
        'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80',
        NULL,
        'Mentors assisting a team',
        2
    ),
    (
        '0a11e400-0000-4000-8000-000000010004',
        '0a11e400-0000-4000-8000-000000000001',
        'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80',
        NULL,
        'Winning team on stage',
        3
    ),
    (
        '0a11e400-0000-4000-8000-000000020001',
        '0a11e400-0000-4000-8000-000000000002',
        'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80',
        NULL,
        'Day 1 session',
        0
    ),
    (
        '0a11e400-0000-4000-8000-000000020002',
        '0a11e400-0000-4000-8000-000000000002',
        'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80',
        NULL,
        'Group activity',
        1
    ),
    (
        '0a11e400-0000-4000-8000-000000030001',
        '0a11e400-0000-4000-8000-000000000003',
        'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80',
        NULL,
        'Expo floor',
        0
    ),
    (
        '0a11e400-0000-4000-8000-000000030002',
        '0a11e400-0000-4000-8000-000000000003',
        'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=900&q=80',
        NULL,
        'Judging panel',
        1
    ),
    (
        '0a11e400-0000-4000-8000-000000030003',
        '0a11e400-0000-4000-8000-000000000003',
        'https://images.unsplash.com/photo-1523875194681-bedd468c58bf?auto=format&fit=crop&w=900&q=80',
        NULL,
        'Student demo',
        2
    )
ON CONFLICT ("id") DO NOTHING;
