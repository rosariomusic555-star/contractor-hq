-- ContractorHQ — Quote activity tracking. Run AFTER 0116.
--
-- When and how a client engages with a quote (Client Hub + share link),
-- recorded through our own backend only — no third-party scripts, no IP
-- address stored, no fingerprinting: a random per-tab session key, a coarse
-- device type (mobile / tablet / desktop) and time on the quote.
--
--   quote_view_sessions    one row per viewing session (a new one after 30
--                          minutes of inactivity); active seconds; sections
--                          scrolled into view; the version being viewed
--   quote_activity_events  opened / selection changed / optional changed /
--                          pdf downloaded / approved / declined
--   quotes.sent_at, view_count, first/last_viewed_at, last_view_device,
--   last_activity_at, selections_changed_at — rollups for lists / pipeline
--   notifications          in-app (the app had none — Settings'
--                          Notifications page was decorative)
--   notification_settings  per-contractor toggles + "going cold" X / Y days
--   automation_rules / automation_runs — a small real automations engine:
--                          "Quote viewed", "not opened after X days",
--                          "viewed but not signed after Y days" → a follow-up
--                          task (at most one per quote per rule)
--
-- The contractor and their team are never counted: the tracking functions
-- ignore the quote's owner and employees (the app also doesn't send while
-- signed in, or in Client view). Internal only — nothing here is read by
-- the client-facing serializer.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

alter table public.quotes
  add column if not exists sent_at timestamptz,
  add column if not exists view_count int not null default 0,
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists last_view_device text,
  add column if not exists last_activity_at timestamptz,
  add column if not exists selections_changed_at timestamptz;

-- Backfill "sent at" for quotes already out: the first real (non-baseline)
-- version snapshot, else the last update.
update public.quotes q
   set sent_at = coalesce(
         (select min(v.created_at) from public.document_versions v where v.doc_type = 'quote' and v.doc_id = q.id and v.event <> 'baseline'),
         q.updated_at)
 where q.sent_at is null and q.status in ('sent', 'approved', 'declined');

create table if not exists public.quote_view_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  quote_id        uuid not null references public.quotes (id) on delete cascade,
  version         int,
  channel         text not null check (channel in ('hub', 'link')),
  device          text not null default 'desktop' check (device in ('mobile', 'tablet', 'desktop')),
  session_key     uuid not null,
  started_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  active_seconds  int not null default 0,
  sections        text[] not null default '{}'
);
create index if not exists quote_view_sessions_quote_idx on public.quote_view_sessions (quote_id, started_at desc);
create index if not exists quote_view_sessions_key_idx on public.quote_view_sessions (quote_id, session_key, last_seen_at desc);

