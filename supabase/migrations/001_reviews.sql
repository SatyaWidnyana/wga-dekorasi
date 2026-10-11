-- Run once in a NEW development Supabase project. No existing tables are dropped.
begin;

create table public.review_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  location text not null check (char_length(location) between 2 and 100),
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 10 and 1500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  consent_at timestamptz not null default now(),
  consent_version text not null default '2026-10-v1',
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id),
  moderation_note text not null default '' check (char_length(moderation_note) <= 500),
  submission_hash text check (submission_hash is null or submission_hash ~ '^[a-f0-9]{64}$'),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$')
);
create index reviews_status_page_idx on public.reviews (status, created_at desc, id desc);
create index reviews_hash_idx on public.reviews (submission_hash, created_at desc);
create index reviews_ip_idx on public.reviews (ip_hash, created_at desc);

create table public.review_moderation_log (
  id bigint generated always as identity primary key,
  review_id uuid not null references public.reviews(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  old_status text not null,
  new_status text not null,
  note text not null check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create table public.review_rate_limits (
  scope text not null,
  key text not null,
  attempts integer not null,
  expires_at timestamptz not null,
  primary key (scope, key)
);
create index review_rate_expiry_idx on public.review_rate_limits(expires_at);

-- All access goes through authorized server endpoints, never directly from browsers.
alter table public.review_admins enable row level security;
alter table public.reviews enable row level security;
alter table public.review_moderation_log enable row level security;
alter table public.review_rate_limits enable row level security;
revoke all on public.review_admins, public.reviews, public.review_moderation_log, public.review_rate_limits from public, anon, authenticated;
grant all on public.review_admins, public.reviews, public.review_moderation_log, public.review_rate_limits to service_role;
grant usage, select on sequence public.review_moderation_log_id_seq to service_role;

-- Atomic fixed windows shared by every Vercel function instance.
-- Limits are selected here, not supplied by a public request.
create function public.wga_rate_limit(p_scope text, p_key text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_limit integer;
  v_window interval;
  v_count integer;
  v_global integer;
begin
  if p_key !~ '^[a-f0-9]{64}$' then raise exception 'Invalid key'; end if;
  case p_scope
    when 'review' then v_limit := 5; v_window := interval '1 hour'; v_global := 200;
    when 'login' then v_limit := 10; v_window := interval '15 minutes'; v_global := 500;
    when 'admin' then v_limit := 120; v_window := interval '1 minute'; v_global := 3000;
    else raise exception 'Invalid scope';
  end case;
  insert into public.review_rate_limits as r (scope, key, attempts, expires_at)
  values (p_scope || ':global', 'global', 1, now() + v_window)
  on conflict (scope, key) do update set
    attempts = case when r.expires_at <= now() then 1 else least(r.attempts + 1, v_global + 1) end,
    expires_at = case when r.expires_at <= now() then now() + v_window else r.expires_at end
  returning attempts into v_count;
  if v_count > v_global then return false; end if;

  insert into public.review_rate_limits as r (scope, key, attempts, expires_at)
  values (p_scope, p_key, 1, now() + v_window)
  on conflict (scope, key) do update set
    attempts = case when r.expires_at <= now() then 1 else least(r.attempts + 1, v_limit + 1) end,
    expires_at = case when r.expires_at <= now() then now() + v_window else r.expires_at end
  returning attempts into v_count;
  return v_count <= v_limit;
end;
$$;

create function public.wga_submit_review(p_name text, p_location text, p_rating integer, p_comment text, p_hash text, p_ip_hash text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if p_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid hash'; end if;
  -- IP lock and fingerprint lock prevent parallel submissions bypassing limits.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('review-ip:' || p_ip_hash, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('review-body:' || p_hash, 0));
  if exists (select 1 from public.reviews where submission_hash = p_hash and created_at > now() - interval '24 hours') then
    return 'received';
  end if;
  if (select count(*) from public.reviews where ip_hash = p_ip_hash and created_at > now() - interval '24 hours') >= 3 then
    return 'limited';
  end if;
  insert into public.reviews (name, location, rating, comment, submission_hash, ip_hash)
  values (p_name, p_location, p_rating, p_comment, p_hash, p_ip_hash);
  return 'received';
end;
$$;

create function public.wga_moderate_review(p_id uuid, p_actor uuid, p_status text, p_expected text, p_note text)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_old text;
begin
  if not exists (select 1 from public.review_admins where user_id = p_actor) then raise exception 'Not authorized'; end if;
  if p_status not in ('pending', 'approved', 'rejected') or p_expected not in ('pending', 'approved', 'rejected') then raise exception 'Invalid status'; end if;
  if char_length(p_note) > 500 then raise exception 'Note too long'; end if;
  select status into v_old from public.reviews where id = p_id for update;
  if not found then return 'missing'; end if;
  if v_old <> p_expected then return 'conflict'; end if;
  update public.reviews set status = p_status, moderated_at = now(), moderated_by = p_actor, moderation_note = p_note where id = p_id;
  insert into public.review_moderation_log (review_id, admin_id, old_status, new_status, note)
  values (p_id, p_actor, v_old, p_status, p_note);
  return 'updated';
end;
$$;

-- Run daily via Supabase Cron (instructions in docs/reviews-setup.md).
create function public.wga_cleanup_review_security()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.review_rate_limits where expires_at < now() - interval '1 day';
  update public.reviews set ip_hash = null, submission_hash = null
    where created_at < now() - interval '30 days' and (ip_hash is not null or submission_hash is not null);
end;
$$;

revoke all on function public.wga_rate_limit(text,text), public.wga_submit_review(text,text,integer,text,text,text), public.wga_moderate_review(uuid,uuid,text,text,text), public.wga_cleanup_review_security() from public, anon, authenticated;
grant execute on function public.wga_rate_limit(text,text), public.wga_submit_review(text,text,integer,text,text,text), public.wga_moderate_review(uuid,uuid,text,text,text), public.wga_cleanup_review_security() to service_role;
commit;
