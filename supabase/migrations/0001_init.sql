-- ContractorHQ initial schema
-- Run this in the Supabase dashboard SQL editor (or via the CLI).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,
  address     text,
  created_at  timestamptz not null default now()
);

create table if not exists public.quotes (
  id           uuid primary key default gen_random_uuid(),
  number       text not null unique,                       -- "QT-001"
  client       text not null,
  project      text,
  amount       numeric(12,2) not null default 0,
  status       text not null default 'draft'
                 check (status in ('draft','sent','approved','rejected')),
  issue_date   date not null default current_date,
  valid_until  date,
  created_at   timestamptz not null default now()
);

create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique,                      -- "INV-001"
  client        text not null,
  project       text,
  amount        numeric(12,2) not null default 0,
  status        text not null default 'draft'
                  check (status in ('draft','sent','paid','overdue')),
  project_type  text check (project_type in
                  ('renovation','new_construction','repair','maintenance')),
  issue_date    date not null default current_date,
  due_date      date,
  created_at    timestamptz not null default now()
);

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  description   text not null,
  category      text check (category in
                  ('materials','labor','subcontractor','equipment','permits','other')),
  project       text,
  amount        numeric(12,2) not null default 0,
  expense_date  date not null default current_date,
  created_at    timestamptz not null default now()
);

create index if not exists quotes_issue_date_idx   on public.quotes (issue_date desc);
create index if not exists invoices_issue_date_idx on public.invoices (issue_date desc);
create index if not exists expenses_date_idx       on public.expenses (expense_date desc);

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- The app has no login and talks to Supabase with the public (anon) key,
-- so RLS is enabled but the anon + authenticated roles are granted full
-- read/write. Anyone with the project URL + anon key can read and write
-- these tables. Tighten this before putting real data behind it.
-- ---------------------------------------------------------------------------

alter table public.clients  enable row level security;
alter table public.quotes   enable row level security;
alter table public.invoices enable row level security;
alter table public.expenses enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['clients','quotes','invoices','expenses'] loop
    execute format(
      'drop policy if exists "public read/write" on public.%I', tbl);
    execute format(
      'create policy "public read/write" on public.%I
         for all to anon, authenticated
         using (true) with check (true)', tbl);
  end loop;
end $$;
