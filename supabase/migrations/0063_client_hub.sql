-- ContractorHQ — Client Hub, Phase 1 (auth only). Run AFTER 0062.
--
-- A client's hub session is a real Supabase Auth session — but obtained
-- through Supabase's own passwordless magic-link (OTP) flow, via a SEPARATE
-- Supabase client instance scoped to its own localStorage key
-- (src/lib/portalSupabase.ts). It never shares storage, and never shares an
-- auth.users row's *purpose*, with a contractor's own password-based
-- session (src/lib/auth.tsx) — the two are fully independent even in the
-- same browser tab.
--
-- clients.email has no uniqueness constraint (confirmed: the same email can
-- appear under multiple contractors, or twice under one), so a portal
-- identity is never linked by a stored foreign key. Instead, "which
-- clients does this signed-in email belong to" is computed fresh on every
-- read via get_portal_context() below — correct even if a contractor edits
-- a client's email later, and naturally supports one homeowner having
-- projects with more than one ContractorHQ contractor.
--
-- Every hub data read goes through a SECURITY DEFINER function that derives
-- the caller's identity from their own verified JWT email — never from a
-- client-supplied id — so there is no parameter a portal session could
-- tamper with to reach another client's data. Same reasoning as the
-- existing get_shared_quote()-style functions (0004): RLS on the base
-- tables stays owner-only forever; a function is the boundary.

alter table public.clients
  add column if not exists portal_invited_at timestamptz,
  add column if not exists portal_last_sign_in_at timestamptz;

-- Logged by the portal-request-link Edge Function on every self-service
-- sign-in request (match or not) — used purely to rate-limit per email and
-- per IP. Never read by anything client-facing; only the Edge Function's
-- service-role key ever touches this table, so no policy grants anything
-- to anon/authenticated.
create table public.portal_link_requests (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  ip_address text,
  created_at timestamptz not null default now()
);

create index on public.portal_link_requests (email, created_at);
create index on public.portal_link_requests (ip_address, created_at);

alter table public.portal_link_requests enable row level security;
revoke all on public.portal_link_requests from anon, authenticated;

-- Stamps portal_last_sign_in_at on every client row that shares the
-- caller's own verified email — called once, client-side, right after a
-- portal session is established. SECURITY DEFINER because clients' own RLS
-- is owner-only and this must run as the (unrelated) portal identity; safe
-- because it only ever touches rows matching the caller's OWN email, never
-- an id supplied by the caller.
create or replace function public.record_portal_sign_in()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email = '' then
    return;
  end if;
  update public.clients
     set portal_last_sign_in_at = now()
   where lower(email) = v_email;
end;
$$;

grant execute on function public.record_portal_sign_in() to authenticated;

-- The hub's one and only read for "who am I, and what can I see" — every
-- client record (across every contractor) matching the signed-in portal
-- email, each with its own projects and its contractor's business name.
-- The landing screen uses this to decide: no matches (no access), exactly
-- one project (go straight there), or several (show a picker).
create or replace function public.get_portal_context()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'client_id', c.id,
      'client_name', c.name,
      'business_name', bp.company_name,
      'projects', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status)
          order by p.created_at desc
        )
        from public.projects p
        where p.client_id = c.id
      ), '[]'::jsonb)
    )
  ), '[]'::jsonb)
  from public.clients c
  left join public.business_profile bp on bp.user_id = c.user_id
  where c.email is not null
    and c.email <> ''
    and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

grant execute on function public.get_portal_context() to authenticated;
