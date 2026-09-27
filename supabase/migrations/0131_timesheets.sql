-- ContractorHQ — Timesheets + payroll export. Run AFTER 0001-0130.
--
--   payroll_settings      Pay period (weekly / biweekly / semi-monthly + week
--                         start), overtime rules (weekly 40, optional daily,
--                         multiplier), payroll burden % (job costing only),
--                         rounding, auto-deduct lunch.
--   employee_pay_rates    Hourly rate + effective date, history kept. OWNER
--                         ONLY — employees can't read it through any path.
--                         employees.default_hourly_rate is copied here and
--                         cleared (employees could read their own row).
--   timesheets            One per employee per pay period: status
--                         (not_submitted / submitted / approved / rejected),
--                         flag explanations, reject comment.
--   pay_periods           A period marked Exported / Paid.
--   timesheet_events      Log: submit, approve, reject, unlock, export, and
--                         every entry edit (who, what, before → after).
--   labor_entries         + start_at / end_at / break_minutes / source
--                         (timer | manual | owner) / timesheet_id / reg_hours
--                         / ot_hours. A running timer = start_at with no
--                         end_at (server-side, survives closing the browser).
--
-- Every labor entry for an employee created from now on belongs to their
-- timesheet (the trigger attaches it). _recompute_workweek() is the one
-- place hours, overtime and cost are worked out:
--   net hours  = (end − start, rounded) − break − auto lunch (per day)
--   daily OT   = the part of a day over the daily threshold (if set)
--   weekly OT  = regular hours past the weekly threshold, in time order
--   cost       = (reg × rate + ot × rate × multiplier) × (1 + burden %)
--   rate       = the employee's rate in effect on that date
-- Unapproved hours are costed the same way ("pending" in the app); approved
-- or exported timesheets are locked and never recomputed. Entries for
-- workers without a login, and entries from before this migration, keep
-- their typed cost.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_settings (
  user_id            uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  period_type        text not null default 'weekly' check (period_type in ('weekly', 'biweekly', 'semimonthly')),
  week_start         int  not null default 1 check (week_start between 0 and 6),   -- 0 = Sunday … 6 = Saturday
  biweekly_anchor    date,                                                          -- a period start; null = first week_start day of 2026
  ot_weekly_hours    numeric not null default 40 check (ot_weekly_hours > 0),
  ot_daily_hours     numeric check (ot_daily_hours is null or ot_daily_hours > 0),
  ot_multiplier      numeric not null default 1.5 check (ot_multiplier >= 1),
  burden_pct         numeric not null default 0 check (burden_pct between 0 and 100),
  rounding_minutes   int  not null default 0 check (rounding_minutes in (0, 5, 15)),
  lunch_enabled      boolean not null default false,
  lunch_after_hours  numeric not null default 6 check (lunch_after_hours > 0),
  lunch_minutes      int  not null default 30 check (lunch_minutes between 1 and 120),
  long_day_hours     numeric not null default 12 check (long_day_hours > 0),
  updated_at         timestamptz not null default now()
);
drop trigger if exists payroll_settings_set_updated_at on public.payroll_settings;
create trigger payroll_settings_set_updated_at before update on public.payroll_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pay rates (owner only)
-- ---------------------------------------------------------------------------
create table if not exists public.employee_pay_rates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  employee_id     uuid not null references public.employees (id) on delete cascade,
  rate            numeric not null check (rate >= 0),
  effective_date  date not null,
  note            text,
  created_at      timestamptz not null default now(),
  unique (employee_id, effective_date)
);
create index if not exists employee_pay_rates_emp_idx on public.employee_pay_rates (employee_id, effective_date desc);

insert into public.employee_pay_rates (user_id, employee_id, rate, effective_date, note)
select e.owner_user_id, e.id, e.default_hourly_rate, date '2000-01-01', 'Starting rate'
  from public.employees e
 where e.default_hourly_rate is not null
on conflict (employee_id, effective_date) do nothing;
-- Employees can read their own employees row — the rate can't live there.
update public.employees set default_hourly_rate = null where default_hourly_rate is not null;

