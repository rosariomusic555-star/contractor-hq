-- ContractorHQ — Maintenance reminders (repeat work from past clients).
-- Run AFTER 0001-0126.
--
--   maintenance_templates        Per build type: item, client-friendly
--                                description, interval (months, min–max or
--                                "as needed"), optional "remind in <month>".
--                                Seeded with editable suggestions.
--   maintenance_settings         Lead time (30 days), warranty years per
--                                build type.
--   project_maintenance_items    A completed job's reminders (per feature):
--                                next due date, snooze, active / stopped,
--                                the open opportunity, last done.
--   maintenance_events           History: set up, reached out, opportunity,
--                                snoozed, skipped, done, stopped.
--   project_features.warranty_ends_on
--   clients.maintenance_opt_out  "Don't remind me" (care info stays).
--   opportunities.source_project_id  the original job a maintenance lead came from.
--
-- The due-date math lives in the app (src/lib/maintenance.ts) and is
-- written onto next_due; run_maintenance_checks() only reads it: X days
-- before next_due → a task + notification + "Maintenance due soon"; past
-- next_due → "Maintenance overdue" (each once per due date). When the
-- follow-up opportunity's project is completed (or "Done" is tapped), the
-- app schedules the next occurrence.

create table if not exists public.maintenance_templates (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  build_type           text not null,
  label                text not null check (length(trim(label)) > 0),
  description          text,
  interval_months      int check (interval_months between 1 and 240),
  interval_months_max  int check (interval_months_max between 1 and 240),
  as_needed            boolean not null default false,
  remind_month         int check (remind_month between 1 and 12),
  sort_order           int not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);
create index if not exists maintenance_templates_user_idx on public.maintenance_templates (user_id, build_type, sort_order);

create table if not exists public.maintenance_settings (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  lead_days    int not null default 30 check (lead_days between 1 and 180),
  warranties   jsonb not null default '{}'::jsonb,   -- { <build_type>: years }
  updated_at   timestamptz not null default now()
);

create table if not exists public.project_maintenance_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id       uuid not null references public.projects (id) on delete cascade,
  feature_id       uuid references public.project_features (id) on delete set null,
  template_id      uuid references public.maintenance_templates (id) on delete set null,
  label            text not null,
  description      text,
  interval_months  int,
  as_needed        boolean not null default false,
  remind_month     int check (remind_month between 1 and 12),
  next_due         date,
  snoozed_until    date,
  status           text not null default 'active' check (status in ('active', 'stopped')),
  opportunity_id   uuid references public.opportunities (id) on delete set null,
  last_done_on     date,
  due_notified_for date,       -- the next_due already reminded about
  overdue_notified_for date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists project_maintenance_items_project_idx on public.project_maintenance_items (project_id);
create index if not exists project_maintenance_items_due_idx on public.project_maintenance_items (user_id, status, next_due);

create table if not exists public.maintenance_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id     uuid not null references public.project_maintenance_items (id) on delete cascade,
  kind        text not null check (kind in ('set_up', 'reached_out', 'opportunity', 'snoozed', 'skipped', 'done', 'stopped', 'client_request')),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists maintenance_events_item_idx on public.maintenance_events (item_id, created_at desc);

alter table public.project_features add column if not exists warranty_ends_on date;
alter table public.clients add column if not exists maintenance_opt_out boolean not null default false;
-- Plain uuid, NOT a foreign key: a second FK between opportunities and
-- projects makes every unhinted PostgREST embed ambiguous (see 0129).
alter table public.opportunities add column if not exists source_project_id uuid;
alter table public.projects add column if not exists maintenance_dismissed boolean not null default false;

