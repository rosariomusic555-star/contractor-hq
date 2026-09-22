-- ContractorHQ — Cost Plan + Labor Plan + Labor Tracking. Turns the Cost
-- Plan into the source of truth for a project's predicted job cost:
--
--   Quote -> Cost Plan -> Material Plan / Labor Plan -> Actual Materials +
--   Labor + Expenses -> Actual Profit
--
-- Run AFTER 0084.
--
-- Deliberately reuses what already exists rather than duplicating it:
--   - Planned MATERIAL cost is never stored here — it's read live from the
--     Materials Sheet (materials_items, same figure ProjectDetailView's
--     Profit Summary already shows — see src/lib/materialTracking.ts's new
--     predictedMaterialCost()). Cost Plan only adds the three groups the
--     app has no other home for: Subcontractors, Equipment, Other.
--   - Planned LABOR cost is never entered directly on the Cost Plan either
--     — it's the sum of labor_plan_entries below (the real Labor Plan,
--     broken out per job category/scope). Same "one source, several
--     screens read it" shape as everything else in this app.
--   - Scope = the project's existing Job Categories (public.categories,
--     0017/0019/0079) — category_id nullable means "General" (whole-
--     project labor not tied to one scope), not a special row.
--
-- All three new tables are plain project children (project_id only, no
-- user_id) — ownership is derived by joining to projects.user_id, same
-- shape as materials_items/materials_usage_logs (0080). Employee-Only
-- Mode logins get NO access to any of this, same deliberate exclusion as
-- material budget tracking (this is cost/pricing data, not the
-- photos/notes slice employees are scoped to).

-- ---------------------------------------------------------------------------
-- 1. Project size (sq ft) — the one new top-level project field driving
--    labor productivity metrics (hours/100sf, cost/sf, sf/labor-hour).
--    Nullable: productivity metrics simply don't show until it's filled in.
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists size_sqft numeric;

-- ---------------------------------------------------------------------------
-- 2. Labor rate defaults — an employee's own rate (prefills a labor entry
--    the moment that employee is picked), falling back to one shared
--    default on business_profile (same home as crew hours/material alert
--    thresholds, 0068/0080) when an employee has none set or the entry is
--    logged against a non-employee crew member.
-- ---------------------------------------------------------------------------

alter table public.employees
  add column if not exists default_hourly_rate numeric;

alter table public.business_profile
  add column if not exists default_labor_rate numeric not null default 45;

-- ---------------------------------------------------------------------------
-- 3. cost_plan_items — the Cost Plan's three manual groups (Subcontractor/
--    Equipment/Other). Materials and Labor are computed, never stored here
--    (see header comment) — 'materials'/'labor' are deliberately NOT valid
--    values of `group`.
-- ---------------------------------------------------------------------------

create table public.cost_plan_items (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  "group"      text not null check ("group" in ('subcontractor', 'equipment', 'other')),
  name         text not null,
  planned_cost numeric not null default 0,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on public.cost_plan_items (project_id);

create trigger cost_plan_items_set_updated_at before update on public.cost_plan_items
  for each row execute function public.set_updated_at();

alter table public.cost_plan_items enable row level security;

create policy "own" on public.cost_plan_items for all to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

revoke all on public.cost_plan_items from anon;

create policy "employees excluded" on public.cost_plan_items
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

-- ---------------------------------------------------------------------------
-- 4. labor_plan_entries — the Labor Plan itself: at most one row per (job
--    category | General) per project, each with planned hours and/or a
--    direct planned cost. `hourly_rate` is kept alongside so the UI can
--    show "hours x rate = cost" and re-derive cost when hours/rate change,
--    but `planned_cost` is always the number every other screen reads
--    (same "stored, app keeps it in sync" convention invoices.amount and
--    change_orders.amount already use) — a contractor who only knows the
--    lump sum can skip hours/rate entirely.
-- ---------------------------------------------------------------------------

create table public.labor_plan_entries (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  category_id   uuid references public.categories (id) on delete set null,
  planned_hours numeric,
  hourly_rate   numeric,
  planned_cost  numeric not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on public.labor_plan_entries (project_id);
create index on public.labor_plan_entries (category_id);

-- At most one plan row per scope per project — app-layer upsert
-- (upsertLaborPlanEntry) selects-then-writes against this same key, this
-- is the backstop. A plain unique index (not a table constraint) so it
-- still allows several null-category ("General") rows if ever needed by a
-- future data fix — the app never creates more than one on its own.
create unique index labor_plan_entries_project_category_key
  on public.labor_plan_entries (project_id, category_id)
  where category_id is not null;

create unique index labor_plan_entries_project_general_key
  on public.labor_plan_entries (project_id)
  where category_id is null;

create trigger labor_plan_entries_set_updated_at before update on public.labor_plan_entries
  for each row execute function public.set_updated_at();

alter table public.labor_plan_entries enable row level security;

create policy "own" on public.labor_plan_entries for all to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

revoke all on public.labor_plan_entries from anon;

create policy "employees excluded" on public.labor_plan_entries
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

-- ---------------------------------------------------------------------------
-- 5. labor_entries — actual labor logged in the field. `employee_id` links
--    a real Employee-Only Mode login when the app has one; `worker_name`
--    is free text (same "denormalized text, not a hard FK" shape as
--    materials_usage_logs.logged_by / Suppliers) for a crew member who
--    isn't a login, or a snapshot if the employee is later removed.
--    `cost` is the stored, canonical figure (hours x hourly_rate when both
--    are entered, or typed directly) — same convention as planned_cost
--    above.
-- ---------------------------------------------------------------------------

create table public.labor_entries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  employee_id uuid references public.employees (id) on delete set null,
  worker_name text,
  entry_date  date not null default current_date,
  hours       numeric not null,
  hourly_rate numeric,
  cost        numeric not null default 0,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on public.labor_entries (project_id);
create index on public.labor_entries (category_id);
create index on public.labor_entries (entry_date desc);

create trigger labor_entries_set_updated_at before update on public.labor_entries
  for each row execute function public.set_updated_at();

alter table public.labor_entries enable row level security;

create policy "own" on public.labor_entries for all to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

revoke all on public.labor_entries from anon;

create policy "employees excluded" on public.labor_entries
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());
