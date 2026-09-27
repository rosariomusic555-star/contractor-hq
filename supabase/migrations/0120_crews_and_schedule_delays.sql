-- ContractorHQ — Real crews + Rain delay action (schedule delays).
-- Run AFTER 0001-0119.
--
--   crews               The contractor's crews (was demo-only data). One
--                       optional crew per project: projects.crew_id.
--
--   schedule_delays     One row per applied delay: the project, the day it
--                       happened, working days delayed, reason, note, who and
--                       when, whether same-crew jobs were cascaded, and the
--                       exact before/after dates of every project (and any
--                       delivery) it moved — what undo restores.
--
--   apply_schedule_delay(payload)   Applies a previewed delay atomically:
--       every project's dates must still equal what the preview showed (or
--       nothing is written — never a silent overwrite), then dates, chosen
--       deliveries, the record and the project timeline entry together.
--   undo_schedule_delay(id)         All-or-nothing: only when every moved
--       project/delivery still has the delayed dates; otherwise refuses and
--       names what changed.
--
-- The shift/cascade math runs in the app (src/lib/scheduleShift.ts); the
-- database only checks and applies. Owners only — employees get read access
-- to the delays on their assigned projects (the "Rain delay" marker).

create table if not exists public.crews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  lead        text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists crews_user_idx on public.crews (user_id, sort_order);

drop trigger if exists crews_set_updated_at on public.crews;
create trigger crews_set_updated_at before update on public.crews
  for each row execute function public.set_updated_at();

alter table public.crews enable row level security;
drop policy if exists "own" on public.crews;
create policy "own" on public.crews for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "employees excluded" on public.crews;
create policy "employees excluded" on public.crews as restrictive for all to authenticated
  using (not public.is_employee()) with check (not public.is_employee());
revoke all on public.crews from anon;

alter table public.projects
  add column if not exists crew_id uuid references public.crews (id) on delete set null;
create index if not exists projects_crew_idx on public.projects (crew_id);

create table if not exists public.schedule_delays (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id       uuid not null references public.projects (id) on delete cascade,
  delay_date       date not null,
  days             int  not null check (days between 1 and 60),
  reason           text not null check (reason in ('rain', 'weather_other', 'material', 'client', 'other')),
  note             text,
  -- 'shift' = job not started, start+end moved; 'extend' = in progress, end moved.
  mode             text not null check (mode in ('shift', 'extend')),
  cascaded         boolean not null default false,
  crew_name        text,
  -- [{ project_id, name, role: 'primary'|'cascade', shift_days,
  --    from: { start, end }, to: { start, end } }]
  changes          jsonb not null default '[]'::jsonb,
  -- [{ order_id, project_id, label, from, to }]
  deliveries       jsonb not null default '[]'::jsonb,
  created_by       uuid default auth.uid(),
  created_by_name  text,
  created_at       timestamptz not null default now(),
  undone_at        timestamptz
);
create index if not exists schedule_delays_project_idx on public.schedule_delays (project_id, created_at desc);

alter table public.schedule_delays enable row level security;
drop policy if exists "own" on public.schedule_delays;
create policy "own" on public.schedule_delays for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "employee views assigned project delays" on public.schedule_delays;
create policy "employee views assigned project delays" on public.schedule_delays for select to authenticated
  using (
    exists (
      select 1 from public.employee_project_assignments a
      join public.employees e on e.id = a.employee_id
      where a.project_id = schedule_delays.project_id
        and e.auth_user_id = auth.uid()
        and e.status = 'active'
    )
  );
revoke all on public.schedule_delays from anon;

create or replace function public._delay_reason_label(p_reason text)
returns text language sql immutable as $$
  select case p_reason
    when 'rain' then 'rain'
    when 'weather_other' then 'weather'
    when 'material' then 'a material delay'
    when 'client' then 'a client request'
    else 'other reasons'
  end;
$$;

