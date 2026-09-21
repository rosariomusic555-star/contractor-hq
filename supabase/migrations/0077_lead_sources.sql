-- ContractorHQ — Opportunity/Project restructure, part 5: a real Lead
-- source list (Settings), replacing the free-text field. Run AFTER 0076.
--
-- Same "denormalized text column, not a hard FK" shape as suppliers
-- (0062) — opportunities.lead_source stays a plain text column (the UI
-- reads this table only to populate the dropdown + let the contractor
-- manage the list), so deleting a lead source here never alters existing
-- opportunities; they keep whatever value they were saved with.

create table public.lead_sources (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index on public.lead_sources (user_id);

alter table public.lead_sources enable row level security;

create policy "own" on public.lead_sources for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.lead_sources from anon;

-- Seed a sensible default list for every existing contractor (one per
-- distinct clients.user_id — opportunities has no user_id of its own, see
-- its own "owned via clients" RLS pattern, 0049).
insert into public.lead_sources (user_id, name, sort_order)
select u.user_id, v.name, v.sort_order
from (select distinct user_id from public.clients) u
cross join (values
  ('Facebook', 0), ('Google', 1), ('Referral', 2),
  ('Yelp', 3), ('Website', 4), ('Walk-in', 5), ('Other', 6)
) as v(name, sort_order)
on conflict (user_id, name) do nothing;

-- Real existing free-text values, auto-mapped where obvious. Checked live
-- against production data before writing this: exactly one distinct
-- value existed across every opportunity, 'fb' — mapped to 'Facebook'
-- below. Nothing else needed a judgment call.
update public.opportunities set lead_source = 'Facebook'
 where lower(trim(lead_source)) in ('fb', 'facebook');
