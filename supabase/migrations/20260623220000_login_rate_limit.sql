/*
 * Distributed login rate limiting — shared across serverless instances.
 * Server actions call consume_login_rate_limit via service role.
 */

create table if not exists public.login_rate_limit_buckets (
  bucket_key text primary key,
  attempt_count integer not null default 1,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists login_rate_limit_buckets_reset_at_idx
  on public.login_rate_limit_buckets (reset_at);

alter table public.login_rate_limit_buckets enable row level security;

revoke all on table public.login_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_login_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_reset_at timestamptz;
  v_count integer;
begin
  if p_bucket_key is null or btrim(p_bucket_key) = '' then
    return true;
  end if;

  if p_limit is null or p_limit < 1 then
    return true;
  end if;

  select attempt_count, reset_at
  into v_count, v_reset_at
  from public.login_rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if not found then
    insert into public.login_rate_limit_buckets (bucket_key, attempt_count, reset_at)
    values (
      p_bucket_key,
      1,
      v_now + make_interval(secs => p_window_seconds)
    );
    return true;
  end if;

  if v_reset_at <= v_now then
    update public.login_rate_limit_buckets
    set
      attempt_count = 1,
      reset_at = v_now + make_interval(secs => p_window_seconds),
      updated_at = v_now
    where bucket_key = p_bucket_key;
    return true;
  end if;

  if v_count >= p_limit then
    return false;
  end if;

  update public.login_rate_limit_buckets
  set
    attempt_count = attempt_count + 1,
    updated_at = v_now
  where bucket_key = p_bucket_key;

  return true;
end;
$$;

revoke all on function public.consume_login_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_login_rate_limit(text, integer, integer) to service_role;
