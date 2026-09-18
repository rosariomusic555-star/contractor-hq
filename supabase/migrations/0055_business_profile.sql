-- ContractorHQ — real, persisted "Business profile" (Settings > Business profile).
-- Run AFTER 0001-0054.
--
-- One row per user, same shape as quote_defaults (0016) / backlog_settings
-- (0054). Settings > Business profile was previously 100% decorative —
-- hardcoded defaultValue props, Save button wired to nothing. Made real here
-- because the Weather Strip (Dashboard) needs a real address to geocode.

create table if not exists public.business_profile (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  company_name text,
  phone        text,
  email        text,
  license      text,
  address      text,
  updated_at   timestamptz not null default now()
);

create trigger business_profile_set_updated_at before update on public.business_profile
  for each row execute function public.set_updated_at();

alter table public.business_profile enable row level security;

create policy "own" on public.business_profile for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.business_profile from anon;
