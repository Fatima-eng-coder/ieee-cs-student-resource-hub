-- Link events and announcements to a registration/response form, and let either one be
-- promoted onto the homepage.
--
-- Depends on 20260901000200_forms.sql having created public.forms.
--
-- Every statement here is additive and re-runnable: nothing is dropped, no existing column
-- changes type, and the one data backfill refuses to touch a row an admin has since edited.


-- ---------------------------------------------------------------------------------------
-- 1. Form attachment
-- ---------------------------------------------------------------------------------------

alter table public.events
  add column if not exists form_source        text not null default 'none',
  add column if not exists external_form_url  text,
  add column if not exists form_id            uuid references public.forms(id) on delete set null;

alter table public.announcements
  add column if not exists form_source        text not null default 'none',
  add column if not exists external_form_url  text,
  add column if not exists form_id            uuid references public.forms(id) on delete set null;

-- on delete set null rather than cascade: deleting a form must never take the event or the
-- announcement with it. The row falls back to an unattached state and an admin re-points it.


-- Backfill before the coherence constraint lands, so the constraint validates the final
-- state in a single pass.
--
-- The form_source='none' / both-columns-null predicate is what makes this safe to re-run.
-- Without it, a second application would stomp an event an admin had since switched to an
-- internal form (registration_url is never cleared, so it stays a live match forever) and
-- would then fail the coherence check with both external_form_url and form_id populated.
--
-- registration_url values that are present but blank are skipped: 'external' requires a
-- non-empty URL, and an empty string is not a working link anyway.
update public.events
set form_source       = 'external',
    external_form_url = registration_url
where registration_url is not null
  and btrim(registration_url) <> ''
  and form_source = 'none'
  and external_form_url is null
  and form_id is null;

-- No set_updated_at trigger exists on public.events, so this backfill deliberately leaves
-- updated_at untouched: a schema migration is not a content edit and should not reorder any
-- admin view sorted by recency.


do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_form_source_check'
  ) then
    alter table public.events
      add constraint events_form_source_check
      check (form_source = any (array['none'::text, 'external'::text, 'internal'::text]));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.announcements'::regclass
      and conname = 'announcements_form_source_check'
  ) then
    alter table public.announcements
      add constraint announcements_form_source_check
      check (form_source = any (array['none'::text, 'external'::text, 'internal'::text]));
  end if;
end
$$;


-- The three form states are mutually exclusive and each one is fully specified. Enforcing
-- this in the database rather than the form editor means a half-configured row cannot exist
-- at all, so the homepage and the event page never have to render a Register button that
-- points nowhere. The btrim guard is part of that: 'external' with an empty URL string is
-- the exact half-configured state this is meant to prevent.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_form_config_check'
  ) then
    alter table public.events
      add constraint events_form_config_check
      check (
        (form_source = 'none'
          and external_form_url is null
          and form_id is null)
        or
        (form_source = 'external'
          and external_form_url is not null
          and btrim(external_form_url) <> ''
          and form_id is null)
        or
        (form_source = 'internal'
          and form_id is not null
          and external_form_url is null)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.announcements'::regclass
      and conname = 'announcements_form_config_check'
  ) then
    alter table public.announcements
      add constraint announcements_form_config_check
      check (
        (form_source = 'none'
          and external_form_url is null
          and form_id is null)
        or
        (form_source = 'external'
          and external_form_url is not null
          and btrim(external_form_url) <> ''
          and form_id is null)
        or
        (form_source = 'internal'
          and form_id is not null
          and external_form_url is null)
      );
  end if;
end
$$;


-- The on delete set null above and the coherence check above contradict each other without
-- this trigger: deleting a form nulls form_id, which leaves form_source stranded at
-- 'internal', which the check then rejects -- so the delete aborts with an error naming
-- events rather than forms, and an in-use form can never be deleted at all.
--
-- Normalising form_source back to 'none' on the same statement is what actually delivers the
-- behaviour the foreign key advertises: the row detaches and survives.
create or replace function private.reset_form_source_on_detach() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if new.form_id is null and old.form_id is not null and new.form_source = 'internal' then
    new.form_source := 'none';
  end if;
  return new;
end;
$$;

alter function private.reset_form_source_on_detach() owner to postgres;

-- Scoped to "of form_id" so ordinary edits never pay for it. Fires on the referential
-- action's own UPDATE, which is what makes the delete succeed.
create or replace trigger events_reset_form_source
  before update of form_id on public.events
  for each row execute function private.reset_form_source_on_detach();

create or replace trigger announcements_reset_form_source
  before update of form_id on public.announcements
  for each row execute function private.reset_form_source_on_detach();


comment on column public.events.registration_url is
  'Superseded by form_source/external_form_url. Kept only so already-configured events keep '
  'working while the app still reads it; drop it in a separate migration once nothing does.';


-- ---------------------------------------------------------------------------------------
-- 2. Homepage promotion
-- ---------------------------------------------------------------------------------------

alter table public.events
  add column if not exists promoted        boolean not null default false,
  add column if not exists promo_headline  text,
  add column if not exists promo_cta_label text,
  add column if not exists promo_starts_at timestamp with time zone,
  add column if not exists promo_ends_at   timestamp with time zone,
  add column if not exists promo_sort      integer not null default 0;

alter table public.announcements
  add column if not exists promoted        boolean not null default false,
  add column if not exists promo_headline  text,
  add column if not exists promo_cta_label text,
  add column if not exists promo_starts_at timestamp with time zone,
  add column if not exists promo_ends_at   timestamp with time zone,
  add column if not exists promo_sort      integer not null default 0;