create table if not exists public.quote_activity_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  quote_id    uuid not null references public.quotes (id) on delete cascade,
  session_id  uuid references public.quote_view_sessions (id) on delete set null,
  version     int,
  kind        text not null check (kind in ('opened', 'selection_changed', 'optional_changed', 'pdf_downloaded', 'approved', 'declined')),
  summary     text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists quote_activity_events_quote_idx on public.quote_activity_events (quote_id, created_at desc);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  link        text,
  quote_id    uuid references public.quotes (id) on delete cascade,
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.notification_settings (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  quote_first_open     boolean not null default true,
  quote_selections     boolean not null default true,
  quote_decided        boolean not null default true,
  quote_viewed_again   boolean not null default true,
  cold_unopened_days   int not null default 3 check (cold_unopened_days > 0),
  cold_unsigned_days   int not null default 5 check (cold_unsigned_days > 0),
  updated_at           timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trigger      text not null check (trigger in ('quote_viewed', 'quote_not_opened', 'quote_viewed_not_signed')),
  enabled      boolean not null default true,
  task_title   text not null,
  task_type    text not null default 'follow_up',
  due_in_days  int not null default 0 check (due_in_days >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id         uuid primary key default gen_random_uuid(),
  rule_id    uuid not null references public.automation_rules (id) on delete cascade,
  quote_id   uuid not null references public.quotes (id) on delete cascade,
  task_id    uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (rule_id, quote_id)
);

do $$
declare t text;
begin
  foreach t in array array['quote_view_sessions', 'quote_activity_events', 'notifications', 'notification_settings', 'automation_rules'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own" on public.%I', t);
    execute format('create policy "own" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table public.automation_runs enable row level security;
drop policy if exists "own" on public.automation_runs;
create policy "own" on public.automation_runs for select to authenticated
  using (exists (select 1 from public.automation_rules r where r.id = rule_id and r.user_id = auth.uid()));
revoke all on public.automation_runs from anon;

-- Sessions / events are written only by the functions below.
revoke insert, update, delete on public.quote_view_sessions from authenticated;
revoke insert, update, delete on public.quote_activity_events from authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The contractor or one of their employees?
create or replace function public._is_quote_team(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    auth.uid() = p_owner
    or exists (select 1 from public.employees e where e.auth_user_id = auth.uid() and e.owner_user_id = p_owner)
  );
$$;

create or replace function public._quote_version(p_quote_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select max(version) from public.document_versions where doc_type = 'quote' and doc_id = p_quote_id;
$$;

create or replace function public._quote_names(p_quote_id uuid, out client_name text, out project_name text, out client_id uuid, out project_id uuid, out opportunity_id uuid)
language sql stable security definer set search_path = public as $$
  select c.name, p.name, c.id, p.id,
         (select o.id from public.opportunities o where o.quote_id = q.id or (p.id is not null and o.project_id = p.id) order by (o.quote_id = q.id) desc limit 1)
  from public.quotes q
  left join public.projects p on p.id = q.project_id
  left join public.clients c on c.id = coalesce(q.client_id, p.client_id)
  where q.id = p_quote_id;
$$;

-- In-app notification, respecting the contractor's toggle and deduping.
create or replace function public._notify(p_user uuid, p_kind text, p_setting text, p_title text, p_body text, p_quote uuid, p_dedupe text)
returns void language plpgsql security definer set search_path = public as $$
declare v_on boolean := true;
begin
  if p_setting is not null then
    execute format('select %I from public.notification_settings where user_id = $1', p_setting) into v_on using p_user;
    v_on := coalesce(v_on, true);
  end if;
  if not v_on then return; end if;
  insert into public.notifications (user_id, kind, title, body, link, quote_id, dedupe_key)
  values (p_user, p_kind, p_title, p_body,
          (select case when q.project_id is not null then '/projects/' || q.project_id || '/quotes/' || q.id else '/quotes/' || q.id end
             from public.quotes q where q.id = p_quote),
          p_quote, p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

-- CRM timeline entry (skipped when the quote has no client).
create or replace function public._quote_activity(p_quote uuid, p_owner uuid, p_kind text, p_summary text, p_meta jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare n record;
begin
  select * into n from public._quote_names(p_quote);
  if n.client_id is null then return; end if;
  insert into public.activities (client_id, project_id, quote_id, opportunity_id, created_by, kind, summary, meta)
  values (n.client_id, n.project_id, p_quote, n.opportunity_id, p_owner, p_kind, p_summary, coalesce(p_meta, '{}'::jsonb));
end;
$$;

-- Run the contractor's automation rules for a trigger on a quote — one
-- follow-up task per quote per rule, ever.
create or replace function public._run_quote_automation(p_owner uuid, p_trigger text, p_quote uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n record; v_run uuid; v_task uuid; v_count int := 0; v_title text;
begin
  select * into n from public._quote_names(p_quote);
  for r in select * from public.automation_rules where user_id = p_owner and trigger = p_trigger and enabled loop
    v_run := null;
    insert into public.automation_runs (rule_id, quote_id) values (r.id, p_quote)
    on conflict (rule_id, quote_id) do nothing returning id into v_run;
    if v_run is null then continue; end if;
    v_title := replace(replace(r.task_title, '{client}', coalesce(n.client_name, 'client')), '{project}', coalesce(n.project_name, 'quote'));
    insert into public.tasks (user_id, title, due_at, client_id, opportunity_id, project_id, task_type, priority)
    values (p_owner, v_title, now() + make_interval(days => r.due_in_days), n.client_id, n.opportunity_id, n.project_id,
            case when r.task_type in ('call', 'text', 'email', 'site_visit', 'prepare_estimate', 'send_proposal', 'follow_up', 'collect_deposit', 'schedule_project', 'general_task')
                 then r.task_type else 'follow_up' end,
            'normal')
    returning id into v_task;
    update public.automation_runs set task_id = v_task where id = v_run;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recording a view (heartbeat every ~30 s while the tab is visible)
-- ---------------------------------------------------------------------------

create or replace function public._record_quote_view(p_quote_id uuid, p_channel text, p_session_key uuid, p_device text, p_active_seconds int, p_sections text[])
returns void language plpgsql security definer set search_path = public as $$
declare q record; s record; v_new boolean := false; v_device text; v_version int; n record; v_prev int;
begin
  select * into q from public.quotes where id = p_quote_id;
  if not found or q.status not in ('sent', 'approved', 'declined') then return; end if;
  if public._is_quote_team(q.user_id) then return; end if;
  v_device := case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'desktop' end;
  v_version := public._quote_version(q.id);

  select * into s from public.quote_view_sessions
   where quote_id = q.id and session_key = p_session_key and last_seen_at > now() - interval '30 minutes'
   order by last_seen_at desc limit 1;

  if s.id is null then
    v_new := true;
    insert into public.quote_view_sessions (user_id, quote_id, version, channel, device, session_key, sections)
    values (q.user_id, q.id, v_version, case when p_channel = 'hub' then 'hub' else 'link' end, v_device, p_session_key, coalesce(p_sections, '{}'))
    returning * into s;
  else
    update public.quote_view_sessions
       set last_seen_at = now(),
           active_seconds = active_seconds + least(greatest(coalesce(p_active_seconds, 0), 0), 90),
           sections = (select coalesce(array_agg(distinct x), '{}') from unnest(sections || coalesce(p_sections, '{}')) x)
     where id = s.id;
  end if;

  if not v_new then
    update public.quotes set last_viewed_at = now(), last_activity_at = now() where id = q.id;
    return;
  end if;

  v_prev := q.view_count;
  update public.quotes
     set view_count = view_count + 1,
         first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now(),
         last_view_device = v_device,
         last_activity_at = now()
   where id = q.id;

  select * into n from public._quote_names(q.id);
  insert into public.quote_activity_events (user_id, quote_id, session_id, version, kind, summary, detail)
  values (q.user_id, q.id, s.id, v_version, 'opened',
          'Opened on ' || v_device || case when p_channel = 'hub' then ' (Client Hub)' else ' (quote link)' end,
          jsonb_build_object('device', v_device, 'channel', p_channel));
  perform public._quote_activity(q.id, q.user_id, 'quote_viewed',
          'Quote viewed' || case when v_prev > 0 then ' again' else '' end || ' on ' || v_device,
          jsonb_build_object('quote_id', q.id, 'version', v_version, 'device', v_device));

  if v_prev = 0 then
    perform public._notify(q.user_id, 'quote_first_open', 'quote_first_open',
            coalesce(n.client_name, 'Your client') || ' just opened your ' || coalesce(n.project_name || ' ', '') || 'quote',
            'Opened on ' || v_device, q.id, 'first_open:' || q.id);
  else
    perform public._notify(q.user_id, 'quote_viewed_again', 'quote_viewed_again',
            coalesce(n.client_name, 'Your client') || ' viewed your ' || coalesce(n.project_name || ' ', '') || 'quote again',
            'Viewed ' || (v_prev + 1) || ' times', q.id, 'viewed_again:' || q.id || ':' || current_date);
  end if;
  perform public._run_quote_automation(q.user_id, 'quote_viewed', q.id);
end;
$$;
revoke all on function public._record_quote_view(uuid, text, uuid, text, int, text[]) from public, anon, authenticated;

create or replace function public.track_portal_quote_view(p_quote_id uuid, p_session_key uuid, p_device text, p_active_seconds int, p_sections text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.quotes q
    join public.projects p on p.id = q.project_id
    join public.clients c on c.id = p.client_id
    where q.id = p_quote_id and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) then
    perform public._record_quote_view(p_quote_id, 'hub', p_session_key, p_device, p_active_seconds, p_sections);
  end if;
end;
$$;
grant execute on function public.track_portal_quote_view(uuid, uuid, text, int, text[]) to authenticated;

create or replace function public.track_shared_quote_view(p_token uuid, p_session_key uuid, p_device text, p_active_seconds int, p_sections text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.quotes where p_token is not null and share_token = p_token;
  if v_id is not null then
    perform public._record_quote_view(v_id, 'link', p_session_key, p_device, p_active_seconds, p_sections);
  end if;
end;
$$;
grant execute on function public.track_shared_quote_view(uuid, uuid, text, int, text[]) to anon, authenticated;

-- PDF / print and optional-section changes on the share link (whose
-- optional ticks are page-only) — by token or, in the Hub, by quote id.
create or replace function public.track_quote_event(p_quote_id uuid, p_token uuid, p_session_key uuid, p_kind text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare q record; v_session uuid; v_summary text;
begin
  if p_kind not in ('pdf_downloaded', 'optional_changed') then return; end if;
  if p_token is not null then
    select * into q from public.quotes where share_token = p_token;
  else
    select qq.* into q from public.quotes qq
      join public.projects p on p.id = qq.project_id
      join public.clients c on c.id = p.client_id
     where qq.id = p_quote_id and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  end if;
  if q.id is null or public._is_quote_team(q.user_id) then return; end if;
  select id into v_session from public.quote_view_sessions
   where quote_id = q.id and session_key = p_session_key order by last_seen_at desc limit 1;
  v_summary := case p_kind
    when 'pdf_downloaded' then 'Downloaded / printed the quote'
    else coalesce(p_detail ->> 'summary', 'Changed optional items') end;
  insert into public.quote_activity_events (user_id, quote_id, session_id, version, kind, summary, detail)
  values (q.user_id, q.id, v_session, public._quote_version(q.id), p_kind, left(v_summary, 300), coalesce(p_detail, '{}'::jsonb));
  update public.quotes set last_activity_at = now() where id = q.id;
  if p_kind = 'optional_changed' then
    perform public._notify(q.user_id, 'quote_selections', 'quote_selections',
            'Your client changed optional items on a quote', left(v_summary, 200), q.id,
            'optional:' || q.id || ':' || coalesce(p_session_key::text, '') || ':' || to_char(now(), 'YYYY-MM-DD HH24'));
    perform public._quote_activity(q.id, q.user_id, 'quote_optional_changed', left(v_summary, 200), p_detail);
  end if;
end;
$$;
grant execute on function public.track_quote_event(uuid, uuid, uuid, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Selection changes (0115) and Hub optional items — logged server-side
-- inside the functions that save them.
-- ---------------------------------------------------------------------------

create or replace function public._set_selection_picks(p_group_id uuid, p_option_ids uuid[], p_by text)
returns void language plpgsql security definer set search_path = public as $$
declare v_multi boolean; v_ids uuid[] := coalesce(p_option_ids, '{}'); g record; v_old text; v_new text; v_price numeric; v_summary text;
begin
  select sg.*, s.quote_id, q.user_id as owner into g
    from public.quote_selection_groups sg
    join public.quote_sections s on s.id = sg.quote_section_id
    join public.quotes q on q.id = s.quote_id
   where sg.id = p_group_id;
  v_multi := g.multi;
  if not v_multi and array_length(v_ids, 1) > 1 then
    raise exception 'Pick one option';
  end if;
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.quote_selection_options op where op.id = x and op.group_id = p_group_id)) then
    raise exception 'That option isn''t available any more';
  end if;
  select string_agg(op.name, ', ' order by op.sort_order) into v_old
    from public.quote_selection_picks p join public.quote_selection_options op on op.id = p.option_id where p.group_id = p_group_id;
  delete from public.quote_selection_picks where group_id = p_group_id;
  insert into public.quote_selection_picks (group_id, option_id, picked_by)
  select p_group_id, x, p_by from unnest(v_ids) x;

  if p_by = 'client' then
    select string_agg(op.name, ', ' order by op.sort_order), coalesce(sum(op.price_delta), 0) into v_new, v_price
      from public.quote_selection_options op where op.id = any (v_ids);
    if v_new is distinct from v_old then
      v_summary := 'Changed ' || g.name || ' to ' || coalesce(v_new, 'nothing')
                   || case when v_price > 0 then ' (+$' || to_char(v_price, 'FM999,999,990.00') || ')'
                           when v_price < 0 then ' (−$' || to_char(-v_price, 'FM999,999,990.00') || ')' else '' end;
      insert into public.quote_activity_events (user_id, quote_id, version, kind, summary, detail)
      values (g.owner, g.quote_id, public._quote_version(g.quote_id), 'selection_changed', v_summary,
              jsonb_build_object('group', g.name, 'from', v_old, 'to', v_new, 'price', v_price, 'total', public.quote_committed_total(g.quote_id)));
      update public.quotes set selections_changed_at = now(), last_activity_at = now() where id = g.quote_id;
      perform public._quote_activity(g.quote_id, g.owner, 'quote_selection_changed', v_summary,
              jsonb_build_object('total', public.quote_committed_total(g.quote_id)));
      -- One notification per quote per hour, however many taps.
      perform public._notify(g.owner, 'quote_selections', 'quote_selections',
              'Your client is choosing options on a quote', v_summary || ' · total $' || to_char(public.quote_committed_total(g.quote_id), 'FM999,999,990.00'),
              g.quote_id, 'selections:' || g.quote_id || ':' || to_char(now(), 'YYYY-MM-DD HH24'));
    end if;
  end if;
end;
$$;
revoke all on function public._set_selection_picks(uuid, uuid[], text) from public, anon, authenticated;

create or replace function public.portal_set_quote_item_selection(p_quote_item_id uuid, p_selected boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v record; v_summary text;
begin
  update public.quote_items i
     set client_selected = p_selected
    from public.quote_sections s, public.quotes q, public.projects p, public.clients c
   where i.id = p_quote_item_id
     and s.id = i.section_id
     and q.id = s.quote_id
     and p.id = q.project_id
     and c.id = p.client_id
     and i.is_optional
     and q.status = 'sent'
     and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  returning q.id as quote_id, q.user_id as owner, i.name into v;
  if v.quote_id is null then return; end if;
  v_summary := case when p_selected then 'Added ' else 'Dropped ' end || v.name
               || ' · total $' || to_char(public.quote_committed_total(v.quote_id), 'FM999,999,990.00');
  insert into public.quote_activity_events (user_id, quote_id, version, kind, summary, detail)
  values (v.owner, v.quote_id, public._quote_version(v.quote_id), 'optional_changed', v_summary,
          jsonb_build_object('item', v.name, 'selected', p_selected, 'total', public.quote_committed_total(v.quote_id)));
  update public.quotes set selections_changed_at = now(), last_activity_at = now() where id = v.quote_id;
  perform public._quote_activity(v.quote_id, v.owner, 'quote_optional_changed', v_summary, '{}'::jsonb);
  perform public._notify(v.owner, 'quote_selections', 'quote_selections', 'Your client changed optional items on a quote', v_summary,
          v.quote_id, 'optional:' || v.quote_id || ':' || to_char(now(), 'YYYY-MM-DD HH24'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Status: sent → sent_at; approved / declined → event + notification
-- (only when the client did it, not the contractor clicking in the app).
-- ---------------------------------------------------------------------------

create or replace function public.quote_activity_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare n record; v_kind text;
begin
  if new.status = 'sent' and old.status is distinct from 'sent' and old.status <> 'approved' then
    update public.quotes set sent_at = now() where id = new.id;
  end if;
  if new.status in ('approved', 'declined') and old.status is distinct from new.status then
    v_kind := case when new.status = 'approved' then 'approved' else 'declined' end;
    insert into public.quote_activity_events (user_id, quote_id, version, kind, summary, detail)
    values (new.user_id, new.id, public._quote_version(new.id), v_kind,
            case when v_kind = 'approved' then 'Approved and signed' || coalesce(' by ' || new.signed_by, '')
                 else 'Declined' || coalesce(' — "' || left(new.decline_comment, 120) || '"', '') end,
            jsonb_build_object('total', public.quote_committed_total(new.id)));
    update public.quotes set last_activity_at = now() where id = new.id;
    if not public._is_quote_team(new.user_id) then
      select * into n from public._quote_names(new.id);
      perform public._notify(new.user_id, 'quote_' || v_kind, 'quote_decided',
              coalesce(n.client_name, 'Your client') || case when v_kind = 'approved' then ' signed' else ' declined' end
                || ' your ' || coalesce(n.project_name || ' ', '') || 'quote',
              case when v_kind = 'approved' then 'Total $' || to_char(public.quote_committed_total(new.id), 'FM999,999,990.00') else new.decline_comment end,
              new.id, v_kind || ':' || new.id || ':' || coalesce(public._quote_version(new.id), 0));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists quotes_z_activity on public.quotes;
create trigger quotes_z_activity after update of status on public.quotes
  for each row execute function public.quote_activity_on_status();

-- ---------------------------------------------------------------------------
-- Going cold → automations. Idempotent; the app calls it on load, and it
-- can also be scheduled hourly (pg_cron: select public.run_quote_cold_checks_all();).
-- ---------------------------------------------------------------------------

create or replace function public._quote_cold_checks(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare st record; q record; v int := 0;
begin
  select coalesce(ns.cold_unopened_days, 3) as x, coalesce(ns.cold_unsigned_days, 5) as y
    into st from (select 1) d left join public.notification_settings ns on ns.user_id = p_user;
  for q in select id from public.quotes where user_id = p_user and status = 'sent'
                 and view_count = 0 and sent_at < now() - make_interval(days => st.x) loop
    v := v + public._run_quote_automation(p_user, 'quote_not_opened', q.id);
  end loop;
  for q in select id from public.quotes where user_id = p_user and status = 'sent'
                 and first_viewed_at is not null and first_viewed_at < now() - make_interval(days => st.y) loop
    v := v + public._run_quote_automation(p_user, 'quote_viewed_not_signed', q.id);
  end loop;
  return v;
end;
$$;
revoke all on function public._quote_cold_checks(uuid) from public, anon, authenticated;

create or replace function public.run_quote_cold_checks()
returns int language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_employee() then return 0; end if;
  return public._quote_cold_checks(auth.uid());
end;
$$;
grant execute on function public.run_quote_cold_checks() to authenticated;

create or replace function public.run_quote_cold_checks_all()
returns int language plpgsql security definer set search_path = public as $$
declare u uuid; v int := 0;
begin
  for u in select distinct user_id from public.automation_rules where enabled and trigger <> 'quote_viewed' loop
    v := v + public._quote_cold_checks(u);
  end loop;
  return v;
end;
$$;
revoke all on function public.run_quote_cold_checks_all() from public, anon, authenticated;

drop trigger if exists automation_rules_set_updated_at on public.automation_rules;
create trigger automation_rules_set_updated_at before update on public.automation_rules
  for each row execute function public.set_updated_at();
drop trigger if exists notification_settings_set_updated_at on public.notification_settings;
create trigger notification_settings_set_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();

select count(*) filter (where sent_at is not null) as quotes_with_sent_at, count(*) as quotes from public.quotes;
