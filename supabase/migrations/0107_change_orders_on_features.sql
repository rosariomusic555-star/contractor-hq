-- =============================================================================
-- 0107 — Change orders modify existing features (Phase C)
--
-- A change order changes features that already exist and are active (a
-- bigger patio, a paver upgrade, a removal/credit). It never creates a
-- feature or a Cost plan. Each change order section targets one feature and
-- records:
--   * the scope / measurement change (scope_note, e.g. "+100 sq ft")
--   * the customer price change — the section's items, + or −
--   * the planned cost change — change_order_cost_changes: add / edit /
--     remove Cost plan lines on that feature's section, or change its labor
--
-- While the change order is draft / sent nothing is applied (the Cost plan
-- shows the changes as a "Pending CO #n" overlay). When it's approved — in
-- the app, by share link or in the Client Hub, all three set status — a
-- trigger applies the cost changes to the feature's section and records the
-- feature's history (Original → CO #1 → CO #2 → Current). Declined applies
-- nothing and is recorded as declined.
-- =============================================================================

alter table public.change_order_sections
  add column if not exists feature_id uuid references public.project_features (id) on delete set null,
  add column if not exists scope_note text;

create index if not exists change_order_sections_feature_id_idx on public.change_order_sections (feature_id);

create table if not exists public.change_order_cost_changes (
  id                  uuid primary key default gen_random_uuid(),
  change_order_id     uuid not null references public.change_orders (id) on delete cascade,
  section_id          uuid references public.change_order_sections (id) on delete cascade,
  feature_id          uuid references public.project_features (id) on delete set null,
  kind                text not null check (kind in ('add', 'edit', 'remove', 'labor')),
  -- edit / remove: the Cost plan line being changed
  materials_item_id   uuid references public.materials_items (id) on delete set null,
  -- labor (and add, optionally): the feature's Cost plan section
  materials_section_id uuid references public.materials_sections (id) on delete set null,
  -- add / edit: the line's new values {name, quantity, unit, unit_cost,
  -- waste_percent, cost_type, vendor}; labor: the new labor fields
  line                jsonb not null default '{}'::jsonb,
  -- edit / remove / labor: how it was when the change was written (for the
  -- diff and the planned-cost delta)
  before              jsonb,
  -- add: the line the approval created
  applied_item_id     uuid,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists change_order_cost_changes_co_idx on public.change_order_cost_changes (change_order_id);
create index if not exists change_order_cost_changes_feature_idx on public.change_order_cost_changes (feature_id);

alter table public.change_order_cost_changes enable row level security;

drop policy if exists "own" on public.change_order_cost_changes;
create policy "own" on public.change_order_cost_changes for all to authenticated
  using      (exists (select 1 from public.change_orders co where co.id = change_order_id and co.user_id = auth.uid()))
  with check (exists (select 1 from public.change_orders co where co.id = change_order_id and co.user_id = auth.uid()));

drop policy if exists "employees excluded" on public.change_order_cost_changes;
create policy "employees excluded" on public.change_order_cost_changes
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

revoke all on public.change_order_cost_changes from anon;

-- One row per event in a feature's life after the original scope.
create table if not exists public.feature_history (
  id              uuid primary key default gen_random_uuid(),
  feature_id      uuid not null references public.project_features (id) on delete cascade,
  project_id      uuid not null references public.projects (id) on delete cascade,
  change_order_id uuid references public.change_orders (id) on delete set null,
  quote_id        uuid references public.quotes (id) on delete set null,
  event           text not null check (event in ('change_order_approved', 'change_order_declined', 'addon_approved', 'addon_declined')),
  label           text,
  cost_before     numeric not null default 0,
  cost_after      numeric not null default 0,
  price_before    numeric not null default 0,
  price_after     numeric not null default 0,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists feature_history_feature_idx on public.feature_history (feature_id, created_at);

alter table public.feature_history enable row level security;

drop policy if exists "own" on public.feature_history;
create policy "own" on public.feature_history for all to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

drop policy if exists "employees excluded" on public.feature_history;
create policy "employees excluded" on public.feature_history
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

revoke all on public.feature_history from anon;

-- ---------------------------------------------------------------------------
-- Money helpers (same math as src/lib/costPlanMath.ts / api.ts quoteTotal)
-- ---------------------------------------------------------------------------

-- A feature's planned cost: its Cost plan section(s).
create or replace function public.feature_planned_cost(p_feature_id uuid)
returns numeric language sql stable as $$
  select public.cost_plan_sections_total(array(select id from public.materials_sections where feature_id = p_feature_id))
$$;

-- A feature's customer price: its sections on approved quotes (required
-- items + selected optionals) + its sections on approved change orders.
create or replace function public.feature_price(p_feature_id uuid)
returns numeric language sql stable as $$
  select coalesce((
    select sum(case when (not s.is_optional and not i.is_optional) or i.client_selected then i.price * i.quantity else 0 end)
    from public.quote_sections s
    join public.quote_items i on i.section_id = s.id
    join public.quotes q on q.id = s.quote_id
    where s.feature_id = p_feature_id and q.status = 'approved'
  ), 0) + coalesce((
    select sum(i.price * coalesce(i.quantity, 1))
    from public.change_order_sections s
    join public.change_order_items i on i.section_id = s.id
    join public.change_orders co on co.id = s.change_order_id
    where s.feature_id = p_feature_id and co.status = 'approved'
  ), 0)
