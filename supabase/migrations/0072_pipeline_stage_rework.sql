-- ContractorHQ — CRM Pipeline stage rework. Replaces the 11 default stages
-- with a leaner 8-stage set (New Lead, Contacted, Site Visit Scheduled,
-- Site Visit Done, Proposal Sent, Revisions, Won, Lost) and teaches the
-- quote-signing RPCs (both the public share-token link and the Client Hub
-- portal) to auto-advance a linked opportunity to Won the moment the
-- client signs — the one auto-advance that has to live in SQL rather than
-- the TS app layer, since neither signing path runs with an owner session
-- (RLS revokes all access to `opportunities` from anon, and the portal
-- session is the CLIENT's JWT, not the owner's — SECURITY DEFINER is the
-- only way either path can touch `opportunities` at all). Run AFTER 0071.
--
-- ---------------------------------------------------------------------------
-- 1. Drop the CHECK constraint FIRST, before migrating any data — several
--    of the new stage values (site_visit_done, revisions) don't exist in
--    the old 11-value enum, so backfilling into them while the old
--    constraint is still live would itself violate it (same drop-first
--    order 0069's change_orders.status rework used; the constraint is
--    re-added, tightened to the new 8-value enum, once all rows already
--    hold a valid new value — see step 3).
-- ---------------------------------------------------------------------------

alter table public.opportunities drop constraint if exists opportunities_stage_check;

-- ---------------------------------------------------------------------------
-- 2. Migrate existing leads to their closest new stage. Each move is
--    logged to the opportunity's activity timeline exactly like a normal
--    stage change — this is a plain data migration, not a call through
--    any TS automation, so nothing else fires as a side effect.
--
--    Mapping:
--      attempting_contact    -> new_lead
--      qualified              -> contacted
--      site_visit_completed   -> site_visit_done
--      estimate_in_progress   -> site_visit_done
--      follow_up               -> proposal_sent
--    Same-name stages (new_lead, contacted, site_visit_scheduled,
--    proposal_sent, won, lost) need no migration at all.
-- ---------------------------------------------------------------------------

insert into public.activities (client_id, opportunity_id, created_by, kind, summary, meta)
select o.client_id, o.id, c.user_id, 'stage_changed',
       'Stage changed: Attempting Contact → New Lead (pipeline migration)', '{}'::jsonb
from public.opportunities o
join public.clients c on c.id = o.client_id
where o.stage = 'attempting_contact';

update public.opportunities set stage = 'new_lead' where stage = 'attempting_contact';

insert into public.activities (client_id, opportunity_id, created_by, kind, summary, meta)
select o.client_id, o.id, c.user_id, 'stage_changed',
       'Stage changed: Qualified → Contacted (pipeline migration)', '{}'::jsonb
from public.opportunities o
join public.clients c on c.id = o.client_id
where o.stage = 'qualified';

update public.opportunities set stage = 'contacted' where stage = 'qualified';

insert into public.activities (client_id, opportunity_id, created_by, kind, summary, meta)
select o.client_id, o.id, c.user_id, 'stage_changed',
       'Stage changed: Site Visit Completed → Site Visit Done (pipeline migration)', '{}'::jsonb
from public.opportunities o
join public.clients c on c.id = o.client_id
where o.stage = 'site_visit_completed';

insert into public.activities (client_id, opportunity_id, created_by, kind, summary, meta)
select o.client_id, o.id, c.user_id, 'stage_changed',
       'Stage changed: Estimate in Progress → Site Visit Done (pipeline migration)', '{}'::jsonb
from public.opportunities o
join public.clients c on c.id = o.client_id
where o.stage = 'estimate_in_progress';

update public.opportunities set stage = 'site_visit_done'
  where stage in ('site_visit_completed', 'estimate_in_progress');

insert into public.activities (client_id, opportunity_id, created_by, kind, summary, meta)
select o.client_id, o.id, c.user_id, 'stage_changed',
       'Stage changed: Follow-Up / Decision → Proposal Sent (pipeline migration)', '{}'::jsonb
from public.opportunities o
join public.clients c on c.id = o.client_id
where o.stage = 'follow_up';

update public.opportunities set stage = 'proposal_sent' where stage = 'follow_up';

-- ---------------------------------------------------------------------------
-- 3. Tighten the CHECK constraint to the new 8-value enum. 'revisions' is
--    brand new (nothing maps into it automatically — the contractor sets
--    it manually when a client asks for changes, per spec); every other
--    removed value has already been backfilled above.
-- ---------------------------------------------------------------------------

alter table public.opportunities
  add constraint opportunities_stage_check
  check (stage in (
    'new_lead', 'contacted', 'site_visit_scheduled', 'site_visit_done',
    'proposal_sent', 'revisions', 'won', 'lost'
  ));

