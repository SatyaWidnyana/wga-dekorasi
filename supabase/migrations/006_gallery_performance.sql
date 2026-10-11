-- Run after 005_catalog_gallery.sql. No photos, categories, or reviews are removed.
begin;

create index if not exists moment_photos_page_idx on public.moment_photos (created_at asc, id asc);
create index if not exists catalog_items_page_idx
  on public.catalog_items (legacy_page asc nulls last, created_at asc, id asc);
create index if not exists catalog_items_category_page_idx
  on public.catalog_items (category, legacy_page asc nulls last, created_at asc, id asc);
create index if not exists reviews_public_page_idx
  on public.reviews (created_at desc, id desc) where status <> 'rejected';

create or replace function public.wga_review_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'totalReviews', count(*),
    'averageRating', coalesce(round(avg(rating), 1), 0)
  ) from public.reviews where status <> 'rejected';
$$;
revoke all on function public.wga_review_summary() from public, anon, authenticated;
grant execute on function public.wga_review_summary() to service_role;

commit;