drop trigger if exists project_maintenance_items_set_updated_at on public.project_maintenance_items;
create trigger project_maintenance_items_set_updated_at before update on public.project_maintenance_items for each row execute function public.set_updated_at();
drop trigger if exists maintenance_settings_set_updated_at on public.maintenance_settings;
create trigger maintenance_settings_set_updated_at before update on public.maintenance_settings for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['maintenance_templates', 'maintenance_settings', 'project_maintenance_items', 'maintenance_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own" on public.%I', t);
    execute format('create policy "own" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Editable starting suggestions (only when the contractor has none).
create or replace function public.maintenance_seed_templates()
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null or public.is_employee() then return 0; end if;
  if exists (select 1 from public.maintenance_templates where user_id = v_uid) then return 0; end if;
  insert into public.maintenance_templates (user_id, build_type, label, description, interval_months, interval_months_max, as_needed, remind_month, sort_order)
  select v_uid, bt, x.label, x.descr, x.i_min, x.i_max, x.as_needed, x.month, x.ord
    from (values
      ('Clean & reseal', 'A deep clean and fresh sealer keeps the color rich and protects against stains and weeds.', 24, 36, false, 4, 10),
      ('Re-sand joints (polymeric sand)', 'Topping up the joint sand keeps pavers locked in place and weeds out.', null::int, null::int, true, null::int, 20)
    ) as x(label, descr, i_min, i_max, as_needed, month, ord),
    unnest(array['paver_patio', 'walkway', 'driveway']) bt
  union all
  select v_uid, bt, 'Inspect drainage & caps', 'A quick check that drainage is flowing and caps are secure keeps the wall solid for years.', 24, null, false, 4, 10
    from unnest(array['retaining_wall', 'seating_wall']) bt
  union all
  select v_uid, 'outdoor_lighting', 'Annual lighting check', 'Bulbs, timer and connections checked so everything shines when you need it.', 12, null, false, 10, 10
  union all
  select v_uid, bt, 'Inspect & clean', 'A yearly inspection and cleaning keeps it safe and looking its best.', 12, null, false, 4, 10
    from unnest(array['fire_pit', 'outdoor_kitchen']) bt;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Due reminders: task + notification + automation, once per due date.
-- ---------------------------------------------------------------------------
alter table public.automation_rules drop constraint if exists automation_rules_trigger_check;
alter table public.automation_rules add constraint automation_rules_trigger_check
  check (trigger in ('quote_viewed', 'quote_not_opened', 'quote_viewed_not_signed',
                     'review_eligible', 'review_requested', 'review_link_clicked',
                     'precon_overdue', 'precon_ready', 'locate_expiring',
                     'maintenance_due', 'maintenance_overdue'));
alter table public.notification_settings add column if not exists maintenance boolean not null default true;

-- Automation runs are once per rule per project; maintenance repeats, so
-- run per (rule, item, due date) instead.
create table if not exists public.maintenance_automation_runs (
  rule_id  uuid not null references public.automation_rules (id) on delete cascade,
  item_id  uuid not null references public.project_maintenance_items (id) on delete cascade,
  due      date not null,
  primary key (rule_id, item_id, due)
);
alter table public.maintenance_automation_runs enable row level security;
revoke all on public.maintenance_automation_runs from anon, authenticated;

create or replace function public._maintenance_automation(p_owner uuid, p_trigger text, p_item uuid, p_due date, p_title_default text)
returns void language plpgsql security definer set search_path = public as $$
declare r record; it record; v_title text;
begin
  select i.*, p.client_id, p.name as project_name, c.name as client_name into it
    from public.project_maintenance_items i join public.projects p on p.id = i.project_id left join public.clients c on c.id = p.client_id
   where i.id = p_item;
  for r in select * from public.automation_rules where user_id = p_owner and trigger = p_trigger and enabled loop
    begin
      insert into public.maintenance_automation_runs (rule_id, item_id, due) values (r.id, p_item, p_due);
    exception when unique_violation then continue;
    end;
    v_title := replace(replace(r.task_title, '{client}', coalesce(it.client_name, 'client')), '{project}', coalesce(it.project_name, 'project'));
    insert into public.tasks (user_id, title, due_at, client_id, project_id, task_type, priority)
    values (p_owner, v_title, now() + make_interval(days => r.due_in_days), it.client_id, it.project_id,
            case when r.task_type in ('call', 'text', 'email', 'follow_up', 'general_task') then r.task_type else 'follow_up' end, 'normal');
  end loop;
end;
$$;

create or replace function public._maintenance_checks(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare s record; it record; n int := 0; v_on boolean;
begin
  select * into s from public.maintenance_settings where user_id = p_user;
  -- A maintenance lead that was lost frees its items to come due again.
  update public.project_maintenance_items i set opportunity_id = null
    from public.opportunities o
   where i.user_id = p_user and o.id = i.opportunity_id and o.stage = 'lost';
  select maintenance into v_on from public.notification_settings where user_id = p_user;
  for it in
    select i.*, p.name as project_name, p.client_id, c.name as client_name
      from public.project_maintenance_items i
      join public.projects p on p.id = i.project_id
      left join public.clients c on c.id = p.client_id
     where i.user_id = p_user and i.status = 'active' and i.next_due is not null and i.opportunity_id is null
       and (i.snoozed_until is null or i.snoozed_until <= current_date)
       and not coalesce(c.maintenance_opt_out, false)
       and i.next_due - coalesce(s.lead_days, 30) <= current_date
  loop
    if it.due_notified_for is distinct from it.next_due then
      insert into public.tasks (user_id, title, due_at, client_id, project_id, task_type, priority)
      values (p_user, 'Maintenance: ' || it.label || ' — ' || coalesce(it.client_name, it.project_name), it.next_due::timestamptz,
              it.client_id, it.project_id, 'follow_up', 'normal');
      if coalesce(v_on, true) then
        insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
        values (p_user, 'maintenance_due', coalesce(it.client_name, 'A past client') || ': ' || lower(it.label) || ' due ' || to_char(it.next_due, 'FMMonth YYYY'),
                it.project_name, '/projects/' || it.project_id, 'maintenance:' || it.id || ':' || it.next_due)
        on conflict (user_id, dedupe_key) do nothing;
      end if;
      perform public._maintenance_automation(p_user, 'maintenance_due', it.id, it.next_due, null);
      update public.project_maintenance_items set due_notified_for = it.next_due where id = it.id;
      n := n + 1;
    end if;
    if it.next_due < current_date and it.overdue_notified_for is distinct from it.next_due then
      perform public._maintenance_automation(p_user, 'maintenance_overdue', it.id, it.next_due, null);
      update public.project_maintenance_items set overdue_notified_for = it.next_due where id = it.id;
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.run_maintenance_checks()
returns int language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_employee() then return 0; end if;
  return public._maintenance_checks(auth.uid());
end;
$$;

create or replace function public.run_maintenance_checks_all()
returns int language plpgsql security definer set search_path = public as $$
declare u uuid; n int := 0;
begin
  for u in select distinct user_id from public.project_maintenance_items where status = 'active' loop
    n := n + public._maintenance_checks(u);
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- New pipeline opportunity for maintenance (contractor, or the client's
-- "Request service" in the Hub). Same prefill either way.
-- ---------------------------------------------------------------------------
create or replace function public._maintenance_opportunity(p_project_id uuid, p_item_ids uuid[], p_from_client boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare p record; v_opp uuid; v_items text; v_src text := 'Maintenance / Past client';
begin
  select pr.*, c.name as client_name into p from public.projects pr join public.clients c on c.id = pr.client_id where pr.id = p_project_id;
  if not found then raise exception 'Project not found.'; end if;
  select string_agg(i.label, ', ' order by i.label) into v_items
    from public.project_maintenance_items i where i.project_id = p_project_id and (p_item_ids is null or i.id = any(p_item_ids)) and i.status = 'active';
  insert into public.lead_sources (user_id, name, sort_order) values (p.user_id, v_src, 900) on conflict (user_id, name) do nothing;
  insert into public.opportunities (client_id, title, address, description, lead_source, source_project_id)
  values (p.client_id,
          'Maintenance: ' || coalesce(v_items, 'service') || ' — ' || p.name,
          p.address,
          case when p_from_client then 'Requested by the client from the Client Hub. ' else '' end
            || 'Maintenance for the original job “' || p.name || '”' || coalesce(' (completed ' || to_char(p.completed_at, 'FMMon YYYY') || ')', '') || '. Items: ' || coalesce(v_items, '—') || '.',
          v_src, p.id)
  returning id into v_opp;
  insert into public.opportunity_categories (opportunity_id, category_id)
  select distinct v_opp, f.category_id from public.project_features f
   where f.project_id = p_project_id and f.status = 'active' and f.category_id is not null
     and (p_item_ids is null or f.id in (select i.feature_id from public.project_maintenance_items i where i.id = any(p_item_ids)))
  on conflict do nothing;
  update public.project_maintenance_items set opportunity_id = v_opp
   where project_id = p_project_id and status = 'active' and (p_item_ids is null or id = any(p_item_ids));
  insert into public.maintenance_events (user_id, item_id, kind, note)
  select p.user_id, i.id, case when p_from_client then 'client_request' else 'opportunity' end, v_opp::text
    from public.project_maintenance_items i where i.opportunity_id = v_opp;
  return v_opp;
end;
$$;

create or replace function public.create_maintenance_opportunity(p_project_id uuid, p_item_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.projects where id = p_project_id and user_id = auth.uid()) or public.is_employee() then
    raise exception 'Project not found.';
  end if;
  return public._maintenance_opportunity(p_project_id, p_item_ids, false);
end;
$$;

-- Recurrence hook: a maintenance opportunity's project completed → its
-- items are due for rescheduling (the app computes the next date; this just
-- clears the link and records "done").
create or replace function public.maintenance_opportunity_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'complete' and old.status is distinct from 'complete' then
    insert into public.maintenance_events (user_id, item_id, kind, note)
    select i.user_id, i.id, 'done', 'Maintenance job completed'
      from public.project_maintenance_items i join public.opportunities o on o.id = i.opportunity_id
     where o.project_id = new.id;
    update public.project_maintenance_items i
       set last_done_on = current_date, opportunity_id = null, next_due = null   -- the app sets the next date (maintenance.ts)
      from public.opportunities o
     where o.id = i.opportunity_id and o.project_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists maintenance_opportunity_done on public.projects;
create trigger maintenance_opportunity_done after update of status on public.projects
  for each row execute function public.maintenance_opportunity_done();

-- ---------------------------------------------------------------------------
-- Client Hub: care & maintenance (whitelisted), Request service, opt-out.
-- ---------------------------------------------------------------------------
create or replace function public.client_care_json(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.status <> 'complete' then null else jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'label', i.label, 'description', i.description, 'as_needed', i.as_needed,
               'next_month', case when i.next_due is null then null else to_char(i.next_due, 'YYYY-MM') end,
               'feature', coalesce(nullif(f.label, ''), cat.name)) order by i.next_due nulls last, i.label)
        from public.project_maintenance_items i
        left join public.project_features f on f.id = i.feature_id
        left join public.categories cat on cat.id = f.category_id
       where i.project_id = p.id and i.status = 'active'), '[]'::jsonb),
    'warranties', coalesce((
      select jsonb_agg(jsonb_build_object('feature', coalesce(nullif(f.label, ''), cat.name, 'Feature'), 'ends_on', f.warranty_ends_on) order by f.sort_order)
        from public.project_features f left join public.categories cat on cat.id = f.category_id
       where f.project_id = p.id and f.status = 'active' and f.warranty_ends_on is not null), '[]'::jsonb),
    'opted_out', coalesce(c.maintenance_opt_out, false)
  ) end
  from public.projects p left join public.clients c on c.id = p.client_id where p.id = p_project_id;
