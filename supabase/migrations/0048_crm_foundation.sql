-- ContractorHQ — CRM Phase 1 (Foundation): enhanced customer records,
-- multiple contacts/addresses/files per client, and a client-wide
-- activity timeline. Run AFTER 0001-0047.
--
-- Security note: every new table below is owned THROUGH a join to
-- `clients` (`exists (select 1 from clients c where c.id = client_id and
-- c.user_id = auth.uid())`) rather than a direct `user_id = auth.uid()`
-- column — this is deliberate. 0047 found and fixed a real bug where a
-- table with a *direct* user_id-ownership column let an employee account
-- self-satisfy RLS by writing under their own identity. Joining through
-- `clients` (which itself already denies employees entirely, per 0047)
-- avoids that whole class of bug here by construction, with no need for
-- a matching restrictive "employees excluded" policy on these new tables.

-- ---------------------------------------------------------------------------
-- clients — additive CRM fields. All nullable/defaulted; nothing existing
-- changes shape. `status` replaces ClientsView.tsx's current client-side-
-- only computed "kind" with a real, persisted value.
-- ---------------------------------------------------------------------------
alter table public.clients
  add column status text not null default 'lead'
    check (status in ('lead', 'active', 'past', 'inactive')),
  add column lead_source text,
  add column preferred_contact_method text
    check (preferred_contact_method in ('phone', 'email', 'text')),
  add column tags text[] not null default '{}',
  add column internal_notes text,
  add column custom_fields jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- client_contacts — additional named contacts beyond the client's own
-- primary phone/email (unchanged, still used everywhere as today).
-- ---------------------------------------------------------------------------
create table public.client_contacts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  name        text not null,
  role        text,
  phone       text,
  email       text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index on public.client_contacts (client_id);

-- ---------------------------------------------------------------------------
-- client_addresses — additional project/property addresses beyond the
-- client's own billing address (clients.address, unchanged).
-- ---------------------------------------------------------------------------
create table public.client_addresses (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  label       text,
  address     text not null,
  is_billing  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index on public.client_addresses (client_id);

-- ---------------------------------------------------------------------------
-- client_files — photos/files attached to a customer record (not
-- project-scoped). storage_path points into the existing "images" bucket
-- (0023) under a new "clients/{client_id}/..." prefix — see the Storage
-- policies below, same per-prefix requirement as every other prefix in
-- that bucket (0023/0032's "table RLS alone isn't enough" precedent).
-- ---------------------------------------------------------------------------
create table public.client_files (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  storage_path text not null,
  name        text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index on public.client_files (client_id);

-- ---------------------------------------------------------------------------
-- activities — the CRM-wide chronological timeline (client_id required;
-- project/quote/invoice ids optional cross-references so the same table
-- can back a customer's timeline and, filtered, a project's/quote's).
-- Deliberately NOT project_events (0013): that table's project_id is
-- NOT NULL at the DB level and already wired into a SECURITY DEFINER RPC
-- (sign_quote) and several call sites — widening it is riskier than this
-- new, additive table. `kind` is open text (not a hard enum), same
-- convention as project_events.kind, so new activity kinds never need a
-- migration. `created_by` is for display only — ownership is the
-- client_id join, not this column (see the security note above).
-- ---------------------------------------------------------------------------
create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete set null,
  quote_id    uuid references public.quotes (id) on delete set null,
  invoice_id  uuid references public.invoices (id) on delete set null,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null,
  summary     text not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index on public.activities (client_id);
create index on public.activities (project_id);

-- ---------------------------------------------------------------------------
-- RLS — ownership-through-clients join for all four tables.
-- ---------------------------------------------------------------------------
alter table public.client_contacts  enable row level security;
alter table public.client_addresses enable row level security;
alter table public.client_files     enable row level security;
alter table public.activities       enable row level security;

create policy "own" on public.client_contacts for all to authenticated
  using      (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

create policy "own" on public.client_addresses for all to authenticated
  using      (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

create policy "own" on public.client_files for all to authenticated
  using      (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

create policy "own" on public.activities for all to authenticated
  using      (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

revoke all on public.client_contacts  from anon;
revoke all on public.client_addresses from anon;
revoke all on public.client_files     from anon;
revoke all on public.activities       from anon;

-- ---------------------------------------------------------------------------
-- Storage — "clients/{client_id}/..." prefix in the existing "images"
-- bucket (0023). Owner-only, no anon policy — client files are never
-- publicly shared.
-- ---------------------------------------------------------------------------
create policy "own client files select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'clients'
    and exists (
      select 1 from public.clients c
      where c.id::text = (storage.foldername(storage.objects.name))[2]
        and c.user_id = auth.uid()
    )
  );

create policy "own client files insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'clients'
    and exists (
      select 1 from public.clients c
      where c.id::text = (storage.foldername(storage.objects.name))[2]
        and c.user_id = auth.uid()
    )
  );

create policy "own client files delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'clients'
    and exists (
      select 1 from public.clients c
      where c.id::text = (storage.foldername(storage.objects.name))[2]
        and c.user_id = auth.uid()
    )
  );