-- A window that closes before it opens would silently never promote anything, which reads to
-- an admin as a broken feature rather than a typo. These columns are new, so no live row can
-- fail this.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_promo_window_check'
  ) then
    alter table public.events
      add constraint events_promo_window_check
      check (promo_starts_at is null or promo_ends_at is null or promo_ends_at > promo_starts_at);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.announcements'::regclass
      and conname = 'announcements_promo_window_check'
  ) then
    alter table public.announcements
      add constraint announcements_promo_window_check
      check (promo_starts_at is null or promo_ends_at is null or promo_ends_at > promo_starts_at);
  end if;
end
$$;


-- Partial: the homepage never asks for un-promoted rows, and promoted rows are a handful out
-- of the whole table, so the index stays tiny and the planner can serve the promo strip
-- straight from it.
create index if not exists events_promoted_sort_idx
  on public.events using btree (promoted, promo_sort)
  where (promoted = true);

create index if not exists announcements_promoted_sort_idx
  on public.announcements using btree (promoted, promo_sort)
  where (promoted = true);


comment on column public.events.promo_headline is
  'Overrides title in the promo card only. The event page keeps showing title.';
comment on column public.announcements.promo_headline is
  'Overrides title in the promo card only. The announcement page keeps showing title.';


-- ---------------------------------------------------------------------------------------
-- 3. One query for the homepage promo strip
-- ---------------------------------------------------------------------------------------

-- A function rather than a view so the promo window is evaluated against now() at call time
-- and the two tables are merged server-side; the homepage makes one round trip instead of
-- two plus a client-side merge.
--
-- security definer bypasses RLS, so the visibility rules are restated in the where clauses
-- below and must be kept in step with the select policies on both tables.
create or replace function public.active_promotions()
returns table (
  kind              text,
  id                uuid,
  title             text,
  summary           text,
  image_url         text,
  cta_label         text,
  href_slug         text,
  form_source       text,
  external_form_url text,
  form_id           uuid,
  promo_sort        integer
)
    language sql
    stable
    security definer
    set search_path to 'public'
    as $$
  select
    p.kind,
    p.id,
    p.title,
    p.summary,
    p.image_url,
    p.cta_label,
    p.href_slug,
    p.form_source,
    p.external_form_url,
    p.form_id,
    p.promo_sort
  from (
    select
      'event'::text                                              as kind,
      e.id                                                       as id,
      coalesce(nullif(btrim(e.promo_headline), ''), e.title)      as title,
      e.description                                              as summary,
      e.cover_image_url                                          as image_url,
      nullif(btrim(e.promo_cta_label), '')                       as cta_label,
      -- Neither table has a slug column and both detail routes are /<kind>s/:id, so the id
      -- is the honest href segment. If a real slug column is ever added, change it here and
      -- the homepage does not have to move.
      e.id::text                                                 as href_slug,
      e.form_source                                              as form_source,
      e.external_form_url                                        as external_form_url,
      e.form_id                                                  as form_id,
      e.promo_sort                                               as promo_sort,
      e.created_at                                               as tiebreak
    from public.events e
    where e.promoted
      and e.is_published
      and (e.promo_starts_at is null or e.promo_starts_at <= now())
      and (e.promo_ends_at   is null or e.promo_ends_at   >  now())

    union all

    select
      'announcement'::text,
      a.id,
      coalesce(nullif(btrim(a.promo_headline), ''), a.title),
      a.summary,
      -- public.announcements has no image column. Returning null rather than inventing one
      -- keeps the signature uniform; the promo card falls back to a text-only layout.
      null::text,
      nullif(btrim(a.promo_cta_label), ''),
      a.id::text,
      a.form_source,
      a.external_form_url,
      a.form_id,
      a.promo_sort,
      a.created_at
    from public.announcements a
    -- No is_published filter because public.announcements has no such column: its select
    -- policy is "Anyone can read announcements" USING (true), so every row is already
    -- public and being promoted is the only gate that exists here.
    where a.promoted
      and (a.promo_starts_at is null or a.promo_starts_at <= now())
      and (a.promo_ends_at   is null or a.promo_ends_at   >  now())
  ) p
  -- tiebreak keeps the order total, so two items sharing a promo_sort do not swap places
  -- between renders.
  order by p.promo_sort asc, p.tiebreak desc, p.id asc;
$$;

alter function public.active_promotions() owner to postgres;

comment on function public.active_promotions() is
  'Homepage promo strip: promoted events and announcements merged, filtered to the current '
  'promo window, ordered by promo_sort. cta_label is null when unset so the caller owns the '
  'default label rather than the database hardcoding product copy.';

-- Revoked from public first: a security definer function is left executable by every role by
-- default, and only the two client roles have any business calling this one.
revoke all on function public.active_promotions() from PUBLIC;
grant execute on function public.active_promotions() to anon;
grant execute on function public.active_promotions() to authenticated;
grant execute on function public.active_promotions() to service_role;


-- ---------------------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------------------
--
-- No new policies. Both tables already have RLS enabled and the existing policies cover the
-- new columns as-is: Postgres RLS is row-scoped, and the grants on both tables are
-- table-level ("GRANT SELECT ... ON TABLE public.events TO anon", "GRANT ALL ... TO
-- authenticated") rather than column-level, so added columns inherit them automatically.
-- Adding anything here would only duplicate:
--   public.events         select  anon, authenticated  where is_published = true
--                         select  authenticated        private.can_manage_content()
--                         ins/upd/del authenticated    private.can_manage_content()
--   public.announcements  select  anon, authenticated  true
--                         ins/upd/del authenticated    private.can_manage_content()
--
-- Consequence worth stating: promo_headline, promo_cta_label and the promo window on an
-- unpublished event are readable only by content managers, because the anon select policy
-- still gates the whole row on is_published. Announcement promo fields are world-readable
-- the moment they are written, exactly like the rest of that table.
