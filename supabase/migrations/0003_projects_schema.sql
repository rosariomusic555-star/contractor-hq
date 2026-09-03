-- ContractorHQ — project-centric schema (replaces the flat 0001/0002 schema)
-- Run in the Supabase SQL editor AFTER 0001/0002, then run 0004_share_functions.sql.
--
-- CLEAN CUTOVER: the flat tables are dropped. There is no data migration.

drop table if exists public.expenses cascade;
drop table if exists public.invoices cascade;
drop table if exists public.quotes   cascade;
drop table if exists public.clients  cascade;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  address     text,
  created_at  timestamptz not null default now()
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete set null,
  name        text not null,
  status      text not null default 'draft'
                check (status in ('draft','active','completed','archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.materials_sections (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0
);

create table public.materials_items (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.materials_sections (id) on delete cascade,
  name        text not null,
  quantity    numeric not null default 0,
  unit_cost   numeric not null default 0,
  sort_order  int not null default 0
);

create table public.quotes (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status             text not null default 'draft'
                       check (status in ('draft','sent','accepted','declined')),
  deposit_percentage numeric not null default 25 check (deposit_percentage between 0 and 100),
  notes              text,
  terms              text,
  share_token        uuid unique,        -- null until the owner shares it
  signed_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.quote_sections (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes (id) on delete cascade,
  name        text not null,
  is_optional bool not null default false,
  sort_order  int not null default 0
);

create table public.quote_items (
  id              uuid primary key default gen_random_uuid(),
  section_id      uuid not null references public.quote_sections (id) on delete cascade,
  name            text not null,
  description     text,
  price           numeric not null default 0,
  is_optional     bool not null default false,
  client_selected bool not null default true,
  sort_order      int not null default 0
);

create table public.invoices (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  quote_id    uuid references public.quotes (id) on delete set null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount      numeric not null default 0,
  status      text not null default 'draft'
                check (status in ('draft','sent','paid','overdue')),
  due_date    date,
  notes       text,
  share_token uuid unique,
  paid_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (every FK + user_id + share_token; RLS on child tables joins)
-- ---------------------------------------------------------------------------
create index on public.clients            (user_id);
create index on public.projects           (user_id);
create index on public.projects           (client_id);
create index on public.materials_sections (project_id);
create index on public.materials_items    (section_id);
create index on public.quotes             (project_id);
create index on public.quotes             (user_id);
create index on public.quote_sections     (quote_id);
create index on public.quote_items        (section_id);
create index on public.invoices           (project_id);
create index on public.invoices           (user_id);
create index on public.invoices           (quote_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger quotes_set_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — authenticated owners only. No public/anon policies.
-- Client-facing access is exclusively through the SECURITY DEFINER functions
-- in 0004_share_functions.sql.
-- ---------------------------------------------------------------------------
alter table public.clients            enable row level security;
alter table public.projects           enable row level security;
alter table public.materials_sections enable row level security;
alter table public.materials_items    enable row level security;
alter table public.quotes             enable row level security;
alter table public.quote_sections     enable row level security;
alter table public.quote_items        enable row level security;
alter table public.invoices           enable row level security;

-- Direct ownership
create policy "own" on public.clients for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on public.projects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on public.quotes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on public.invoices for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Child tables: ownership through the parent, explicit USING + WITH CHECK
create policy "own" on public.materials_sections for all to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "own" on public.materials_items for all to authenticated
  using      (exists (select 1 from public.materials_sections s
                        join public.projects p on p.id = s.project_id
                       where s.id = section_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.materials_sections s
                        join public.projects p on p.id = s.project_id
                       where s.id = section_id and p.user_id = auth.uid()));

create policy "own" on public.quote_sections for all to authenticated
  using      (exists (select 1 from public.quotes q where q.id = quote_id and q.user_id = auth.uid()))
  with check (exists (select 1 from public.quotes q where q.id = quote_id and q.user_id = auth.uid()));

create policy "own" on public.quote_items for all to authenticated
  using      (exists (select 1 from public.quote_sections s
                        join public.quotes q on q.id = s.quote_id
                       where s.id = section_id and q.user_id = auth.uid()))
  with check (exists (select 1 from public.quote_sections s
                        join public.quotes q on q.id = s.quote_id
                       where s.id = section_id and q.user_id = auth.uid()));

-- Anon (and public) get no direct access to any table.
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'clients','projects','materials_sections','materials_items',
    'quotes','quote_sections','quote_items','invoices'
  ] loop
    execute format('revoke all on public.%I from anon', tbl);
  end loop;
end $$;