-- ---------------------------------------------------------------------------
-- Timesheets, pay periods, log
-- ---------------------------------------------------------------------------
create table if not exists public.timesheets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,   -- the owner
  employee_id     uuid not null references public.employees (id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  status          text not null default 'not_submitted' check (status in ('not_submitted', 'submitted', 'approved', 'rejected')),
  flag_notes      jsonb not null default '{}'::jsonb,   -- { <flag key>: "explanation" }
  employee_note   text,
  reject_comment  text,
  submitted_at    timestamptz,
  approved_at     timestamptz,
  approved_by     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, period_start)
);
create index if not exists timesheets_user_period_idx on public.timesheets (user_id, period_start desc);
drop trigger if exists timesheets_set_updated_at on public.timesheets;
create trigger timesheets_set_updated_at before update on public.timesheets
  for each row execute function public.set_updated_at();

create table if not exists public.pay_periods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  exported_at   timestamptz,
  paid_on       date,
  created_at    timestamptz not null default now(),
  unique (user_id, period_start)
);

create table if not exists public.timesheet_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  timesheet_id    uuid references public.timesheets (id) on delete cascade,
  labor_entry_id  uuid,
  actor           text,
  kind            text not null check (kind in ('entry_added', 'entry_edited', 'entry_deleted', 'submitted', 'approved', 'rejected', 'unlocked', 'exported', 'paid', 'export_unlocked')),
  before          jsonb,
  after           jsonb,
  comment         text,
  created_at      timestamptz not null default now()
);
create index if not exists timesheet_events_ts_idx on public.timesheet_events (timesheet_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['payroll_settings', 'employee_pay_rates', 'timesheets', 'pay_periods', 'timesheet_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own" on public.%I', t);
    execute format('create policy "own" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- labor_entries: clock times, source, timesheet link, the hours split.
-- ---------------------------------------------------------------------------
alter table public.labor_entries add column if not exists start_at timestamptz;
alter table public.labor_entries add column if not exists end_at timestamptz;
alter table public.labor_entries add column if not exists break_minutes int not null default 0 check (break_minutes >= 0);
alter table public.labor_entries add column if not exists source text not null default 'owner' check (source in ('owner', 'manual', 'timer'));
alter table public.labor_entries add column if not exists timesheet_id uuid references public.timesheets (id) on delete set null;
alter table public.labor_entries add column if not exists reg_hours numeric;
alter table public.labor_entries add column if not exists ot_hours numeric;
alter table public.labor_entries alter column hours set default 0;
create index if not exists labor_entries_timesheet_idx on public.labor_entries (timesheet_id);
create index if not exists labor_entries_employee_date_idx on public.labor_entries (employee_id, entry_date);
-- One running timer per employee.
create unique index if not exists labor_entries_one_running_timer
  on public.labor_entries (employee_id) where start_at is not null and end_at is null;

alter table public.notification_settings add column if not exists timesheets boolean not null default true;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._payroll_settings(p_owner uuid)
returns public.payroll_settings language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s from public.payroll_settings s where s.user_id = p_owner),
    row(p_owner, 'weekly', 1, null, 40, null, 1.5, 0, 0, false, 6, 30, 12, now())::public.payroll_settings
  );
$$;

/** Start of the workweek (overtime week) containing a date. */
create or replace function public._workweek_start(p_owner uuid, p_date date)
returns date language sql stable security definer set search_path = public as $$
  select p_date - ((extract(dow from p_date)::int - (public._payroll_settings(p_owner)).week_start + 7) % 7);
$$;

/** The pay period containing a date. */
create or replace function public._pay_period(p_owner uuid, p_date date, out period_start date, out period_end date)
language plpgsql stable security definer set search_path = public as $$
declare s public.payroll_settings := public._payroll_settings(p_owner); v_anchor date;
begin
  if s.period_type = 'semimonthly' then
    if extract(day from p_date) <= 15 then
      period_start := date_trunc('month', p_date)::date; period_end := period_start + 14;
    else
      period_start := date_trunc('month', p_date)::date + 15;
      period_end := (date_trunc('month', p_date) + interval '1 month - 1 day')::date;
    end if;
  elsif s.period_type = 'biweekly' then
    v_anchor := coalesce(s.biweekly_anchor, public._workweek_start(p_owner, date '2026-01-07'));
    period_start := v_anchor + (floor((p_date - v_anchor) / 14.0)::int * 14);
    period_end := period_start + 13;
  else
    period_start := public._workweek_start(p_owner, p_date); period_end := period_start + 6;
  end if;
