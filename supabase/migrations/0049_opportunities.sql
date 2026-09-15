-- ContractorHQ — CRM Phase 2: Opportunities + Sales Pipeline. Run AFTER
-- 0001-0048.
--
-- Same security pattern as every Phase 1 table (0048): RLS ownership is a
-- join through `clients` (which already denies employees entirely, 0047),
-- never a direct `user_id = auth.uid()` column — avoids the class of bug
-- found and fixed in Employee-Only Mode (0045/0046/0047) by construction.

create table public.opportunities (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients (id) on delete cascade,
  title               text not null,
  address             text,
  project_type        text,
  description         text,
  estimated_value     numeric,
  probability         int check (probability between 0 and 100),
  expected_close_date date,
  lead_source         text,
  -- Freeform label, not a real user FK — this app has no multi-user-per-
  -- owner-account concept (Employee-Only Mode logins are a separate,
  -- fully restricted role with zero CRM access), so "assigned team
  -- member" is just a name for now rather than invented user-management
  -- infrastructure.
  assigned_to         text,
  stage               text not null default 'new_lead'
    check (stage in (
      'new_lead', 'attempting_contact', 'contacted', 'qualified',
      'site_visit_scheduled', 'site_visit_completed', 'estimate_in_progress',
      'proposal_sent', 'follow_up', 'won', 'lost'
    )),
  priority            text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  tags                text[] not null default '{}',
  measurements        text,
  lost_reason         text,
  next_action         text,
  next_action_date    date,
  last_contact_date   date,
  -- Set once a quote is created from this opportunity / the opportunity
  -- is converted to a project (CRM Phase 5) — nullable until then.
  quote_id            uuid references public.quotes (id) on delete set null,
  project_id          uuid references public.projects (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on public.opportunities (client_id);
create index on public.opportunities (stage);

create trigger opportunities_set_updated_at before update on public.opportunities
  for each row execute function public.set_updated_at();

alter table public.opportunities enable row level security;

create policy "own" on public.opportunities for all to authenticated
  using      (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

revoke all on public.opportunities from anon;

-- ---------------------------------------------------------------------------
-- opportunity_photos — site photos taken during a sales visit, before a
-- Materials Sheet/project exists. Owned through opportunities -> clients;
-- opportunities' own policy only reads clients, so this doesn't create the
-- circular-policy recursion 0045/0046 had to work around.
-- ---------------------------------------------------------------------------
create table public.opportunity_photos (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references public.opportunities (id) on delete cascade,
  storage_path    text not null,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create index on public.opportunity_photos (opportunity_id);

alter table public.opportunity_photos enable row level security;

create policy "own" on public.opportunity_photos for all to authenticated
  using (
    exists (
      select 1 from public.opportunities o
      join public.clients c on c.id = o.client_id
      where o.id = opportunity_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.opportunities o
      join public.clients c on c.id = o.client_id
      where o.id = opportunity_id and c.user_id = auth.uid()
    )
  );

revoke all on public.opportunity_photos from anon;

create policy "own opportunity photos select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'opportunities'
    and exists (
      select 1 from public.opportunities o
      join public.clients c on c.id = o.client_id
      where o.id::text = (storage.foldername(storage.objects.name))[2]
        and c.user_id = auth.uid()
    )
  );

create policy "own opportunity photos insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'opportunities'
    and exists (
      select 1 from public.opportunities o
      join public.clients c on c.id = o.client_id
      where o.id::text = (storage.foldername(storage.objects.name))[2]
        and c.user_id = auth.uid()
    )
  );

create policy "own opportunity photos delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'opportunities'
    and exists (
      select 1 from public.opportunities o
      join public.clients c on c.id = o.client_id
      where o.id::text = (storage.foldername(storage.objects.name))[2]
        and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- activities (0048) gains an optional opportunity_id — the same timeline
-- table now backs a customer's feed, an opportunity's feed, or both
-- filtered together, with no new table needed.
-- ---------------------------------------------------------------------------
alter table public.activities add column opportunity_id uuid references public.opportunities (id) on delete set null;
create index on public.activities (opportunity_id);
