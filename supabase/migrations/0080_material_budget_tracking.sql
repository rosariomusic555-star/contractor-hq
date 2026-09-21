-- ContractorHQ — Material budget tracking: turns the Materials Sheet from a
-- one-time estimate into a live budget tracked estimated -> ordered ->
-- delivered -> used, for a project's tracked sheets (the sheet linked to
-- the signed quote, plus sheets linked to approved change orders). Run
-- AFTER 0079.
--
-- Ordered/Delivered/Used are NEVER stored as editable numbers — always
-- computed client-side (or in a read-only SQL view, see below) from
-- material_order_items and materials_usage_logs, so they can't drift from
-- their source records. Only the ESTIMATE baseline is ever snapshotted.

-- ---------------------------------------------------------------------------
-- 1. Change orders gain the same one-to-one Materials Sheet link quotes
--    already have (0042) — the missing piece that made "sheets linked to
--    approved change orders" impossible to identify before now.
-- ---------------------------------------------------------------------------

alter table public.change_orders
  add column if not exists material_sheet_id uuid references public.materials_sheets (id) on delete set null;

create unique index if not exists change_orders_material_sheet_id_key
  on public.change_orders (material_sheet_id) where material_sheet_id is not null;

create index if not exists change_orders_material_sheet_id_idx on public.change_orders (material_sheet_id);

