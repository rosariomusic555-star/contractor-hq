-- ContractorHQ — Pre-construction checklist.
-- Run AFTER 0001-0123.
--
--   precon_settings          Per contractor: reminder lead time (5 days) and
--                            the state's 811 rules in WORKING days — wait
--                            before digging (3) and ticket validity (15).
--   precon_template_items    The contractor's checklist template (Settings ›
--                            Pre-construction checklist): system items (auto:
--                            quote / selections / deposit / materials /
--                            deliveries / crew / start_confirmed; manual:
--                            hoa / permit / locate) + custom items. Seeded
--                            with the defaults by precon_seed_template().
--   project_precon_items     A project's copy (precon_ensure_project) —
--                            status open / done / na, a manual override for
--                            auto items (+ note), details (HOA / permit
--                            status, number, date, file; 811 ticket, dates,
--                            file), one-off items, removed items kept hidden.
--   precon_notify()          Reminder notification + automation, deduped.
--                            The readiness math lives in the app
--                            (src/lib/precon.ts) — one source.
--
-- Internal only: nothing here is part of the Client Hub serializer.

create table if not exists public.precon_settings (
  user_id            uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  warn_days          int not null default 5 check (warn_days between 1 and 60),
  locate_wait_days   int not null default 3 check (locate_wait_days between 0 and 30),
  locate_valid_days  int not null default 15 check (locate_valid_days between 1 and 120),
  updated_at         timestamptz not null default now()
);

create table if not exists public.precon_template_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null,     -- system key, or 'custom:<uuid>'
  label       text not null check (length(trim(label)) > 0),
  kind        text not null check (kind in ('quote', 'selections', 'deposit', 'materials', 'deliveries', 'crew', 'start_confirmed', 'hoa', 'permit', 'locate', 'custom')),
  required    boolean not null default true,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (user_id, key)
);

create table if not exists public.project_precon_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id        uuid not null references public.projects (id) on delete cascade,
  template_item_id  uuid references public.precon_template_items (id) on delete set null,
  key               text not null,
  label             text not null,
  kind              text not null check (kind in ('quote', 'selections', 'deposit', 'materials', 'deliveries', 'crew', 'start_confirmed', 'hoa', 'permit', 'locate', 'custom')),
  required          boolean not null default true,
  sort_order        int not null default 0,
  -- Manual items: the status itself. Auto items: only used when override.
  status            text not null default 'open' check (status in ('open', 'done', 'na')),
  override          boolean not null default false,
  note              text,
  details           jsonb not null default '{}'::jsonb,
  done_at           timestamptz,
  removed           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (project_id, key)
);
create index if not exists project_precon_items_project_idx on public.project_precon_items (project_id);

drop trigger if exists project_precon_items_set_updated_at on public.project_precon_items;
create trigger project_precon_items_set_updated_at before update on public.project_precon_items
  for each row execute function public.set_updated_at();
drop trigger if exists precon_settings_set_updated_at on public.precon_settings;
create trigger precon_settings_set_updated_at before update on public.precon_settings
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['precon_settings', 'precon_template_items', 'project_precon_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own" on public.%I', t);
    execute format('create policy "own" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- The default template (idempotent — only fills what's missing).