$$;

-- "CO #n" — 1-based, in creation order within the project.
create or replace function public.change_order_number(p_change_order_id uuid)
returns int language sql stable as $$
  select count(*)::int
  from public.change_orders a
  join public.change_orders b on b.project_id = a.project_id and b.created_at <= a.created_at
  where a.id = p_change_order_id
$$;

-- ---------------------------------------------------------------------------
-- Apply an approved change order to its features
-- ---------------------------------------------------------------------------

create or replace function public.apply_change_order_to_features(p_change_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_co         record;
  v_label      text;
  v_feature    uuid;
  v_cost_before numeric;
  v_price_this numeric;
  v_price_after numeric;
  c            record;
  v_section    uuid;
  v_item       uuid;
  v_has_base   boolean;
begin
  select * into v_co from public.change_orders where id = p_change_order_id;
  if not found then return; end if;
  v_label := 'CO #' || public.change_order_number(p_change_order_id);

  for v_feature in
    select feature_id from public.change_order_sections where change_order_id = p_change_order_id and feature_id is not null
    union
    select feature_id from public.change_order_cost_changes where change_order_id = p_change_order_id and feature_id is not null
  loop
    -- only features that exist and are active; a change order never
    -- creates or revives one
    continue when not exists (select 1 from public.project_features where id = v_feature and status = 'active');

    v_cost_before := public.feature_planned_cost(v_feature);
    v_price_this := coalesce((
      select sum(i.price * coalesce(i.quantity, 1))
      from public.change_order_sections s
      join public.change_order_items i on i.section_id = s.id
      where s.change_order_id = p_change_order_id and s.feature_id = v_feature
    ), 0);

    for c in
      select * from public.change_order_cost_changes
      where change_order_id = p_change_order_id and feature_id = v_feature
      order by sort_order, created_at
    loop
      v_section := coalesce(
        c.materials_section_id,
        (select s.id from public.materials_sections s where s.feature_id = v_feature order by s.sort_order limit 1)
      );

      if c.kind = 'add' and v_section is not null then
        insert into public.materials_items (section_id, name, quantity, unit, unit_cost, waste_percent, cost_type, vendor, tracked, sort_order)
        values (
          v_section,
          coalesce(nullif(c.line->>'name', ''), 'Change order line'),
          coalesce((c.line->>'quantity')::numeric, 1),
          nullif(c.line->>'unit', ''),
          coalesce((c.line->>'unit_cost')::numeric, 0),
          coalesce((c.line->>'waste_percent')::numeric, 0),
          coalesce(nullif(c.line->>'cost_type', ''), 'material'),
          nullif(c.line->>'vendor', ''),
          coalesce(nullif(c.line->>'cost_type', ''), 'material') = 'material',
          (select coalesce(max(sort_order), -1) + 1 from public.materials_items where section_id = v_section)
        )
        returning id into v_item;
        update public.change_order_cost_changes set applied_item_id = v_item where id = c.id;
        -- a job already being tracked starts tracking the new line too
        select exists (
          select 1 from public.materials_item_baselines b
          join public.materials_items mi on mi.id = b.materials_item_id
          join public.materials_sections ms on ms.id = mi.section_id
          where ms.sheet_id = (select sheet_id from public.materials_sections where id = v_section)
        ) into v_has_base;
        if v_has_base and coalesce(nullif(c.line->>'cost_type', ''), 'material') = 'material' then
          insert into public.materials_item_baselines (materials_item_id, quantity, unit_cost, unit, reason)
          select id, quantity, unit_cost, unit, null from public.materials_items where id = v_item;
        end if;

      elsif c.kind = 'edit' and c.materials_item_id is not null then
        update public.materials_items mi set
          name          = coalesce(nullif(c.line->>'name', ''), mi.name),
          quantity      = coalesce((c.line->>'quantity')::numeric, mi.quantity),
          unit          = coalesce(c.line->>'unit', mi.unit),
          unit_cost     = coalesce((c.line->>'unit_cost')::numeric, mi.unit_cost),
          waste_percent = coalesce((c.line->>'waste_percent')::numeric, mi.waste_percent),
          vendor        = coalesce(c.line->>'vendor', mi.vendor)
        where mi.id = c.materials_item_id;
        -- a tracked line's estimate moves with the approved change
        if exists (select 1 from public.materials_item_baselines where materials_item_id = c.materials_item_id) then
          insert into public.materials_item_baselines (materials_item_id, quantity, unit_cost, unit, reason)
          select id, quantity, unit_cost, unit, v_label from public.materials_items where id = c.materials_item_id;
        end if;

      elsif c.kind = 'remove' and c.materials_item_id is not null then
        -- a line with deliveries or usage is zeroed, never deleted (keeps
        -- the actuals); otherwise it goes
        if exists (select 1 from public.materials_usage_logs where materials_item_id = c.materials_item_id)
           or exists (select 1 from public.material_order_items where materials_item_id = c.materials_item_id) then
          update public.materials_items
             set quantity = 0, name = name || ' (removed — ' || v_label || ')'
           where id = c.materials_item_id;
        else
          delete from public.materials_items where id = c.materials_item_id;
        end if;

      elsif c.kind = 'labor' and v_section is not null then
        update public.materials_sections s set
          labor_mode          = nullif(c.line->>'labor_mode', ''),
          labor_crew_size     = (c.line->>'labor_crew_size')::numeric,
          labor_days          = (c.line->>'labor_days')::numeric,
          labor_hours_per_day = (c.line->>'labor_hours_per_day')::numeric,
          labor_rate          = (c.line->>'labor_rate')::numeric,
          labor_lump_sum      = (c.line->>'labor_lump_sum')::numeric
        where s.id = v_section;
      end if;
    end loop;

    v_price_after := public.feature_price(v_feature);
    insert into public.feature_history (feature_id, project_id, change_order_id, event, label, cost_before, cost_after, price_before, price_after, details)
    values (
      v_feature, v_co.project_id, p_change_order_id, 'change_order_approved', v_label,
      v_cost_before, public.feature_planned_cost(v_feature),
      v_price_after - v_price_this, v_price_after,
      jsonb_build_object(
        'title', v_co.title,
        'scope', (select string_agg(scope_note, '; ') from public.change_order_sections
                  where change_order_id = p_change_order_id and feature_id = v_feature and coalesce(scope_note, '') <> ''),
        'changes', coalesce((
          select jsonb_agg(jsonb_build_object('kind', kind, 'line', line, 'before', before) order by sort_order, created_at)
          from public.change_order_cost_changes where change_order_id = p_change_order_id and feature_id = v_feature
        ), '[]'::jsonb)
      )
    );
  end loop;
end;
$$;

create or replace function public.record_change_order_declined(p_change_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_co      record;
  v_feature uuid;
  v_cost    numeric;
  v_price   numeric;
begin
  select * into v_co from public.change_orders where id = p_change_order_id;
  if not found then return; end if;
  for v_feature in
    select feature_id from public.change_order_sections where change_order_id = p_change_order_id and feature_id is not null
    union
    select feature_id from public.change_order_cost_changes where change_order_id = p_change_order_id and feature_id is not null
  loop
    v_cost := public.feature_planned_cost(v_feature);
    v_price := public.feature_price(v_feature);
    insert into public.feature_history (feature_id, project_id, change_order_id, event, label, cost_before, cost_after, price_before, price_after, details)
    values (v_feature, v_co.project_id, p_change_order_id, 'change_order_declined',
            'CO #' || public.change_order_number(p_change_order_id), v_cost, v_cost, v_price, v_price,
            jsonb_build_object('title', v_co.title));
  end loop;
end;
$$;

create or replace function public.change_order_status_applies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.apply_change_order_to_features(new.id);
  elsif new.status = 'declined' and old.status is distinct from 'declined' then
    perform public.record_change_order_declined(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists change_orders_apply_to_features on public.change_orders;
create trigger change_orders_apply_to_features
  after update of status on public.change_orders
  for each row execute function public.change_order_status_applies();