end;
$$;

create or replace function public._rate_on(p_employee uuid, p_date date)
returns numeric language sql stable security definer set search_path = public as $$
  select rate from public.employee_pay_rates where employee_id = p_employee and effective_date <= p_date
   order by effective_date desc limit 1;
$$;

create or replace function public._timesheet_locked(p_timesheet uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.timesheets t
     where t.id = p_timesheet
       and (t.status = 'approved'
            or exists (select 1 from public.pay_periods pp where pp.user_id = t.user_id and pp.period_start = t.period_start and pp.exported_at is not null))
  );
$$;

create or replace function public._ensure_timesheet(p_owner uuid, p_employee uuid, p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare p record; v_id uuid;
begin
  select * into p from public._pay_period(p_owner, p_date);
  insert into public.timesheets (user_id, employee_id, period_start, period_end)
  values (p_owner, p_employee, p.period_start, p.period_end)
  on conflict (employee_id, period_start) do nothing;
  select id into v_id from public.timesheets where employee_id = p_employee and period_start = p.period_start;
  return v_id;
end;
$$;

create or replace function public._actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.employees where auth_user_id = auth.uid() limit 1),
                  case when auth.uid() is null then 'System' else 'Owner' end);
$$;

-- ---------------------------------------------------------------------------
-- The one calculation: net hours, daily + weekly overtime, cost.
-- ---------------------------------------------------------------------------
create or replace function public._recompute_workweek(p_employee uuid, p_week_start date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; s public.payroll_settings; e record;
  v_mins numeric; v_net numeric; v_rate numeric;
  v_day_before numeric; v_daily_ot numeric; v_reg_cand numeric; v_week_ot numeric; v_reg numeric; v_ot numeric;
  v_week_reg numeric := 0;
  v_day date := null; v_day_total numeric := 0;
  v_lunch_ids uuid[] := '{}';
begin
  select owner_user_id into v_owner from public.employees where id = p_employee;
  if v_owner is null then return; end if;
  s := public._payroll_settings(v_owner);

  -- Auto lunch: per day over the threshold with no break at all, deduct from
  -- that day's longest timed entry.
  if s.lunch_enabled then
    select coalesce(array_agg(longest), '{}') into v_lunch_ids from (
      select (array_agg(l.id order by (l.end_at - l.start_at) desc))[1] as longest
        from public.labor_entries l
       where l.employee_id = p_employee and l.timesheet_id is not null
         and l.entry_date between p_week_start and p_week_start + 6
         and l.start_at is not null and l.end_at is not null
       group by l.entry_date
      having sum(extract(epoch from (l.end_at - l.start_at)) / 3600.0) > s.lunch_after_hours
         and sum(l.break_minutes) = 0
    ) d;
  end if;

  for e in
    select l.* from public.labor_entries l
     where l.employee_id = p_employee and l.timesheet_id is not null
       and l.entry_date between p_week_start and p_week_start + 6
     order by l.entry_date, l.start_at nulls last, l.created_at
  loop
    -- Net hours: timed entries from the clock; hours-only entries as typed.
    if e.start_at is not null then
      if e.end_at is null then
        v_net := 0;                                   -- timer still running
      else
        v_mins := extract(epoch from (e.end_at - e.start_at)) / 60.0;
        if s.rounding_minutes > 0 then v_mins := round(v_mins / s.rounding_minutes) * s.rounding_minutes; end if;
        v_mins := v_mins - e.break_minutes - case when e.id = any(v_lunch_ids) then s.lunch_minutes else 0 end;
        v_net := greatest(0, round(v_mins / 60.0, 2));
      end if;
    else
      v_net := coalesce(e.hours, 0);
    end if;

    if v_day is distinct from e.entry_date then v_day := e.entry_date; v_day_total := 0; end if;
    v_day_before := v_day_total;
    v_day_total := v_day_total + v_net;
    v_daily_ot := case when s.ot_daily_hours is null then 0
                       else greatest(0, v_day_total - s.ot_daily_hours) - greatest(0, v_day_before - s.ot_daily_hours) end;
    v_reg_cand := v_net - v_daily_ot;
    v_week_ot := greatest(0, v_week_reg + v_reg_cand - s.ot_weekly_hours) - greatest(0, v_week_reg - s.ot_weekly_hours);
    v_reg := v_reg_cand - v_week_ot;
    v_ot := v_daily_ot + v_week_ot;
    v_week_reg := v_week_reg + v_reg;

    if not public._timesheet_locked(e.timesheet_id) then
      v_rate := public._rate_on(p_employee, e.entry_date);
      update public.labor_entries
         set hours = v_net, reg_hours = round(v_reg, 2), ot_hours = round(v_ot, 2), hourly_rate = v_rate,
             cost = round(coalesce((v_reg * v_rate + v_ot * v_rate * s.ot_multiplier) * (1 + s.burden_pct / 100.0), 0), 2)
       where id = e.id
         and (hours, reg_hours, ot_hours, hourly_rate, cost) is distinct from
             (v_net, round(v_reg, 2), round(v_ot, 2), v_rate,
              round(coalesce((v_reg * v_rate + v_ot * v_rate * s.ot_multiplier) * (1 + s.burden_pct / 100.0), 0), 2));
    end if;
  end loop;
end;
$$;

/** Every workweek touching a timesheet's period. */
create or replace function public._recompute_timesheet(p_timesheet uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record; w date;
begin
  select * into t from public.timesheets where id = p_timesheet;
  if not found then return; end if;
  w := public._workweek_start(t.user_id, t.period_start);
  while w <= t.period_end loop
    perform public._recompute_workweek(t.employee_id, w);
    w := w + 7;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers on labor_entries: attach to the timesheet, enforce the lock,
-- log edits, recompute.
-- ---------------------------------------------------------------------------
create or replace function public.labor_entries_timesheet_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;   -- our own recompute updates
  if tg_op = 'DELETE' then
    if old.timesheet_id is not null and public._timesheet_locked(old.timesheet_id) then
      raise exception 'This timesheet is approved and locked — unlock it first.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.timesheet_id is not null and public._timesheet_locked(old.timesheet_id) then
    raise exception 'This timesheet is approved and locked — unlock it first.';
  end if;
  -- Employee entries belong to a timesheet (legacy rows stay as they were).
  if new.employee_id is not null and (tg_op = 'INSERT' or new.timesheet_id is not null) then
    select owner_user_id into v_owner from public.employees where id = new.employee_id;
    if new.start_at is not null and tg_op = 'INSERT' and new.entry_date is null then new.entry_date := current_date; end if;
    new.timesheet_id := public._ensure_timesheet(v_owner, new.employee_id, new.entry_date);
    if public._timesheet_locked(new.timesheet_id) then
      raise exception 'That week''s timesheet is approved and locked — unlock it first.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists labor_entries_timesheet_before on public.labor_entries;
create trigger labor_entries_timesheet_before before insert or update or delete on public.labor_entries
  for each row execute function public.labor_entries_timesheet_before();

create or replace function public.labor_entries_timesheet_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid; r record; v_kind text; v_before jsonb; v_after jsonb;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  -- Log (only the fields people edit — never the computed ones).
  if (tg_op <> 'INSERT' and old.timesheet_id is not null) or (tg_op <> 'DELETE' and new.timesheet_id is not null) then
    v_before := case when tg_op = 'INSERT' then null else jsonb_build_object('project_id', old.project_id, 'entry_date', old.entry_date, 'start_at', old.start_at, 'end_at', old.end_at, 'break_minutes', old.break_minutes, 'hours', case when old.start_at is null then old.hours end, 'note', old.note) end;
    v_after  := case when tg_op = 'DELETE' then null else jsonb_build_object('project_id', new.project_id, 'entry_date', new.entry_date, 'start_at', new.start_at, 'end_at', new.end_at, 'break_minutes', new.break_minutes, 'hours', case when new.start_at is null then new.hours end, 'note', new.note) end;
    if v_before is distinct from v_after then
      v_kind := case tg_op when 'INSERT' then 'entry_added' when 'DELETE' then 'entry_deleted' else 'entry_edited' end;
      select user_id into v_owner from public.timesheets where id = coalesce(new.timesheet_id, old.timesheet_id);
      insert into public.timesheet_events (user_id, timesheet_id, labor_entry_id, actor, kind, before, after)
      values (v_owner, coalesce(new.timesheet_id, old.timesheet_id), coalesce(new.id, old.id), public._actor_name(), v_kind, v_before, v_after);
    end if;
  end if;
  -- Recompute the affected workweek(s).
  for r in
    select distinct x.emp, x.d from (values
      (case when tg_op <> 'DELETE' and new.timesheet_id is not null then new.employee_id end, case when tg_op <> 'DELETE' then new.entry_date end),
      (case when tg_op <> 'INSERT' and old.timesheet_id is not null then old.employee_id end, case when tg_op <> 'INSERT' then old.entry_date end)
    ) x(emp, d) where x.emp is not null
  loop
    select owner_user_id into v_owner from public.employees where id = r.emp;
    perform public._recompute_workweek(r.emp, public._workweek_start(v_owner, r.d));
  end loop;
  return null;
end;
$$;
drop trigger if exists labor_entries_timesheet_after on public.labor_entries;
create trigger labor_entries_timesheet_after after insert or update or delete on public.labor_entries
  for each row execute function public.labor_entries_timesheet_after();

-- A rate change or a settings change re-costs every unlocked timesheet it touches.
create or replace function public.pay_rates_recompute()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record; v_emp uuid := coalesce(new.employee_id, old.employee_id);
begin
  for t in select id from public.timesheets where employee_id = v_emp and period_end >= least(coalesce(new.effective_date, old.effective_date), coalesce(old.effective_date, new.effective_date)) loop
    if not public._timesheet_locked(t.id) then perform public._recompute_timesheet(t.id); end if;
  end loop;
  return null;
end;
$$;
drop trigger if exists pay_rates_recompute on public.employee_pay_rates;
create trigger pay_rates_recompute after insert or update or delete on public.employee_pay_rates
  for each row execute function public.pay_rates_recompute();

create or replace function public.payroll_settings_recompute()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  for t in select id from public.timesheets where user_id = new.user_id and status <> 'approved' loop
    if not public._timesheet_locked(t.id) then perform public._recompute_timesheet(t.id); end if;
  end loop;
  return null;
end;
$$;
drop trigger if exists payroll_settings_recompute on public.payroll_settings;
create trigger payroll_settings_recompute after insert or update on public.payroll_settings
  for each row execute function public.payroll_settings_recompute();

-- ---------------------------------------------------------------------------
-- Owner actions
-- ---------------------------------------------------------------------------
create or replace function public.pay_period_for(p_date date)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) from public._pay_period(auth.uid(), p_date) p;
$$;

create or replace function public._owner_timesheet(p_id uuid)
returns public.timesheets language plpgsql security definer set search_path = public as $$
declare t public.timesheets;
begin
  select * into t from public.timesheets where id = p_id and user_id = auth.uid();
  if not found or public.is_employee() then raise exception 'Timesheet not found.'; end if;
  return t;
end;
$$;

create or replace function public.approve_timesheet(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.timesheets := public._owner_timesheet(p_id);
begin
  if exists (select 1 from public.labor_entries where timesheet_id = p_id and start_at is not null and end_at is null) then
    raise exception 'A timer is still running on this timesheet.';
  end if;
  perform public._recompute_timesheet(p_id);
  update public.timesheets set status = 'approved', approved_at = now(), approved_by = public._actor_name(), reject_comment = null where id = p_id;
  insert into public.timesheet_events (user_id, timesheet_id, actor, kind) values (t.user_id, p_id, public._actor_name(), 'approved');
end;
$$;

create or replace function public.reject_timesheet(p_id uuid, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.timesheets := public._owner_timesheet(p_id);
begin
  if t.status = 'approved' then raise exception 'Unlock it first.'; end if;
  update public.timesheets set status = 'rejected', reject_comment = nullif(trim(p_comment), '') where id = p_id;
  insert into public.timesheet_events (user_id, timesheet_id, actor, kind, comment) values (t.user_id, p_id, public._actor_name(), 'rejected', p_comment);
end;
$$;

create or replace function public.unlock_timesheet(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.timesheets := public._owner_timesheet(p_id);
begin
  if exists (select 1 from public.pay_periods where user_id = t.user_id and period_start = t.period_start and exported_at is not null) then
    raise exception 'This pay period is marked exported — unlock the period first.';
  end if;
  update public.timesheets set status = 'submitted', approved_at = null, approved_by = null where id = p_id;
  insert into public.timesheet_events (user_id, timesheet_id, actor, kind, comment) values (t.user_id, p_id, public._actor_name(), 'unlocked', p_reason);
end;
$$;

create or replace function public.mark_pay_period(p_period_start date, p_exported boolean, p_paid_on date)
returns void language plpgsql security definer set search_path = public as $$
declare p record; t record;
begin
  if auth.uid() is null or public.is_employee() then raise exception 'Not allowed.'; end if;
  select * into p from public._pay_period(auth.uid(), p_period_start);
  if p_exported and exists (select 1 from public.timesheets where user_id = auth.uid() and period_start = p.period_start and status <> 'approved'
                             and exists (select 1 from public.labor_entries l where l.timesheet_id = timesheets.id)) then
    raise exception 'Approve every timesheet with hours in this period first.';
  end if;
  insert into public.pay_periods (user_id, period_start, period_end, exported_at, paid_on)
  values (auth.uid(), p.period_start, p.period_end, case when p_exported then now() end, p_paid_on)
  on conflict (user_id, period_start) do update
     set exported_at = case when p_exported then coalesce(pay_periods.exported_at, now()) else null end,
         paid_on = p_paid_on;
  for t in select id from public.timesheets where user_id = auth.uid() and period_start = p.period_start loop
    insert into public.timesheet_events (user_id, timesheet_id, actor, kind, comment)
    values (auth.uid(), t.id, public._actor_name(),
            case when p_exported then (case when p_paid_on is not null then 'paid' else 'exported' end) else 'export_unlocked' end,
            case when p_paid_on is not null then 'Paid ' || to_char(p_paid_on, 'Mon DD, YYYY') end);
  end loop;
end;
$$;

/** Daily (owner app open): timesheets waiting → one notification per period. */
create or replace function public.run_timesheet_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int; p record; v_on boolean;
begin
  if v_uid is null or public.is_employee() then return 0; end if;
  select timesheets into v_on from public.notification_settings where user_id = v_uid;
  if not coalesce(v_on, true) then return 0; end if;
  select * into p from public._pay_period(v_uid, current_date - 1);
  select count(*) into n from public.timesheets where user_id = v_uid and status = 'submitted' and period_start <= p.period_start;
  if n > 0 then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    values (v_uid, 'timesheets_waiting', n || ' timesheet' || case when n = 1 then '' else 's' end || ' waiting for approval',
            'Pay period ' || to_char(p.period_start, 'Mon DD') || ' – ' || to_char(p.period_end, 'Mon DD'), '/timesheets',
            'timesheets_waiting:' || p.period_start || ':' || current_date)
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics n = row_count;
  end if;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Employee actions (their own time only; never a rate or a cost).
-- ---------------------------------------------------------------------------
create or replace function public._me_employee()
returns public.employees language plpgsql stable security definer set search_path = public as $$
declare e public.employees;
begin
  select * into e from public.employees where auth_user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not an active employee.'; end if;
  return e;
end;
$$;

create or replace function public._my_editable_timesheet(p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.employees := public._me_employee(); v_id uuid; v_status text;
begin
  v_id := public._ensure_timesheet(e.owner_user_id, e.id, p_date);
  select status into v_status from public.timesheets where id = v_id;
  if v_status in ('submitted', 'approved') or public._timesheet_locked(v_id) then
    raise exception 'That week is already submitted.';
  end if;
  return v_id;
end;
$$;

create or replace function public.my_timesheet(p_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.employees := public._me_employee(); p record; v_ts public.timesheets; prev record; v_prev_status text;
begin
  select * into p from public._pay_period(e.owner_user_id, p_date);
  select * into v_ts from public.timesheets where employee_id = e.id and period_start = p.period_start;
  select * into prev from public._pay_period(e.owner_user_id, p.period_start - 1);
  select status into v_prev_status from public.timesheets t where t.employee_id = e.id and t.period_start = prev.period_start
     and exists (select 1 from public.labor_entries l where l.timesheet_id = t.id);
  return jsonb_build_object(
    'period_start', p.period_start, 'period_end', p.period_end,
    'status', coalesce(v_ts.status, 'not_submitted'),
    'reject_comment', v_ts.reject_comment,
    'flag_notes', coalesce(v_ts.flag_notes, '{}'::jsonb),
    'locked', coalesce(public._timesheet_locked(v_ts.id), false),
    'previous', case when v_prev_status is not null then jsonb_build_object('period_start', prev.period_start, 'period_end', prev.period_end, 'status', v_prev_status) end,
    'settings', (select jsonb_build_object('ot_weekly_hours', s.ot_weekly_hours, 'ot_daily_hours', s.ot_daily_hours, 'long_day_hours', s.long_day_hours, 'week_start', s.week_start) from (select (public._payroll_settings(e.owner_user_id)).*) s),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'project_id', l.project_id, 'project', pr.name, 'entry_date', l.entry_date,
               'start_at', l.start_at, 'end_at', l.end_at, 'break_minutes', l.break_minutes,
               'hours', l.hours, 'reg_hours', l.reg_hours, 'ot_hours', l.ot_hours, 'note', l.note, 'source', l.source)
             order by l.entry_date, l.start_at nulls last)
        from public.labor_entries l join public.projects pr on pr.id = l.project_id
       where l.employee_id = e.id and l.entry_date between p.period_start and p.period_end), '[]'::jsonb),
    'running', (select jsonb_build_object('id', l.id, 'project_id', l.project_id, 'project', pr.name, 'start_at', l.start_at)
                  from public.labor_entries l join public.projects pr on pr.id = l.project_id
                 where l.employee_id = e.id and l.start_at is not null and l.end_at is null limit 1),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name) order by pr.name)
                            from public.employee_project_assignments a join public.projects pr on pr.id = a.project_id
                           where a.employee_id = e.id and pr.status not in ('lost', 'complete')), '[]'::jsonb),
    -- Rain-delay days on their projects (flag "entry on a rained-out day").
    'rain_days', coalesce((select jsonb_agg(distinct jsonb_build_object('project_id', d.project_id, 'date', gs::date))
                             from public.schedule_delays d
                             join public.employee_project_assignments a on a.project_id = d.project_id and a.employee_id = e.id
                             cross join generate_series(d.delay_date, d.delay_date + (d.days - 1), interval '1 day') gs
                            where d.reason = 'rain' and d.undone_at is null
                              and gs::date between p.period_start and p.period_end), '[]'::jsonb)
  );
