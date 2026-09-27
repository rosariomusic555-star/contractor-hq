-- ContractorHQ — Google review requests.
-- Run AFTER 0001-0121.
--
--   review_settings      Per contractor: on/off, Google link (primary) + other
--                        sites, when to ask (completed | fully paid), delay
--                        (0/1/3 days), reminder after X days (one reminder).
--   clients.no_review_requests   "Don't ask for reviews".
--   projects.completed_at        Set when a project becomes Complete.
--   review_requests      One per project: a random token for the tracked link
--                        /r/{token}, status not_asked → asked → clicked → left
--                        (or dismissed), and the dates of each step. Created
--                        when a job completes, so the Client Hub card works
--                        straight away; eligible_at is set once the rule +
--                        delay is met (run_review_checks).
--   review_click(token)  Public: logs the click and returns ONLY the review
--                        URL. Nothing else about the client or job is exposed.
--
-- No review gating: every request, reminder and Hub card uses the same
-- review link — there is no satisfaction check that filters who gets it.

create table if not exists public.review_settings (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled        boolean not null default true,
  google_url     text,
  other_sites    jsonb not null default '[]'::jsonb,   -- [{ site: 'facebook'|'yelp'|'houzz'|'angi', url }]
  ask_when       text not null default 'completed' check (ask_when in ('completed', 'paid')),
  delay_days     int not null default 0 check (delay_days in (0, 1, 3)),
  reminder_days  int not null default 5 check (reminder_days between 1 and 60),
  updated_at     timestamptz not null default now()
);

alter table public.clients add column if not exists no_review_requests boolean not null default false;

alter table public.projects add column if not exists completed_at timestamptz;
update public.projects p
   set completed_at = coalesce(
     (select max(e.created_at) from public.project_events e
       where e.project_id = p.id and e.kind = 'status_changed' and e.summary ilike '%complete%'),
     p.actual_end_date::timestamptz,
     p.updated_at)
 where p.status = 'complete' and p.completed_at is null;

create table if not exists public.review_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id       uuid not null unique references public.projects (id) on delete cascade,
  client_id        uuid references public.clients (id) on delete set null,
  token            uuid not null unique default gen_random_uuid(),
  status           text not null default 'not_asked' check (status in ('not_asked', 'asked', 'clicked', 'left', 'dismissed')),
  eligible_at      timestamptz,
  asked_at         timestamptz,
  asked_channel    text check (asked_channel in ('text', 'email', 'copy')),
  reminded_at      timestamptz,
  reminder_channel text check (reminder_channel in ('text', 'email', 'copy')),
  first_clicked_at timestamptz,
  last_clicked_at  timestamptz,
  click_count      int not null default 0,
  left_at          timestamptz,
  dismissed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists review_requests_user_idx on public.review_requests (user_id, status);

drop trigger if exists review_requests_set_updated_at on public.review_requests;
create trigger review_requests_set_updated_at before update on public.review_requests
  for each row execute function public.set_updated_at();
