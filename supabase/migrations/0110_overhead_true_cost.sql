-- =============================================================================
-- 0110 — Overhead / true cost
--
-- Settings › Business › Overhead: yearly overhead by category + productive
-- capacity → an overhead burden per productive man-hour, applied through
-- planned labor (never typed into a quote). All the math lives in
-- src/lib/overhead.ts; this stores the inputs and the snapshots.
--
--   overhead_settings  one row per user: overhead rows, capacity helper (or
--                      a direct man-hours / crew-days figure), crew size (a
--                      crew-day = crew size × hours/day), display unit,
--                      target margin
--   quotes.overhead_rate / target_margin_pct
--                      the burden rate a quote was priced with — taken when
--                      it's created, refreshable only while it's a draft,
--                      frozen once sent, so later settings changes never
--                      rewrite a past quote
--   projects.overhead_rate / target_margin_pct
--                      copied from the signed quote when it's approved (any
--                      path — app, share link, Client Hub); actual fully
--                      loaded profit uses it
--   materials_sections: labor_mode 'hours' (man-hours × rate) and an optional
--                      labor_man_hours on a lump sum, so every labor block
--                      can carry overhead
--   materials_items.overhead_warning_dismissed
--                      "this looks like overhead" dismissed for that line
--
-- Internal only: nothing here is exposed by the shared-link / Client Hub
-- functions (they return explicit field lists).
-- =============================================================================

create table if not exists public.overhead_settings (
  user_id           uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  items             jsonb not null default '[]'::jsonb,
  field_workers     numeric,
  weeks_per_year    numeric,
  days_per_week     numeric,
  hours_per_day     numeric,
  utilization_pct   numeric,
  crew_size         numeric not null default 3,
  manual_man_hours  numeric,
  manual_crew_days  numeric,
  display_unit      text not null default 'hours' check (display_unit in ('hours', 'crew_days')),
  target_margin_pct numeric,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists overhead_settings_set_updated_at on public.overhead_settings;
create trigger overhead_settings_set_updated_at before update on public.overhead_settings
  for each row execute function public.set_updated_at();

alter table public.overhead_settings enable row level security;

drop policy if exists "own" on public.overhead_settings;
create policy "own" on public.overhead_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "employees excluded" on public.overhead_settings;
create policy "employees excluded" on public.overhead_settings
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

revoke all on public.overhead_settings from anon;

alter table public.quotes
  add column if not exists overhead_rate numeric,
  add column if not exists target_margin_pct numeric;

alter table public.projects
  add column if not exists overhead_rate numeric,
  add column if not exists target_margin_pct numeric;

alter table public.materials_sections drop constraint if exists materials_sections_labor_mode_check;
alter table public.materials_sections
  add constraint materials_sections_labor_mode_check check (labor_mode in ('crew', 'lump_sum', 'hours'));
alter table public.materials_sections
  add column if not exists labor_man_hours numeric;

alter table public.materials_items
  add column if not exists overhead_warning_dismissed boolean not null default false;

-- The signed quote's rate becomes the project's (an add-on only fills it in
-- when the project has none yet).
create or replace function public.quote_approved_overhead_to_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved'
     and new.project_id is not null and new.overhead_rate is not null then
    update public.projects p
       set overhead_rate = new.overhead_rate,
           target_margin_pct = coalesce(new.target_margin_pct, p.target_margin_pct)
     where p.id = new.project_id
       and (new.kind = 'original' or p.overhead_rate is null);
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_overhead_to_project on public.quotes;
create trigger quotes_overhead_to_project
  after update of status on public.quotes
  for each row execute function public.quote_approved_overhead_to_project();

-- A change order's labor change carries man-hours too (same function as
-- 0107 otherwise).
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
          labor_lump_sum      = (c.line->>'labor_lump_sum')::numeric,
          labor_man_hours     = (c.line->>'labor_man_hours')::numeric
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
