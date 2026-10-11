-- Gallery of real event moments, separate from the rental catalogue.
-- Run once after 002_review_visibility_and_delete.sql.
begin;

create table public.moment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 60),
  created_at timestamptz not null default now()
);

create table public.moment_photos (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  title text not null default '' check (char_length(title) <= 120),
  category text not null references public.moment_categories(name) on update cascade,
  url text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  bytes integer not null check (bytes between 1 and 3145728),
  created_at timestamptz not null default now()
);
create index moment_photos_category_idx on public.moment_photos (category, created_at desc, id desc);

insert into public.moment_categories (name) values
  ('Dekor'), ('Tenda'), ('Panggung'), ('Meja'), ('Warung'), ('Kursi'),
  ('Sound & Lighting'), ('Peralatan'), ('Alat Makan'), ('Kain Dinding'), ('Alat Masak')
on conflict (name) do nothing;

insert into storage.buckets (id, name, public)
values ('wga-moments', 'wga-moments', true)
on conflict (id) do update set public = excluded.public;

alter table public.moment_categories enable row level security;
alter table public.moment_photos enable row level security;
revoke all on public.moment_categories, public.moment_photos from public, anon, authenticated;
grant all on public.moment_categories, public.moment_photos to service_role;

commit;
