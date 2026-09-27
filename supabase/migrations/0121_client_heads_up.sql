-- ContractorHQ — Client heads-up after schedule changes.
-- Run AFTER 0001-0120.
--
--   message_templates   The contractor's edited message templates (rain
--                       delay / schedule change / start date confirmed).
--                       Defaults live in the app (src/lib/messageTemplates.ts);
--                       a row exists only once a template is edited.
--
--   schedule_updates    One row per change to one job's dates that a client
--                       should hear about: from a rain delay (one per moved
--                       job), a manual edit (projects trigger below), or a
--                       "Confirm start date" action. Carries the heads-up
--                       state (pending / sent / skipped / dismissed, channel,
--                       final message) and client_visible — whether the
--                       Client Hub shows it (default on; delays toggle it in
--                       the heads-up step).
--
--   projects trigger    Manual date edits (Schedule card, Bookings drag)
--                       become a 'manual' update. Edits within 15 min fold
--                       into the same pending row; editing back to the
--                       original dates removes it. Delay apply/undo set
--                       chq.schedule_source so they aren't double-logged.
--                       First-time scheduling isn't a Hub "change" (it only
--                       offers the "Start date confirmed" message).
--
--   Client Hub          _portal_project_json gains `schedule_updates` —
--                       dates + a generic reason (rain / weather / schedule)
--                       only. Never notes, material/client-request reasons,
--                       crews, or other clients' jobs.

create table if not exists public.message_templates (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null check (key in ('rain_delay', 'schedule_change', 'start_confirmed')),
  subject     text,
  body        text not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.schedule_updates (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id       uuid not null references public.projects (id) on delete cascade,
  client_id        uuid references public.clients (id) on delete set null,
  source           text not null check (source in ('delay', 'manual', 'confirm')),
  delay_id         uuid references public.schedule_delays (id) on delete cascade,
  reason           text,
  from_start       date,
  from_end         date,
  to_start         date,
  to_end           date,
  client_visible   boolean not null default true,
  heads_up_status  text not null default 'pending' check (heads_up_status in ('pending', 'sent', 'skipped', 'dismissed')),
  channel          text check (channel in ('text', 'email', 'copy')),
  message          text,
  sent_at          timestamptz,
  withdrawn_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists schedule_updates_project_idx on public.schedule_updates (project_id, created_at desc);
create index if not exists schedule_updates_delay_idx on public.schedule_updates (delay_id);

drop trigger if exists schedule_updates_set_updated_at on public.schedule_updates;
create trigger schedule_updates_set_updated_at before update on public.schedule_updates
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['message_templates', 'schedule_updates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own" on public.%I', t);
    execute format('create policy "own" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Manual date edits → a pending schedule update.
create or replace function public.projects_schedule_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.schedule_updates;
begin
  if coalesce(current_setting('chq.schedule_source', true), '') = 'delay' then return new; end if;
  if new.scheduled_start_date is not distinct from old.scheduled_start_date
     and new.scheduled_end_date is not distinct from old.scheduled_end_date then
    return new;
  end if;
  if new.client_id is null or new.scheduled_start_date is null
     or new.status in ('estimating', 'complete', 'lost') then
    return new;
  end if;

  select * into v_row
    from public.schedule_updates
   where project_id = new.id and source = 'manual' and heads_up_status = 'pending'
     and withdrawn_at is null and updated_at > now() - interval '15 minutes'
   order by created_at desc
   limit 1;

  if found then
    if v_row.from_start is not distinct from new.scheduled_start_date
       and v_row.from_end is not distinct from new.scheduled_end_date then
      delete from public.schedule_updates where id = v_row.id;  -- edited back: nothing changed
    else
      update public.schedule_updates
         set to_start = new.scheduled_start_date, to_end = new.scheduled_end_date, client_id = new.client_id
       where id = v_row.id;
    end if;
  else
    insert into public.schedule_updates
      (user_id, project_id, client_id, source, from_start, from_end, to_start, to_end, client_visible)
    values
      (new.user_id, new.id, new.client_id, 'manual', old.scheduled_start_date, old.scheduled_end_date,
       new.scheduled_start_date, new.scheduled_end_date, old.scheduled_start_date is not null);
  end if;
  return new;
end;
$$;

drop trigger if exists projects_schedule_update on public.projects;
create trigger projects_schedule_update after update of scheduled_start_date, scheduled_end_date on public.projects
  for each row execute function public.projects_schedule_update();

-- Rain delay apply / undo (0120), re-issued: they now write 'delay' schedule
-- updates, withdraw them on undo, and mark their own date changes so the
-- trigger above doesn't also log them as manual edits.
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
  -- 0121: these date changes are recorded below as 'delay' schedule
  -- updates — tell the projects trigger not to log them as manual edits.
  perform set_config('chq.schedule_source', 'delay', true);

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

  -- 0121: one schedule update per moved job that has a client — the
  -- heads-up to send, and (unless turned off) the Client Hub post.
  insert into public.schedule_updates
    (user_id, project_id, client_id, source, delay_id, reason, from_start, from_end, to_start, to_end)
  select v_uid, pr.id, pr.client_id, 'delay', v_id, p->>'reason',
         nullif(c->'from'->>'start', '')::date, nullif(c->'from'->>'end', '')::date,
         nullif(c->'to'->>'start', '')::date, nullif(c->'to'->>'end', '')::date
    from jsonb_array_elements(p->'changes') c
    join public.projects pr on pr.id = (c->>'project_id')::uuid
   where pr.client_id is not null;

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

  perform set_config('chq.schedule_source', 'delay', true);
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
  -- 0121: the Client Hub post comes down; an unsent heads-up is moot.
  update public.schedule_updates
     set withdrawn_at = now(),
         heads_up_status = case when heads_up_status = 'pending' then 'dismissed' else heads_up_status end
   where delay_id = p_id;
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

-- Client Hub: wrap the 0113 serializer (unchanged) and add the schedule
-- updates, whitelisted field by field.
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_portal_project_json_base' and pronamespace = 'public'::regnamespace) then
    alter function public._portal_project_json(uuid) rename to _portal_project_json_base;
  end if;
end $$;

create or replace function public.client_schedule_updates_json(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', su.id,
      'posted_at', su.created_at,
      'reason', case su.reason when 'rain' then 'rain' when 'weather_other' then 'weather' else 'schedule' end,
      'from_start', su.from_start,
      'from_end', su.from_end,
      'to_start', su.to_start,
      'to_end', su.to_end
    ) order by su.created_at desc)
    from public.schedule_updates su
    join public.projects p on p.id = su.project_id
    where su.project_id = p_project_id
      and su.client_visible
      and su.withdrawn_at is null
      and su.source <> 'confirm'
      and su.from_start is not null
      and p.status <> 'estimating'
  ), '[]'::jsonb);
$$;

create or replace function public._portal_project_json(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._portal_project_json_base(p_project_id)
         || jsonb_build_object('schedule_updates', public.client_schedule_updates_json(p_project_id));
$$;

revoke all on function public._portal_project_json(uuid) from public, anon, authenticated;
revoke all on function public._portal_project_json_base(uuid) from public, anon, authenticated;
revoke all on function public.client_schedule_updates_json(uuid) from public, anon, authenticated;
revoke all on function public.projects_schedule_update() from public, anon, authenticated;