end;
$$;

create or replace function public.time_clock_in(p_project_id uuid, p_local_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.employees := public._crew_employee(p_project_id); v_id uuid;
begin
  if e.id is null then raise exception 'You''re not assigned to that project.'; end if;
  if exists (select 1 from public.labor_entries where employee_id = e.id and start_at is not null and end_at is null) then
    raise exception 'You''re already clocked in.';
  end if;
  perform public._my_editable_timesheet(p_local_date);
  insert into public.labor_entries (project_id, employee_id, worker_name, entry_date, start_at, source)
  values (p_project_id, e.id, e.name, p_local_date, now(), 'timer')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.time_clock_out(p_break_minutes int, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.employees := public._me_employee(); v_id uuid;
begin
  select id into v_id from public.labor_entries where employee_id = e.id and start_at is not null and end_at is null;
  if v_id is null then raise exception 'You''re not clocked in.'; end if;
  update public.labor_entries
     set end_at = greatest(now(), start_at), break_minutes = greatest(0, coalesce(p_break_minutes, 0)),
         note = coalesce(nullif(trim(p_note), ''), note)
   where id = v_id;
end;
$$;

create or replace function public.time_save_entry(p_id uuid, p_project_id uuid, p_date date, p_start timestamptz, p_end timestamptz, p_break_minutes int, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.employees := public._crew_employee(p_project_id); v_id uuid := p_id; v_old record;
begin
  if e.id is null then raise exception 'You''re not assigned to that project.'; end if;
  if p_start is null or (p_end is not null and p_end <= p_start) then raise exception 'End time must be after the start time.'; end if;
  perform public._my_editable_timesheet(p_date);
  if v_id is null then
    insert into public.labor_entries (project_id, employee_id, worker_name, entry_date, start_at, end_at, break_minutes, note, source)
    values (p_project_id, e.id, e.name, p_date, p_start, p_end, greatest(0, coalesce(p_break_minutes, 0)), nullif(trim(p_note), ''), 'manual')
    returning id into v_id;
  else
    select * into v_old from public.labor_entries where id = v_id and employee_id = e.id;
    if not found then raise exception 'Entry not found.'; end if;
    perform public._my_editable_timesheet(v_old.entry_date);
    update public.labor_entries
       set project_id = p_project_id, entry_date = p_date, start_at = p_start, end_at = p_end,
           break_minutes = greatest(0, coalesce(p_break_minutes, 0)), note = nullif(trim(p_note), '')
     where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.time_delete_entry(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.employees := public._me_employee(); v_old record;
begin
  select * into v_old from public.labor_entries where id = p_id and employee_id = e.id;
  if not found then raise exception 'Entry not found.'; end if;
  perform public._my_editable_timesheet(v_old.entry_date);
  delete from public.labor_entries where id = p_id;
end;
$$;

/** Submit: the app checks flags first (explained ones travel in p_flag_notes). */
create or replace function public.time_submit_week(p_date date, p_flag_notes jsonb, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.employees := public._me_employee(); v_id uuid := public._my_editable_timesheet(p_date); v_notify boolean;
begin
  if exists (select 1 from public.labor_entries where timesheet_id = v_id and start_at is not null and end_at is null) then
    raise exception 'Clock out before submitting.';
  end if;
  update public.timesheets
     set status = 'submitted', submitted_at = now(), flag_notes = coalesce(p_flag_notes, '{}'::jsonb), employee_note = nullif(trim(p_note), '')
   where id = v_id;
  insert into public.timesheet_events (user_id, timesheet_id, actor, kind, comment) values (e.owner_user_id, v_id, e.name, 'submitted', p_note);
  select timesheets into v_notify from public.notification_settings where user_id = e.owner_user_id;
  if coalesce(v_notify, true) then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    values (e.owner_user_id, 'timesheet_submitted', e.name || ' submitted a timesheet', 'Ready for your approval', '/timesheets/' || v_id,
            'timesheet_submitted:' || v_id || ':' || now()::date)
    on conflict (user_id, dedupe_key) do nothing;
  end if;
end;
$$;

-- Grants: internal helpers locked; the RPCs callable by signed-in users.
revoke all on function public._payroll_settings(uuid) from public, anon, authenticated;
revoke all on function public._workweek_start(uuid, date) from public, anon, authenticated;
revoke all on function public._pay_period(uuid, date) from public, anon, authenticated;
revoke all on function public._rate_on(uuid, date) from public, anon, authenticated;
revoke all on function public._timesheet_locked(uuid) from public, anon, authenticated;
revoke all on function public._ensure_timesheet(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public._actor_name() from public, anon, authenticated;
revoke all on function public._recompute_workweek(uuid, date) from public, anon, authenticated;
revoke all on function public._recompute_timesheet(uuid) from public, anon, authenticated;
revoke all on function public._owner_timesheet(uuid) from public, anon, authenticated;
revoke all on function public._me_employee() from public, anon, authenticated;
revoke all on function public._my_editable_timesheet(date) from public, anon, authenticated;
revoke all on function public.labor_entries_timesheet_before() from public, anon, authenticated;
revoke all on function public.labor_entries_timesheet_after() from public, anon, authenticated;
revoke all on function public.pay_rates_recompute() from public, anon, authenticated;
revoke all on function public.payroll_settings_recompute() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'pay_period_for(date)', 'approve_timesheet(uuid)', 'reject_timesheet(uuid, text)', 'unlock_timesheet(uuid, text)',
    'mark_pay_period(date, boolean, date)', 'run_timesheet_reminders()', 'my_timesheet(date)', 'time_clock_in(uuid, date)',
    'time_clock_out(int, text)', 'time_save_entry(uuid, uuid, date, timestamptz, timestamptz, int, text)',
    'time_delete_entry(uuid)', 'time_submit_week(date, jsonb, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