-- ---------------------------------------------------------------------------
-- 4. sign_quote (public /quote/:token share-link) — re-issued from 0013 to
--    additionally advance a linked opportunity (opportunities.quote_id =
--    the signed quote's id) to Won. Only fires if there IS a linked
--    opportunity and it isn't already Won (idempotent, and avoids a
--    redundant "Won -> Won" activity entry on a re-run/resend edge case).
--    Deliberately does NOT check for 'lost' — the client signing is an
--    unambiguous, overriding signal regardless of a prior manual mark.
-- ---------------------------------------------------------------------------

create or replace function public.sign_quote(p_token uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id              uuid;
  v_project_id            uuid;
  v_user_id               uuid;
  v_signed_by             text;
  v_opportunity_id        uuid;
  v_opportunity_client_id uuid;
  v_opportunity_stage     text;
begin
  if p_token is null then
    return;
  end if;

  update public.quotes
     set signed_at = now(),
         status = 'approved',
         signed_by = nullif(trim(p_signed_by), '')
   where share_token = p_token
     and signed_at is null
  returning id, project_id, user_id, signed_by
      into v_quote_id, v_project_id, v_user_id, v_signed_by;

  if v_project_id is not null then
    update public.projects set status = 'approved' where id = v_project_id;

    insert into public.project_events (project_id, user_id, kind, summary, meta)
    values (
      v_project_id,
      v_user_id,
      'quote_signed',
      'Quote approved' || coalesce(' by ' || v_signed_by, ''),
      '{}'::jsonb
    );
  end if;

  if v_quote_id is not null then
    select o.id, o.client_id, o.stage
      into v_opportunity_id, v_opportunity_client_id, v_opportunity_stage
    from public.opportunities o
    where o.quote_id = v_quote_id;

    if v_opportunity_id is not null and v_opportunity_stage is distinct from 'won' then
      update public.opportunities set stage = 'won' where id = v_opportunity_id;

      insert into public.activities (client_id, opportunity_id, created_by, kind, summary, meta)
      values (
        v_opportunity_client_id,
        v_opportunity_id,
        v_user_id,
        'stage_changed',
        'Stage changed: ' || initcap(replace(v_opportunity_stage, '_', ' ')) || ' → Won',
        '{}'::jsonb
      );
    end if;
  end if;
end $$;

revoke execute on function public.sign_quote(uuid, text) from public;
grant execute on function public.sign_quote(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. portal_approve_quote (Client Hub) — same Won auto-advance, re-issued
--    from 0065. The portal session is the CLIENT's JWT (never the owner's),
--    so this needs the same SECURITY DEFINER treatment as sign_quote.
-- ---------------------------------------------------------------------------

create or replace function public.portal_approve_quote(p_quote_id uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id             uuid;
  v_quote_id               uuid;
  v_user_id                uuid;
  v_opportunity_id         uuid;
  v_opportunity_client_id  uuid;
  v_opportunity_stage      text;
begin
  update public.quotes q
     set status = 'approved',
         signed_at = now(),
         signed_by = nullif(trim(p_signed_by), ''),
         signed_ip = portal_request_ip()
    from public.projects p, public.clients c
   where q.id = p_quote_id
     and p.id = q.project_id
     and c.id = p.client_id
     and q.status = 'sent'
     and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   returning q.project_id, q.id, q.user_id into v_project_id, v_quote_id, v_user_id;

  if v_project_id is not null then
    update public.projects set status = 'approved' where id = v_project_id;
    insert into public.project_events (project_id, user_id, kind, summary)
    select v_project_id, p.user_id, 'quote_signed',
           'Quote approved' || case
             when nullif(trim(p_signed_by), '') is not null then ' by ' || trim(p_signed_by)
             else ''
           end
    from public.projects p where p.id = v_project_id;
  end if;

  if v_quote_id is not null then
    select o.id, o.client_id, o.stage
      into v_opportunity_id, v_opportunity_client_id, v_opportunity_stage
    from public.opportunities o
    where o.quote_id = v_quote_id;

    if v_opportunity_id is not null and v_opportunity_stage is distinct from 'won' then
      update public.opportunities set stage = 'won' where id = v_opportunity_id;

      insert into public.activities (client_id, opportunity_id, created_by, kind, summary, meta)
      values (
        v_opportunity_client_id,
        v_opportunity_id,
        v_user_id,
        'stage_changed',
        'Stage changed: ' || initcap(replace(v_opportunity_stage, '_', ' ')) || ' → Won',
        '{}'::jsonb
      );
    end if;
  end if;
end;
$$;

grant execute on function public.portal_approve_quote(uuid, text) to authenticated;