-- ---------------------------------------------------------------------------
-- 2. Estimate baselines — append-only snapshots of a line's quantity/cost.
--    The CURRENT baseline for a line is its most recent row here. The very
--    first snapshot (reason null) is inserted automatically by the
--    triggers in section 6; every later one (an explicit "Revise
--    estimate") carries a reason and is inserted by
--    revise_material_baseline() below. Nothing here is ever updated or
--    deleted — "keeps the original" by construction.
-- ---------------------------------------------------------------------------

create table public.materials_item_baselines (
  id                 uuid primary key default gen_random_uuid(),
  materials_item_id  uuid not null references public.materials_items (id) on delete cascade,
  quantity           numeric not null,
  unit_cost          numeric not null,
  unit               text,
  reason             text,
  created_at         timestamptz not null default now()
);

create index on public.materials_item_baselines (materials_item_id, created_at desc);

alter table public.materials_item_baselines enable row level security;

create policy "own" on public.materials_item_baselines for all to authenticated
  using      (exists (
    select 1 from public.materials_items mi
    join public.materials_sections ms on ms.id = mi.section_id
    join public.projects p on p.id = ms.project_id
    where mi.id = materials_item_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.materials_items mi
    join public.materials_sections ms on ms.id = mi.section_id
    join public.projects p on p.id = ms.project_id
    where mi.id = materials_item_id and p.user_id = auth.uid()
  ));

revoke all on public.materials_item_baselines from anon;

create policy "employees excluded" on public.materials_item_baselines
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

-- ---------------------------------------------------------------------------
-- 3. Unit conversion + reconciliation columns on the sheet line itself.
--    conversion_unit/conversion_factor: "1 conversion_unit = conversion_factor
--    x unit" (e.g. unit='sf', conversion_unit='pallet', factor=108).
--    Prefilled from the linked Price Book/Catalog item's specs where one
--    exists (app-layer, not a DB default — specs are jsonb with different
--    shapes per source).
--    reconciled_at/disposition/return_credit: Phase 6 close-out.
-- ---------------------------------------------------------------------------

alter table public.materials_items
  add column if not exists conversion_unit text,
  add column if not exists conversion_factor numeric,
  add column if not exists reconciled_at timestamptz,
  add column if not exists disposition text check (disposition in ('returned', 'kept', 'waste')),
  add column if not exists return_credit numeric;

-- ---------------------------------------------------------------------------
-- 4. Delivery lines gain a sheet-line match, an actual unit price, a
--    per-line status override, and a source flag for future OCR.
--    materials_item_id null = "Unplanned" (counted in actual cost, shown
--    in its own group, never dropped). status null = inherits the parent
--    material_orders.status (today's exact behavior, zero regression) —
--    set only for a genuine partial delivery ("3 of 5 pallets arrived").
-- ---------------------------------------------------------------------------

alter table public.material_order_items
  add column if not exists materials_item_id uuid references public.materials_items (id) on delete set null,
  add column if not exists unit_price numeric,
  add column if not exists status text check (status in ('ordered', 'delivered', 'delayed')),
  add column if not exists source text not null default 'manual' check (source in ('manual', 'ticket')),
  add column if not exists ticket_photo_path text;

create index if not exists material_order_items_materials_item_id_idx
  on public.material_order_items (materials_item_id);

-- ---------------------------------------------------------------------------
-- 5. Usage logs — what actually got used, against a tracked sheet line.
--    Real UPDATE/DELETE on the row itself; materials_usage_log_events
--    below is the audit trail ("kept in the history").
-- ---------------------------------------------------------------------------

create table public.materials_usage_logs (
  id                 uuid primary key default gen_random_uuid(),
  materials_item_id  uuid not null references public.materials_items (id) on delete cascade,
  quantity           numeric not null,
  logged_at          date not null default current_date,
  note               text,
  logged_by          text,
  photo_path         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index on public.materials_usage_logs (materials_item_id);

create trigger materials_usage_logs_set_updated_at before update on public.materials_usage_logs
  for each row execute function public.set_updated_at();

alter table public.materials_usage_logs enable row level security;

create policy "own" on public.materials_usage_logs for all to authenticated
  using      (exists (
    select 1 from public.materials_items mi
    join public.materials_sections ms on ms.id = mi.section_id
    join public.projects p on p.id = ms.project_id
    where mi.id = materials_item_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.materials_items mi
    join public.materials_sections ms on ms.id = mi.section_id
    join public.projects p on p.id = ms.project_id
    where mi.id = materials_item_id and p.user_id = auth.uid()
  ));

revoke all on public.materials_usage_logs from anon;

create policy "employees excluded" on public.materials_usage_logs
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

-- Audit trail for edits/deletes — "the change kept in the history" without
-- turning the log row itself into a versioned document. before_* is null
-- on a 'created' event (nothing to show a diff against).
create table public.materials_usage_log_events (
  id                    uuid primary key default gen_random_uuid(),
  materials_usage_log_id uuid not null references public.materials_usage_logs (id) on delete cascade,
  kind                  text not null check (kind in ('created', 'edited', 'deleted')),
  before_quantity       numeric,
  before_note           text,
  after_quantity        numeric,
  after_note            text,
  created_at            timestamptz not null default now()
);

create index on public.materials_usage_log_events (materials_usage_log_id);

alter table public.materials_usage_log_events enable row level security;

create policy "own" on public.materials_usage_log_events for all to authenticated
  using      (exists (
    select 1 from public.materials_usage_logs ul
    join public.materials_items mi on mi.id = ul.materials_item_id
    join public.materials_sections ms on ms.id = mi.section_id
    join public.projects p on p.id = ms.project_id
    where ul.id = materials_usage_log_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.materials_usage_logs ul
    join public.materials_items mi on mi.id = ul.materials_item_id
    join public.materials_sections ms on ms.id = mi.section_id
    join public.projects p on p.id = ms.project_id
    where ul.id = materials_usage_log_id and p.user_id = auth.uid()
  ));

revoke all on public.materials_usage_log_events from anon;

create policy "employees excluded" on public.materials_usage_log_events
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

-- ---------------------------------------------------------------------------
-- 6. Alert threshold settings — same home as crew hours (0068).
-- ---------------------------------------------------------------------------

alter table public.business_profile
  add column if not exists material_over_order_margin_pct numeric not null default 10,
  add column if not exists material_not_ordered_alert_days int not null default 5;

-- ---------------------------------------------------------------------------
-- 7. Waste-learning design-ahead (Phase "what comes next") — populated once,
--    at reconciliation, by the app layer. Nothing reads this yet.
-- ---------------------------------------------------------------------------

create table public.materials_learning_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id          uuid not null references public.projects (id) on delete cascade,
  catalog_product_id  uuid references public.product_catalog (id) on delete set null,
  material_name       text not null,
  baseline_quantity   numeric not null,
  final_used          numeric not null,
  unit                text,
  created_at          timestamptz not null default now()
);

create index on public.materials_learning_snapshots (user_id);
create index on public.materials_learning_snapshots (catalog_product_id);

alter table public.materials_learning_snapshots enable row level security;

create policy "own" on public.materials_learning_snapshots for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.materials_learning_snapshots from anon;

-- ---------------------------------------------------------------------------
-- 8. snapshot_sheet_baselines() — the one place a baseline is ever
--    inserted. p_reason null = the automatic first snapshot (skips any
--    line that already has one, so it's safe to call more than once);
--    p_reason set = an explicit revision (always inserts, never skips) —
--    see revise_material_baseline() below, the app-facing entry point for
--    that path.
-- ---------------------------------------------------------------------------

create or replace function public.snapshot_sheet_baselines(p_sheet_id uuid, p_reason text default null)
returns void
language plpgsql
as $$
begin
  insert into public.materials_item_baselines (materials_item_id, quantity, unit_cost, unit, reason)
  select mi.id, mi.quantity, mi.unit_cost, mi.unit, p_reason
  from public.materials_items mi
  join public.materials_sections ms on ms.id = mi.section_id
  where ms.sheet_id = p_sheet_id
    and (
      p_reason is not null
      or not exists (select 1 from public.materials_item_baselines b where b.materials_item_id = mi.id)
    );
end;
$$;

create or replace function public.revise_material_baseline(p_materials_item_id uuid, p_reason text)
returns void
language plpgsql
as $$
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to revise an estimate baseline';
  end if;

  insert into public.materials_item_baselines (materials_item_id, quantity, unit_cost, unit, reason)
  select mi.id, mi.quantity, mi.unit_cost, mi.unit, p_reason
  from public.materials_items mi
  where mi.id = p_materials_item_id;

  if not found then
    raise exception 'Materials item % not found', p_materials_item_id;
  end if;
end;
$$;

grant execute on function public.revise_material_baseline(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Automatic first baseline, at the two moments a sheet starts being
--    tracked: the project's Won transition (signed-quote sheet), and a
--    change order's approval (its own sheet). Both are simple AFTER UPDATE
--    triggers, same "fires regardless of which of the several approval
--    paths caused it" shape as 0071's schedule-impact trigger — there's no
--    recursion risk (neither writes back to the table it's triggered on).
-- ---------------------------------------------------------------------------

create or replace function public.snapshot_material_baselines_on_project_won()
returns trigger
language plpgsql
as $$
declare
  v_sheet_id uuid;
begin
  if new.status = 'estimating' or old.status is distinct from 'estimating' then
    return new;
  end if;

  select q.material_sheet_id into v_sheet_id
  from public.quotes q
  where q.project_id = new.id and q.status = 'approved' and q.material_sheet_id is not null
  order by q.updated_at desc
  limit 1;

  if v_sheet_id is not null then
    perform public.snapshot_sheet_baselines(v_sheet_id);
  end if;

  return new;
end;
$$;

drop trigger if exists project_won_snapshot_baselines on public.projects;
create trigger project_won_snapshot_baselines
  after update on public.projects
  for each row execute function public.snapshot_material_baselines_on_project_won();

create or replace function public.snapshot_material_baselines_on_co_approved()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.material_sheet_id is not null then
    perform public.snapshot_sheet_baselines(new.material_sheet_id);
  end if;
  return new;
end;
$$;

drop trigger if exists change_order_snapshot_baselines on public.change_orders;
create trigger change_order_snapshot_baselines
  after update on public.change_orders
  for each row execute function public.snapshot_material_baselines_on_co_approved();

-- ---------------------------------------------------------------------------
-- 10. One-time backfill for projects already past Estimating today, so
--     they start tracking immediately instead of waiting for their next
--     status change. Uses today's live sheet numbers as the baseline
--     (the actual Won date isn't reconstructable) — see snapshot_sheet_
--     baselines' own idempotency, safe to run more than once.
-- ---------------------------------------------------------------------------

do $$
declare
  v_sheet_id uuid;
begin
  for v_sheet_id in
    select q.material_sheet_id
    from public.quotes q
    join public.projects p on p.id = q.project_id
    where q.status = 'approved' and q.material_sheet_id is not null and p.status <> 'estimating'
  loop
    perform public.snapshot_sheet_baselines(v_sheet_id);
  end loop;

  for v_sheet_id in
    select co.material_sheet_id
    from public.change_orders co
    where co.status = 'approved' and co.material_sheet_id is not null
  loop
    perform public.snapshot_sheet_baselines(v_sheet_id);
  end loop;
end $$;