$$;

create or replace function public.portal_request_service(p_project_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_opp uuid; p record;
begin
  if not public._portal_owns_project(p_project_id) then raise exception 'Project not found.'; end if;
  select pr.user_id, pr.name, c.name as client_name into p from public.projects pr join public.clients c on c.id = pr.client_id where pr.id = p_project_id;
  v_opp := public._maintenance_opportunity(p_project_id, null, true);
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (p.user_id, 'maintenance_request', coalesce(p.client_name, 'A past client') || ' requested service', p.name,
          '/pipeline/' || v_opp, 'maintenance_request:' || v_opp);
end;
$$;

create or replace function public.portal_maintenance_opt_out(p_project_id uuid, p_opt_out boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._portal_owns_project(p_project_id) then raise exception 'Project not found.'; end if;
  update public.clients c set maintenance_opt_out = p_opt_out from public.projects p where p.id = p_project_id and c.id = p.client_id;
end;
$$;

create or replace function public._portal_project_json(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._portal_project_json_base(p_project_id)
         || jsonb_build_object(
              'schedule_updates', public.client_schedule_updates_json(p_project_id),
              'review', public.client_review_json(p_project_id),
              'progress', public.client_progress_json(p_project_id),
              'care', public.client_care_json(p_project_id));
$$;

revoke all on function public._portal_project_json(uuid) from public, anon, authenticated;
revoke all on function public.client_care_json(uuid) from public, anon, authenticated;
revoke all on function public._maintenance_opportunity(uuid, uuid[], boolean) from public, anon, authenticated;
revoke all on function public._maintenance_checks(uuid) from public, anon, authenticated;
revoke all on function public._maintenance_automation(uuid, text, uuid, date, text) from public, anon, authenticated;
revoke all on function public.run_maintenance_checks_all() from public, anon, authenticated;
revoke all on function public.maintenance_opportunity_done() from public, anon, authenticated;
revoke all on function public.maintenance_seed_templates() from public, anon;
revoke all on function public.run_maintenance_checks() from public, anon;
revoke all on function public.create_maintenance_opportunity(uuid, uuid[]) from public, anon;
revoke all on function public.portal_request_service(uuid) from public, anon;
revoke all on function public.portal_maintenance_opt_out(uuid, boolean) from public, anon;
grant execute on function public.maintenance_seed_templates() to authenticated;
grant execute on function public.run_maintenance_checks() to authenticated;
grant execute on function public.create_maintenance_opportunity(uuid, uuid[]) to authenticated;
grant execute on function public.portal_request_service(uuid) to authenticated;
grant execute on function public.portal_maintenance_opt_out(uuid, boolean) to authenticated;