drop trigger if exists review_settings_set_updated_at on public.review_settings;
create trigger review_settings_set_updated_at before update on public.review_settings
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['review_settings', 'review_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own" on public.%I', t);
    execute format('create policy "own" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Completion time + a review row as soon as a job is Complete.
create or replace function public.projects_completed_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'complete' then
      new.completed_at := now();
    elsif old.status = 'complete' then
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists projects_completed_review on public.projects;
create trigger projects_completed_review before update of status on public.projects
  for each row execute function public.projects_completed_review();

create or replace function public.projects_review_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'complete' and new.client_id is not null then
    insert into public.review_requests (user_id, project_id, client_id)
    values (new.user_id, new.id, new.client_id)
    on conflict (project_id) do update set client_id = excluded.client_id;
  end if;
  return new;
end;
$$;
drop trigger if exists projects_review_row on public.projects;
create trigger projects_review_row after insert or update of status, client_id on public.projects
  for each row execute function public.projects_review_row();

insert into public.review_requests (user_id, project_id, client_id)
select p.user_id, p.id, p.client_id from public.projects p
 where p.status = 'complete' and p.client_id is not null
on conflict (project_id) do nothing;

-- Notifications toggle + templates + automation triggers.
alter table public.notification_settings add column if not exists review_activity boolean not null default true;

alter table public.message_templates drop constraint if exists message_templates_key_check;
alter table public.message_templates add constraint message_templates_key_check
  check (key in ('rain_delay', 'schedule_change', 'start_confirmed', 'review_request', 'review_reminder'));

alter table public.automation_rules drop constraint if exists automation_rules_trigger_check;
alter table public.automation_rules add constraint automation_rules_trigger_check
  check (trigger in ('quote_viewed', 'quote_not_opened', 'quote_viewed_not_signed',
                     'review_eligible', 'review_requested', 'review_link_clicked'));

alter table public.automation_runs alter column quote_id drop not null;
alter table public.automation_runs add column if not exists project_id uuid references public.projects (id) on delete cascade;
create unique index if not exists automation_runs_rule_project_uidx on public.automation_runs (rule_id, project_id) where project_id is not null;

-- One task per rule per project (same as the quote automations).
create or replace function public._run_project_automation(p_owner uuid, p_trigger text, p_project uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_run uuid; v_task uuid; v_count int := 0; v_title text; pr record;
begin
  select p.id, p.name, p.client_id, c.name as client_name,
         (select o.id from public.opportunities o where o.project_id = p.id order by o.created_at limit 1) as opportunity_id
    into pr
    from public.projects p left join public.clients c on c.id = p.client_id
   where p.id = p_project;
  if not found then return 0; end if;
  for r in select * from public.automation_rules where user_id = p_owner and trigger = p_trigger and enabled loop
    v_run := null;
    insert into public.automation_runs (rule_id, project_id) values (r.id, p_project)
    on conflict (rule_id, project_id) where project_id is not null do nothing returning id into v_run;
    if v_run is null then continue; end if;
    v_title := replace(replace(r.task_title, '{client}', coalesce(pr.client_name, 'client')), '{project}', coalesce(pr.name, 'project'));
    insert into public.tasks (user_id, title, due_at, client_id, opportunity_id, project_id, task_type, priority)
    values (p_owner, v_title, now() + make_interval(days => r.due_in_days), pr.client_id, pr.opportunity_id, pr.id,
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

create or replace function public._review_notify(p_user uuid, p_project uuid, p_kind text, p_title text, p_body text, p_dedupe text)
returns void language plpgsql security definer set search_path = public as $$
declare v_on boolean;
begin
  select review_activity into v_on from public.notification_settings where user_id = p_user;
  if not coalesce(v_on, true) then return; end if;
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (p_user, p_kind, p_title, p_body, '/projects/' || p_project, p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

-- Eligibility: Complete (or Complete + fully paid) + the delay, within 60
-- days of completion (older jobs only via the manual "Request review").
create or replace function public._review_checks(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare s record; r record; v_basis timestamptz; v_paid timestamptz; v_remaining numeric; v_n int := 0;
begin
  select * into s from public.review_settings where user_id = p_user;
  if not found or not s.enabled or coalesce(trim(s.google_url), '') = '' then return 0; end if;

  -- Rows for completed jobs that predate their trigger.
  insert into public.review_requests (user_id, project_id, client_id)
  select p.user_id, p.id, p.client_id from public.projects p
   where p.user_id = p_user and p.status = 'complete' and p.client_id is not null
  on conflict (project_id) do nothing;

  for r in
    select rr.id, rr.project_id, p.name as project_name, p.completed_at, c.name as client_name
      from public.review_requests rr
      join public.projects p on p.id = rr.project_id
      join public.clients c on c.id = rr.client_id
     where rr.user_id = p_user and rr.status = 'not_asked' and rr.eligible_at is null
       and p.status = 'complete' and p.completed_at is not null
       and p.completed_at > now() - interval '60 days'
       and not c.no_review_requests
  loop
    v_basis := r.completed_at;
    if s.ask_when = 'paid' then
      v_remaining := public.project_contract_value(r.project_id)
        - coalesce((select sum(amount) from public.payments where project_id = r.project_id and status = 'active'), 0);
      if v_remaining > 0.005 then continue; end if;
      select max(paid_on)::timestamptz into v_paid from public.payments where project_id = r.project_id and status = 'active';
      v_basis := greatest(v_basis, coalesce(v_paid, v_basis));
    end if;
    if v_basis + make_interval(days => s.delay_days) > now() then continue; end if;

    update public.review_requests set eligible_at = now() where id = r.id;
    perform public._review_notify(p_user, r.project_id, 'review_eligible',
      'Ask ' || r.client_name || ' for a review', r.project_name || ' is finished', 'review_eligible:' || r.project_id);
    perform public._run_project_automation(p_user, 'review_eligible', r.project_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.run_review_checks()
returns int language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_employee() then return 0; end if;
  return public._review_checks(auth.uid());
end;
$$;

-- For pg_cron: select public.run_review_checks_all();
create or replace function public.run_review_checks_all()
returns int language plpgsql security definer set search_path = public as $$
declare u uuid; n int := 0;
begin
  for u in select user_id from public.review_settings where enabled loop
    n := n + public._review_checks(u);
  end loop;
  return n;
end;
$$;

-- "Mark as sent" for a request or its (single) reminder: status, activity
-- log (communication center), project timeline, automation.
create or replace function public.mark_review_request_sent(p_project_id uuid, p_channel text, p_message text, p_reminder boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); rr record; v_label text; v_word text;
begin
  if v_uid is null or public.is_employee() then raise exception 'Only the account owner can do this.'; end if;
  if p_channel not in ('text', 'email', 'copy') then raise exception 'Unknown channel'; end if;
  select rr0.*, p.name as project_name into rr
    from public.review_requests rr0 join public.projects p on p.id = rr0.project_id
   where rr0.project_id = p_project_id and rr0.user_id = v_uid for update of rr0;
  if not found then raise exception 'No review request for this project.'; end if;

  if p_reminder then
    update public.review_requests set reminded_at = now(), reminder_channel = p_channel where id = rr.id;
  else
    update public.review_requests
       set asked_at = coalesce(asked_at, now()), asked_channel = p_channel,
           eligible_at = coalesce(eligible_at, now()),
           status = case when status in ('not_asked', 'dismissed') then 'asked' else status end,
           dismissed_at = null
     where id = rr.id;
  end if;

  v_label := case when p_reminder then 'Review reminder' else 'Review request' end;
  v_word := case p_channel when 'text' then 'text' when 'email' then 'email' else 'a copied message' end;
  if rr.client_id is not null then
    insert into public.activities (client_id, project_id, created_by, kind, summary, meta)
    values (rr.client_id, rr.project_id, v_uid, case p_channel when 'copy' then 'note' else p_channel end,
            v_label || ' (' || v_word || '): ' || coalesce(p_message, ''),
            jsonb_build_object('review_request', true, 'reminder', p_reminder, 'channel', p_channel));
  end if;
  insert into public.project_events (project_id, user_id, kind, summary, meta)
  values (rr.project_id, v_uid, 'review_requested', v_label || ' sent via ' || v_word, jsonb_build_object('reminder', p_reminder));
  if not p_reminder then
    perform public._run_project_automation(v_uid, 'review_requested', rr.project_id);
  end if;
end;
$$;

-- The tracked link. Public (anon): returns only the review URL (Google, or
-- the first other site if no Google link). The contractor/team opening it
-- isn't counted.
create or replace function public.review_click(p_token uuid)
returns text language plpgsql security definer set search_path = public as $$
declare rr record; s record; v_url text; v_first boolean;
begin
  select rr0.*, p.name as project_name, c.name as client_name into rr
    from public.review_requests rr0
    join public.projects p on p.id = rr0.project_id
    left join public.clients c on c.id = rr0.client_id
   where rr0.token = p_token;
  if not found then return null; end if;
  select * into s from public.review_settings where user_id = rr.user_id;
  v_url := nullif(trim(coalesce(s.google_url, '')), '');
  if v_url is null then
    select nullif(trim(x->>'url'), '') into v_url from jsonb_array_elements(coalesce(s.other_sites, '[]'::jsonb)) x
     where nullif(trim(x->>'url'), '') is not null limit 1;
  end if;
  if v_url is null then return null; end if;
  if v_url !~* '^https?://' then v_url := 'https://' || v_url; end if;

  if auth.uid() is not null and (auth.uid() = rr.user_id
     or exists (select 1 from public.employees e where e.auth_user_id = auth.uid() and e.owner_user_id = rr.user_id)) then
    return v_url;
  end if;

  v_first := rr.first_clicked_at is null;
  update public.review_requests
     set click_count = click_count + 1,
         first_clicked_at = coalesce(first_clicked_at, now()),
         last_clicked_at = now(),
         status = case when status in ('not_asked', 'asked') then 'clicked' else status end
   where id = rr.id;

  if v_first then
    if rr.client_id is not null then
      insert into public.activities (client_id, project_id, created_by, kind, summary, meta)
      values (rr.client_id, rr.project_id, rr.user_id, 'review_link_clicked', 'Opened the review link for ' || rr.project_name, '{}'::jsonb);
    end if;
    insert into public.project_events (project_id, user_id, kind, summary, meta)
    values (rr.project_id, rr.user_id, 'review_link_clicked', coalesce(rr.client_name, 'The client') || ' opened the review link', '{}'::jsonb);
    perform public._review_notify(rr.user_id, rr.project_id, 'review_clicked',
      coalesce(rr.client_name, 'Your client') || ' opened your review link', rr.project_name, 'review_clicked:' || rr.project_id);
    perform public._run_project_automation(rr.user_id, 'review_link_clicked', rr.project_id);
  end if;
  return v_url;
end;
$$;

-- Client Hub: a review card for completed projects (the tracked link only).
create or replace function public.client_review_json(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('link_path', '/r/' || rr.token)
    from public.review_requests rr
    join public.projects p on p.id = rr.project_id
    join public.review_settings s on s.user_id = p.user_id
    left join public.clients c on c.id = p.client_id
   where rr.project_id = p_project_id
     and p.status = 'complete'
     and s.enabled
     and (coalesce(trim(s.google_url), '') <> '' or jsonb_array_length(s.other_sites) > 0)
     and not coalesce(c.no_review_requests, false)
     and rr.status <> 'dismissed';
$$;

create or replace function public._portal_project_json(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._portal_project_json_base(p_project_id)
         || jsonb_build_object(
              'schedule_updates', public.client_schedule_updates_json(p_project_id),
              'review', public.client_review_json(p_project_id));
$$;

revoke all on function public._portal_project_json(uuid) from public, anon, authenticated;
revoke all on function public.client_review_json(uuid) from public, anon, authenticated;
revoke all on function public._review_checks(uuid) from public, anon, authenticated;
revoke all on function public._review_notify(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public._run_project_automation(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.run_review_checks_all() from public, anon, authenticated;
revoke all on function public.projects_completed_review() from public, anon, authenticated;
revoke all on function public.projects_review_row() from public, anon, authenticated;
grant execute on function public.run_review_checks() to authenticated;
grant execute on function public.mark_review_request_sent(uuid, text, text, boolean) to authenticated;
grant execute on function public.review_click(uuid) to anon, authenticated;
