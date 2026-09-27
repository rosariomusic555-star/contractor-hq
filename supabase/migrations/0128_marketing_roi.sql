-- ContractorHQ — Marketing ROI by lead source. Run AFTER 0001-0127.
--
--   lead_source_spend      Ad spend per lead source per month. lead_source
--                          is the lead source's NAME (same denormalized
--                          text pattern as opportunities.lead_source, 0077);
--                          renaming a lead source carries its spend along.
--   lead_sources.paid      Paid vs free source. Free ones (Referral,
--                          Walk-in, Maintenance / Past client, …) show "—"
--                          for spend metrics instead of $0 math.
--   marketing_settings     ROAS / profit-per-dollar colour thresholds.
--
-- Reporting only: nothing here touches job costs or overhead.

create table if not exists public.lead_source_spend (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_source  text not null check (length(trim(lead_source)) > 0),
  month        date not null check (extract(day from month) = 1),   -- first of the month
  amount       numeric(12, 2) not null check (amount >= 0),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, lead_source, month)
);
create index if not exists lead_source_spend_user_month_idx on public.lead_source_spend (user_id, month);

drop trigger if exists lead_source_spend_set_updated_at on public.lead_source_spend;
create trigger lead_source_spend_set_updated_at before update on public.lead_source_spend
  for each row execute function public.set_updated_at();

create table if not exists public.marketing_settings (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  roas_good        numeric not null default 5 check (roas_good > 0),     -- green at / above
  roas_min         numeric not null default 2 check (roas_min >= 0),     -- amber at / above, red below
  profit_good      numeric not null default 2 check (profit_good > 0),   -- profit per $1 spent
  profit_min       numeric not null default 1 check (profit_min >= 0),   -- below this: the ads cost more than the profit they brought
  updated_at       timestamptz not null default now()
);
drop trigger if exists marketing_settings_set_updated_at on public.marketing_settings;
create trigger marketing_settings_set_updated_at before update on public.marketing_settings
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['lead_source_spend', 'marketing_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own" on public.%I', t);
    execute format('create policy "own" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Paid / free. Free by default: referrals, walk-ins, past / repeat clients.
alter table public.lead_sources add column if not exists paid boolean not null default true;

create or replace function public._lead_source_is_free(p_name text)
returns boolean language sql immutable as $$
  select lower(trim(p_name)) ~ '(referr|walk[- ]?in|past client|repeat|word of mouth|maintenance|existing client)';
$$;

update public.lead_sources set paid = false where public._lead_source_is_free(name);

create or replace function public.lead_sources_default_paid()
returns trigger language plpgsql as $$
begin
  if public._lead_source_is_free(new.name) then new.paid := false; end if;
  return new;
end;
$$;
drop trigger if exists lead_sources_default_paid on public.lead_sources;
create trigger lead_sources_default_paid before insert on public.lead_sources
  for each row execute function public.lead_sources_default_paid();

-- Renaming a lead source keeps its spend with it.
create or replace function public.lead_sources_rename_spend()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.lead_source_spend set lead_source = new.name
     where user_id = new.user_id and lead_source = old.name
       and not exists (select 1 from public.lead_source_spend s2
                        where s2.user_id = new.user_id and s2.lead_source = new.name and s2.month = lead_source_spend.month);
  end if;
  return new;
end;
$$;
drop trigger if exists lead_sources_rename_spend on public.lead_sources;
create trigger lead_sources_rename_spend after update of name on public.lead_sources
  for each row execute function public.lead_sources_rename_spend();
revoke all on function public.lead_sources_rename_spend() from public, anon, authenticated;
