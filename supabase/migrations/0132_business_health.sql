-- ContractorHQ — Business health (backlog, cash forecast, trends). Run AFTER 0131.
--
-- Settings only; everything else on the page is computed from data the app
-- already has (src/lib/businessHealth.ts is the math).
--
--   crews.work_days                 Working weekdays per crew (0 = Sun … 6 = Sat), default Mon–Fri.
--   holidays                        Business holidays — not working days for capacity.
--   business_health_settings        Invoice payment terms (days) for the projected billing,
--                                   and per-stage win probabilities for the weighted pipeline.

alter table public.crews add column if not exists work_days int[] not null default '{1,2,3,4,5}';

create table if not exists public.holidays (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  name        text not null default 'Holiday',
  created_at  timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.business_health_settings (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  invoice_due_days     int not null default 14 check (invoice_due_days between 0 and 120),
  stage_probabilities  jsonb not null default '{"new_lead": 10, "contacted": 15, "site_visit_scheduled": 25, "site_visit_done": 30, "proposal_sent": 40, "revisions": 60}'::jsonb,
  updated_at           timestamptz not null default now()
);
drop trigger if exists business_health_settings_set_updated_at on public.business_health_settings;
create trigger business_health_settings_set_updated_at before update on public.business_health_settings
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['holidays', 'business_health_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own" on public.%I', t);
    execute format('create policy "own" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