create or replace function public.apply_schedule_delay(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_change    jsonb;
  v_del       jsonb;
  v_cur       record;
  v_order     record;
  v_stale     text[] := '{}';
  v_id        uuid;
  v_project   uuid := (p->>'project_id')::uuid;
  v_days      int := (p->>'days')::int;
  v_moved     int := 0;
  v_summary   text;
begin
  if v_uid is null or public.is_employee() then
    raise exception 'Only the account owner can apply schedule delays.';
  end if;
  if jsonb_array_length(coalesce(p->'changes', '[]'::jsonb)) = 0 then
    raise exception 'Nothing to change.';
  end if;

  -- 1. Everything must still look exactly like the preview.
  for v_change in select * from jsonb_array_elements(p->'changes') loop
    select id, name, scheduled_start_date, scheduled_end_date into v_cur
      from public.projects
     where id = (v_change->>'project_id')::uuid and user_id = v_uid
     for update;
    if not found then
      raise exception 'A job in this delay no longer exists.';
    end if;
    if v_cur.scheduled_start_date is distinct from nullif(v_change->'from'->>'start', '')::date
       or v_cur.scheduled_end_date is distinct from nullif(v_change->'from'->>'end', '')::date then
      v_stale := v_stale || v_cur.name;
    end if;
  end loop;
  for v_del in select * from jsonb_array_elements(coalesce(p->'deliveries', '[]'::jsonb)) loop
    select o.id, o.expected_delivery_date into v_order
      from public.material_orders o
      join public.projects pr on pr.id = o.project_id
     where o.id = (v_del->>'order_id')::uuid and pr.user_id = v_uid
     for update of o;
    if not found or v_order.expected_delivery_date is distinct from (v_del->>'from')::date then
      v_stale := v_stale || coalesce(v_del->>'label', 'a delivery');
    end if;
  end loop;
  if array_length(v_stale, 1) > 0 then
    raise exception 'Dates changed since the preview (%). Close and try again.', array_to_string(v_stale, ', ');
  end if;

  -- 2. Apply.
  for v_change in select * from jsonb_array_elements(p->'changes') loop
    update public.projects
       set scheduled_start_date = nullif(v_change->'to'->>'start', '')::date,
           scheduled_end_date   = nullif(v_change->'to'->>'end', '')::date
     where id = (v_change->>'project_id')::uuid;
    if v_change->>'role' = 'cascade' then v_moved := v_moved + 1; end if;
  end loop;
  for v_del in select * from jsonb_array_elements(coalesce(p->'deliveries', '[]'::jsonb)) loop
    update public.material_orders set expected_delivery_date = (v_del->>'to')::date
     where id = (v_del->>'order_id')::uuid;
  end loop;

  insert into public.schedule_delays
    (user_id, project_id, delay_date, days, reason, note, mode, cascaded, crew_name, changes, deliveries, created_by, created_by_name)
  values
    (v_uid, v_project, (p->>'delay_date')::date, v_days, p->>'reason', nullif(trim(coalesce(p->>'note', '')), ''),
     p->>'mode', v_moved > 0, nullif(p->>'crew_name', ''), p->'changes', coalesce(p->'deliveries', '[]'::jsonb),
     v_uid, nullif(p->>'created_by_name', ''))
  returning id into v_id;

  -- 3. Timeline: "Pushed 1 day for rain · Crew C jobs shifted".
  v_summary := case when p->>'mode' = 'extend' then 'Extended ' else 'Pushed ' end
    || v_days || ' working day' || case when v_days = 1 then '' else 's' end
    || ' for ' || public._delay_reason_label(p->>'reason')
    || case when v_moved > 0 then ' · ' || coalesce(nullif(p->>'crew_name', ''), 'crew') || ' jobs shifted (' || v_moved || ')' else '' end;
  insert into public.project_events (project_id, user_id, kind, summary, meta)
  values (v_project, v_uid, 'schedule_delay', v_summary, jsonb_build_object('delay_id', v_id, 'reason', p->>'reason', 'days', v_days));
  for v_change in select * from jsonb_array_elements(p->'changes') loop
    if v_change->>'role' = 'cascade' then
      insert into public.project_events (project_id, user_id, kind, summary, meta)
      values ((v_change->>'project_id')::uuid, v_uid, 'schedule_delay',
              'Shifted ' || (v_change->>'shift_days') || ' working day' || case when (v_change->>'shift_days') = '1' then '' else 's' end
                || ' — ' || coalesce(nullif(p->>'crew_name', ''), 'crew') || ' delay on ' || coalesce(p->>'project_name', 'another job'),
              jsonb_build_object('delay_id', v_id));
    end if;
  end loop;

  return v_id;
end;
$$;

create or replace function public.undo_schedule_delay(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_d       public.schedule_delays;
  v_change  jsonb;
  v_del     jsonb;
  v_cur     record;
  v_order   record;
  v_stale   text[] := '{}';
begin
  if v_uid is null or public.is_employee() then
    raise exception 'Only the account owner can undo schedule delays.';
  end if;
  select * into v_d from public.schedule_delays where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'Delay not found.'; end if;
  if v_d.undone_at is not null then raise exception 'This delay was already undone.'; end if;

  for v_change in select * from jsonb_array_elements(v_d.changes) loop
    select id, name, scheduled_start_date, scheduled_end_date into v_cur
      from public.projects where id = (v_change->>'project_id')::uuid for update;
    if not found then
      v_stale := v_stale || coalesce(v_change->>'name', 'a deleted job');
    elsif v_cur.scheduled_start_date is distinct from nullif(v_change->'to'->>'start', '')::date
       or v_cur.scheduled_end_date is distinct from nullif(v_change->'to'->>'end', '')::date then
      v_stale := v_stale || v_cur.name;
    end if;
  end loop;
  for v_del in select * from jsonb_array_elements(v_d.deliveries) loop
    select id, expected_delivery_date into v_order from public.material_orders where id = (v_del->>'order_id')::uuid for update;
    if not found or v_order.expected_delivery_date is distinct from (v_del->>'to')::date then
      v_stale := v_stale || coalesce(v_del->>'label', 'a delivery');
    end if;
  end loop;
  if array_length(v_stale, 1) > 0 then
    raise exception 'Can''t undo — dates changed since this delay: %. Nothing was changed.', array_to_string(v_stale, ', ');
  end if;

  for v_change in select * from jsonb_array_elements(v_d.changes) loop
    update public.projects
       set scheduled_start_date = nullif(v_change->'from'->>'start', '')::date,
           scheduled_end_date   = nullif(v_change->'from'->>'end', '')::date
     where id = (v_change->>'project_id')::uuid;
  end loop;
  for v_del in select * from jsonb_array_elements(v_d.deliveries) loop
    update public.material_orders set expected_delivery_date = (v_del->>'from')::date
     where id = (v_del->>'order_id')::uuid;
  end loop;

  update public.schedule_delays set undone_at = now() where id = p_id;
  insert into public.project_events (project_id, user_id, kind, summary, meta)
  values (v_d.project_id, v_uid, 'schedule_delay_undone',
          'Undid a ' || v_d.days || '-day delay for ' || public._delay_reason_label(v_d.reason) || ' — dates restored',
          jsonb_build_object('delay_id', p_id));
end;
$$;

revoke all on function public.apply_schedule_delay(jsonb) from public, anon;
revoke all on function public.undo_schedule_delay(uuid) from public, anon;
grant execute on function public.apply_schedule_delay(jsonb) to authenticated;
grant execute on function public.undo_schedule_delay(uuid) to authenticated;
