-- Reviews remain internally pending for compatibility, but all non-rejected reviews are public.
-- Run once after 001_reviews.sql in the existing Supabase project.
begin;

create or replace function public.wga_delete_review(p_id uuid, p_actor uuid)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.review_admins where user_id = p_actor) then
    raise exception 'Not authorized';
  end if;
  delete from public.reviews where id = p_id;
  if not found then return 'missing'; end if;
  return 'deleted';
end;
$$;

revoke all on function public.wga_delete_review(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wga_delete_review(uuid, uuid) to service_role;

commit;
