-- Database-backed rental catalogue, separate from the field-moments gallery.
-- Run once after 004_moments_thumbnails.sql.
begin;

create table public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 60),
  created_at timestamptz not null default now()
);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  thumb_path text,
  title text not null check (char_length(title) between 1 and 120),
  category text not null references public.catalog_categories(name) on update cascade,
  url text not null,
  thumb_url text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  bytes integer not null check (bytes between 1 and 3145728),
  thumb_bytes integer check (thumb_bytes is null or thumb_bytes between 1 and 1048576),
  legacy_page integer unique check (legacy_page is null or legacy_page between 1 and 9999),
  created_at timestamptz not null default now()
);

create index catalog_items_category_idx
  on public.catalog_items (category, legacy_page asc nulls last, created_at desc, id desc);

insert into public.catalog_categories (name) values
  ('Dekor'), ('Tenda'), ('Panggung'), ('Meja'), ('Warung'), ('Kursi'),
  ('Sound & Lighting'), ('Peralatan'), ('Alat Makan'), ('Kain Dinding'), ('Alat Masak')
on conflict (name) do nothing;

insert into storage.buckets (id, name, public)
values ('wga-catalog', 'wga-catalog', true)
on conflict (id) do update set public = excluded.public;

alter table public.catalog_categories enable row level security;
alter table public.catalog_items enable row level security;
revoke all on public.catalog_categories, public.catalog_items from public, anon, authenticated;
grant all on public.catalog_categories, public.catalog_items to service_role;

commit;
