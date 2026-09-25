/*
 * Phase 1 — Security hardening: function execute privileges
 *
 * Supabase security advisor (lint 0028) flagged SECURITY DEFINER functions
 * callable by anon via PostgREST /rest/v1/rpc/.... Internal helpers and email
 * body RPCs are not public API (ADR 0003). Revoke anon/PUBLIC execute; re-grant
 * only to authenticated where policies or views require it. Pins set_updated_at
 * search_path (lint 0011).
 */

-- ---------------------------------------------------------------------------
-- Pin search_path on trigger function (lint 0011)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Revoke default PUBLIC execute, then grant intentionally
-- ---------------------------------------------------------------------------

-- Internal: only invoked inside other SECURITY DEFINER functions
revoke all on function public.org_has_full_body_access(uuid) from public, anon, authenticated;

-- Used in RLS policies and security_invoker views — authenticated only
revoke all on function public.auth_org_id() from public, anon;
grant execute on function public.auth_org_id() to authenticated;

revoke all on function public.auth_is_admin() from public, anon;
grant execute on function public.auth_is_admin() to authenticated;

revoke all on function public.user_can_read_email_body(uuid, uuid) from public, anon;
grant execute on function public.user_can_read_email_body(uuid, uuid) to authenticated;

-- User-facing email RPCs (ADR 0003) — authenticated only
revoke all on function public.get_email_message_body(uuid) from public, anon;
grant execute on function public.get_email_message_body(uuid) to authenticated;

revoke all on function public.search_email_message_bodies(text, integer) from public, anon;
grant execute on function public.search_email_message_bodies(text, integer) to authenticated;