create or replace function public.precon_seed_template()
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null or public.is_employee() then return 0; end if;
  if exists (select 1 from public.precon_template_items where user_id = v_uid) then return 0; end if;
  insert into public.precon_template_items (user_id, key, label, kind, required, sort_order) values
    (v_uid, 'quote',           'Quote signed',                     'quote',           true,  10),
    (v_uid, 'selections',      'Client selections approved',       'selections',      true,  20),
    (v_uid, 'deposit',         'Deposit received',                 'deposit',         true,  30),
    (v_uid, 'materials',       'Materials ordered',                'materials',       true,  40),
    (v_uid, 'deliveries',      'Deliveries scheduled',             'deliveries',      true,  50),
    (v_uid, 'crew',            'Crew assigned',                    'crew',            true,  60),
    (v_uid, 'start_confirmed', 'Start date confirmed with client', 'start_confirmed', true,  70),
    (v_uid, 'locate',          '811 utility locate',               'locate',          true,  80),
    (v_uid, 'permit',          'Permit',                           'permit',          true,  90),
    (v_uid, 'hoa',             'HOA approval',                     'hoa',             false, 100)
  on conflict (user_id, key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- A project's checklist from the template: adds template items it doesn't
-- have yet (never re-adds one removed on this job).
create or replace function public.precon_ensure_project(p_project_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null or public.is_employee() then return 0; end if;
  if not exists (select 1 from public.projects where id = p_project_id and user_id = v_uid) then return 0; end if;
  perform public.precon_seed_template();
  insert into public.project_precon_items (user_id, project_id, template_item_id, key, label, kind, required, sort_order)
  select v_uid, p_project_id, t.id, t.key, t.label, t.kind, t.required, t.sort_order
    from public.precon_template_items t
   where t.user_id = v_uid and t.active
  on conflict (project_id, key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Automations + notifications.
alter table public.automation_rules drop constraint if exists automation_rules_trigger_check;
alter table public.automation_rules add constraint automation_rules_trigger_check
  check (trigger in ('quote_viewed', 'quote_not_opened', 'quote_viewed_not_signed',
                     'review_eligible', 'review_requested', 'review_link_clicked',
                     'precon_overdue', 'precon_ready', 'locate_expiring'));

alter table public.notification_settings add column if not exists precon boolean not null default true;

-- Called by the app's daily check (the readiness math is client-side, one
-- source): one notification per project per kind per dedupe key, plus the
-- matching automation (once per rule per project).
create or replace function public.precon_notify(p_project_id uuid, p_kind text, p_title text, p_body text, p_dedupe text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_on boolean; v_trigger text; v_new boolean := false;
begin
  if v_uid is null or public.is_employee() then return false; end if;
  if not exists (select 1 from public.projects where id = p_project_id and user_id = v_uid) then return false; end if;
  v_trigger := case p_kind when 'overdue' then 'precon_overdue' when 'ready' then 'precon_ready' when 'locate_expiring' then 'locate_expiring' end;
  if v_trigger is null then raise exception 'Unknown kind %', p_kind; end if;

  select precon into v_on from public.notification_settings where user_id = v_uid;
  if coalesce(v_on, true) then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    values (v_uid, 'precon_' || p_kind, p_title, p_body, '/projects/' || p_project_id, 'precon:' || p_dedupe)
    on conflict (user_id, dedupe_key) do nothing
    returning true into v_new;
  end if;
  perform public._run_project_automation(v_uid, v_trigger, p_project_id);
  return coalesce(v_new, false);
end;
$$;

revoke all on function public.precon_seed_template() from public, anon;
revoke all on function public.precon_ensure_project(uuid) from public, anon;
revoke all on function public.precon_notify(uuid, text, text, text, text) from public, anon;
grant execute on function public.precon_seed_template() to authenticated;
grant execute on function public.precon_ensure_project(uuid) to authenticated;
grant execute on function public.precon_notify(uuid, text, text, text, text) to authenticated;

-- Uploads (HOA / permit documents, 811 ticket photos):
-- images bucket, precon/{project_id}/{uuid}.{ext}. Table RLS doesn't cover
-- Storage — each prefix needs its own policy (see 0060).
drop policy if exists "own precon files select" on storage.objects;
create policy "own precon files select" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] = 'precon'
         and exists (select 1 from public.projects p where p.id::text = (storage.foldername(storage.objects.name))[2] and p.user_id = auth.uid()));
drop policy if exists "own precon files insert" on storage.objects;
create policy "own precon files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] = 'precon'
              and exists (select 1 from public.projects p where p.id::text = (storage.foldername(storage.objects.name))[2] and p.user_id = auth.uid()));
drop policy if exists "own precon files delete" on storage.objects;
create policy "own precon files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] = 'precon'
         and exists (select 1 from public.projects p where p.id::text = (storage.foldername(storage.objects.name))[2] and p.user_id = auth.uid()));
