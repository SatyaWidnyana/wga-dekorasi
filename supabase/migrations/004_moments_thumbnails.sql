-- Add lightweight variants so public gallery pages do not load original photos.
-- Run once after 003_moments_gallery.sql.
begin;

alter table public.moment_photos
  add column if not exists thumb_path text,
  add column if not exists thumb_url text,
  add column if not exists thumb_bytes integer;

alter table public.moment_photos
  drop constraint if exists moment_photos_bytes_check;

alter table public.moment_photos
  add constraint moment_photos_bytes_check check (bytes between 1 and 3145728),
  add constraint moment_photos_thumb_bytes_check check (thumb_bytes is null or thumb_bytes between 1 and 1048576);

commit;
