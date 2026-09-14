-- ContractorHQ — Employee-only mode: a second, much more restricted
-- account type. An employee is a REAL, SEPARATE Supabase Auth user (its
-- own auth.uid()), created directly by the owner (see the create-employee
-- Edge Function) — never via self-signup. Run AFTER 0001-0042.
--
-- Why this needs (almost) no changes to existing RLS: every table in this
-- app is already scoped to `user_id = auth.uid()` (the OWNER's id, see
-- 0003 and everywhere since). An employee's auth.uid() is a different
-- user entirely, so it never matches any existing owner-scoped policy —
-- quotes, materials, price book, catalog, invoices, expenses, change
-- orders, and clients are already fully locked out for an employee with
-- ZERO changes below. This migration only ADDS new, narrow, additive
-- policies (Postgres OR's multiple permissive policies together) for the
-- one slice employees are allowed to touch: their assigned projects' name/
-- status, photos, and free-text notes.

-- ---------------------------------------------------------------------------
-- employees — one row per employee login, linking it back to the owner
-- account that created it. owner_user_id follows the same
-- `default auth.uid()` convention as every other owner table, so the
-- create-employee Edge Function's RLS-scoped insert doesn't need to name
-- it explicitly.
-- ---------------------------------------------------------------------------
create table public.employees (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  auth_user_id  uuid not null unique references auth.users (id) on delete cascade,
  name          text not null,
  email         text not null,
  status        text not null default 'active' check (status in ('active', 'deactivated')),
  created_at    timestamptz not null default now()
);

create index on public.employees (owner_user_id);

alter table public.employees enable row level security;

create policy "own" on public.employees for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- An employee needs to read its own row to know its name and whether it's
-- still active — this is how the app tells "I'm an employee" apart from
-- "I'm an owner" after sign-in.
create policy "employee reads own row" on public.employees for select to authenticated
  using (auth_user_id = auth.uid());

revoke all on public.employees from anon;

-- ---------------------------------------------------------------------------
-- employee_project_assignments — which projects an employee can see.
-- ---------------------------------------------------------------------------
create table public.employee_project_assignments (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (employee_id, project_id)
);

create index on public.employee_project_assignments (employee_id);
create index on public.employee_project_assignments (project_id);

alter table public.employee_project_assignments enable row level security;

-- Owner manages assignments — only for their own employees, onto their own projects.
create policy "own" on public.employee_project_assignments for all to authenticated
  using (
    exists (select 1 from public.employees e where e.id = employee_id and e.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.employees e where e.id = employee_id and e.owner_user_id = auth.uid())
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

-- An employee reads its own assignment rows (used to compute "how many
-- projects am I on" etc — the projects/photos/notes policies below don't
-- depend on this policy, they each do their own join).
create policy "employee reads own assignments" on public.employee_project_assignments for select to authenticated
  using (
    exists (select 1 from public.employees e where e.id = employee_id and e.auth_user_id = auth.uid())
  );

revoke all on public.employee_project_assignments from anon;

-- ---------------------------------------------------------------------------
-- projects — additive employee SELECT policy. The existing "own" policy
-- from 0003 is untouched; this is a second, OR'd permissive policy.
-- ---------------------------------------------------------------------------
create policy "employee views assigned projects" on public.projects for select to authenticated
  using (
    exists (
      select 1 from public.employee_project_assignments a
      join public.employees e on e.id = a.employee_id
      where a.project_id = projects.id
        and e.auth_user_id = auth.uid()
        and e.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- project_images — additive employee policies: read + insert on assigned
-- projects only (no update/delete — an employee can add a photo, not
-- remove anyone's). uploaded_by_employee_id is null for owner uploads.
-- ---------------------------------------------------------------------------
alter table public.project_images
  add column uploaded_by_employee_id uuid references public.employees (id) on delete set null;

create policy "employee views assigned project images" on public.project_images for select to authenticated
  using (
    exists (
      select 1 from public.employee_project_assignments a
      join public.employees e on e.id = a.employee_id
      where a.project_id = project_images.project_id
        and e.auth_user_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy "employee uploads to assigned projects" on public.project_images for insert to authenticated
  with check (
    exists (
      select 1 from public.employee_project_assignments a
      join public.employees e on e.id = a.employee_id
      where a.project_id = project_images.project_id
        and e.auth_user_id = auth.uid()
        and e.status = 'active'
        -- can't attribute the upload to a different employee
        and e.id = project_images.uploaded_by_employee_id
    )
  );

-- ---------------------------------------------------------------------------
-- project_notes — free-text updates, employee-authored. Owner gets full
-- access (read + delete) through project ownership; an employee can only
-- insert/read on projects it's assigned to.
-- ---------------------------------------------------------------------------
create table public.project_notes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index on public.project_notes (project_id);

alter table public.project_notes enable row level security;

create policy "own" on public.project_notes for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "employee views notes on assigned projects" on public.project_notes for select to authenticated
  using (
    exists (
      select 1 from public.employee_project_assignments a
      join public.employees e on e.id = a.employee_id
      where a.project_id = project_notes.project_id
        and e.auth_user_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy "employee posts notes on assigned projects" on public.project_notes for insert to authenticated
  with check (
    exists (
      select 1 from public.employee_project_assignments a
      join public.employees e on e.id = a.employee_id
      where a.project_id = project_notes.project_id
        and e.auth_user_id = auth.uid()
        and e.status = 'active'
        and e.id = project_notes.employee_id
    )
  );

revoke all on public.project_notes from anon;

-- ---------------------------------------------------------------------------
-- Storage — additive employee policies on the existing "images" bucket's
-- "projects/{project_id}/..." prefix (see 0023's header comment on the
-- path convention). Table RLS above is not enough on its own — Storage
-- has its own independent RLS on storage.objects (see 0032's precedent).
-- Read + upload only, no update/delete.
-- ---------------------------------------------------------------------------
create policy "employee views assigned project images storage" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'projects'
    and exists (
      select 1 from public.employee_project_assignments a
      join public.employees e on e.id = a.employee_id
      where a.project_id::text = (storage.foldername(storage.objects.name))[2]
        and e.auth_user_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy "employee uploads assigned project images storage" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'projects'
    and exists (
      select 1 from public.employee_project_assignments a
      join public.employees e on e.id = a.employee_id
      where a.project_id::text = (storage.foldername(storage.objects.name))[2]
        and e.auth_user_id = auth.uid()
        and e.status = 'active'
    )
  );
