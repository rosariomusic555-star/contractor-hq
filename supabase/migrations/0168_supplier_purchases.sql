-- 0168 — Supplier purchases (the materials workflow as hardscape jobs work).
--
-- A material order becomes a supplier PURCHASE: one supplier quote/order for
-- the job — supplier, quote/invoice # (po_number), lines + quantities
-- (partial allowed), amount paid, payment status (Quote requested → Paid),
-- an attachment (the supplier quote / invoice), and how it gets to site:
-- Delivery (expected date, "Delivered" + date + drop-off photo) or Pickup
-- ("Picked up" + date + who). Few per job.
--
-- Paid → the app records the cost as an expense (expense_id) — the expense
-- is the material cost from now on; delivered cost no longer counts
-- separately (app side). Returns of returnable categories record a credit
-- (a negative expense) in material_returns.
--
-- Existing orders are kept in place: paid (they were placed), Delivery,
-- 'delayed' → 'ordered', amount from priced lines when every line has a
-- price. They are NOT given expenses (a bill may already be logged by hand
-- — the app offers Link / Create expense). Delivery-issue data is kept but
-- no longer shown.

-- 1 --------------------------------------------------------------------------
alter table public.material_orders
  add column if not exists payment_status text not null default 'paid',
  add column if not exists amount_paid numeric(12,2),
  add column if not exists paid_on date,
  add column if not exists expense_id uuid references public.expenses (id) on delete set null,
  add column if not exists fulfillment text not null default 'delivery',
  add column if not exists picked_up_by text,
  add column if not exists attachment_path text;

alter table public.material_orders drop constraint if exists material_orders_payment_status_check;
alter table public.material_orders add constraint material_orders_payment_status_check check (payment_status in ('quote_requested', 'paid'));
alter table public.material_orders drop constraint if exists material_orders_fulfillment_check;
alter table public.material_orders add constraint material_orders_fulfillment_check check (fulfillment in ('delivery', 'pickup'));

-- 2 --------------------------------------------------------------------------
alter table public.material_categories add column if not exists returnable boolean;

create or replace function public.suggest_category_returnable(p_name text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_name, ''))) ~ '\y(pavers?|wall ?blocks?|caps?|coping|edging|edge restraints?|steps?|treads?|veneers?|slabs?)\y'
$$;

create or replace function public.material_category_fill_returnable()
returns trigger
language plpgsql
as $$
begin
  if new.returnable is null then
    new.returnable := public.suggest_category_returnable(new.name);
  end if;
  return new;
end $$;

drop trigger if exists material_category_fill_returnable on public.material_categories;
create trigger material_category_fill_returnable
  before insert on public.material_categories
  for each row execute function public.material_category_fill_returnable();

update public.material_categories set returnable = public.suggest_category_returnable(name) where returnable is null;
alter table public.material_categories alter column returnable set not null;

-- 3 --------------------------------------------------------------------------
create table if not exists public.material_returns (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_order_id uuid not null references public.material_orders (id) on delete cascade,
  materials_item_id uuid references public.materials_items (id) on delete set null,
  description       text not null default '',
  quantity          numeric not null check (quantity > 0),
  unit              text,
  credit            numeric(12,2) not null default 0,
  returned_on       date not null default current_date,
  expense_id        uuid references public.expenses (id) on delete set null,
  note              text,
  created_at        timestamptz not null default now()
);
create index if not exists material_returns_order_idx on public.material_returns (material_order_id);
create index if not exists material_returns_item_idx on public.material_returns (materials_item_id);
alter table public.material_returns enable row level security;
drop policy if exists "own" on public.material_returns;
create policy "own" on public.material_returns for all to authenticated
  using (user_id = auth.uid() and not public.is_employee())
  with check (user_id = auth.uid() and not public.is_employee());
revoke all on public.material_returns from anon;

-- 4 Existing orders -----------------------------------------------------------
update public.material_orders set status = 'ordered' where status = 'delayed';
update public.material_orders mo
   set paid_on = coalesce(mo.paid_on, mo.ordered_on, mo.created_at::date),
       amount_paid = coalesce(mo.amount_paid, (
         select case when count(*) > 0 and count(*) = count(oi.unit_price) then round(sum(oi.quantity * oi.unit_price), 2) end
           from public.material_order_items oi where oi.material_order_id = mo.id));

-- Open delivery issues → the purchase's note (the issue workflow is gone).
update public.material_orders mo
   set notes = trim(both from concat_ws(E'\n', nullif(mo.notes, ''), x.txt))
  from (
    select oi.material_order_id,
           string_agg(concat(initcap(replace(oi.issue, '_', ' ')), ': ', oi.description,
                             case when oi.issue_note is not null then concat(' — ', oi.issue_note) else '' end,
                             case when oi.issue_expected_on is not null then concat(' (expected ', oi.issue_expected_on, ')') else '' end), E'\n') as txt
      from public.material_order_items oi
     where oi.issue is not null and oi.issue_resolved_at is null
     group by oi.material_order_id
  ) x
 where x.material_order_id = mo.id
   and position(x.txt in coalesce(mo.notes, '')) = 0;

-- 5 Crew work order: paid purchases only; delivery vs pickup ------------------
create or replace function public.crew_work_order_json(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p record;
  st record;
  v_scope jsonb;
  v_general jsonb;
begin
  select pr.id, pr.user_id, pr.name, pr.status, pr.address, pr.scheduled_start_date, pr.scheduled_end_date,
         pr.actual_start_date, pr.job_slope, pr.job_access, pr.job_soil, pr.job_demo, pr.crew_notes,
         pr.crew_client_notes, pr.crew_note_photos, pr.crew_hide_client_phone, pr.updated_at,
         c.name as client_name, c.phone as client_phone, cr.name as crew_name,
         (select o.site_conditions from public.opportunities o where o.project_id = pr.id order by o.created_at limit 1) as site_conditions
    into p
    from public.projects pr
    left join public.clients c on c.id = pr.client_id
    left join public.crews cr on cr.id = pr.crew_id
   where pr.id = p_project_id;
  if not found then return null; end if;
  select locate_wait_days, locate_valid_days into st from public.precon_settings where user_id = p.user_id;

  -- Scope by feature (what the crew builds).
  v_scope := coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'label', coalesce(nullif(f.label, ''), cat.name, 'Feature'),
      'category', cat.name,
      'measurements', coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'build_type', m.build_type, 'label', m.label, 'data', m.data, 'totals', m.totals) order by m.sort_order)
          from public.project_feature_measurements m where m.feature_id = f.id), '[]'::jsonb),
      'selections', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'group', g.name,
                 'choices', coalesce((select jsonb_agg(o.name order by o.sort_order)
                                        from public.quote_selection_picks pk join public.quote_selection_options o on o.id = pk.option_id
                                       where pk.group_id = g.id), '[]'::jsonb)) order by qs.sort_order, g.sort_order)
          from public.quote_selection_groups g
          join public.quote_sections qs on qs.id = g.quote_section_id
          join public.quotes q on q.id = qs.quote_id
         where qs.feature_id = f.id and q.project_id = p.id and q.status = 'approved' and public.quote_section_included(qs.id)), '[]'::jsonb),
      'scope', coalesce((
        select jsonb_agg(jsonb_build_object('name', qi.name, 'description', qi.description, 'quantity', qi.quantity, 'unit', qi.unit) order by qs.sort_order, qi.sort_order)
          from public.quote_sections qs
          join public.quotes q on q.id = qs.quote_id
          join public.quote_items qi on qi.section_id = qs.id
         where qs.feature_id = f.id and q.project_id = p.id and q.status = 'approved'
           and public.quote_section_included(qs.id)
           and (not coalesce(qi.is_optional, false) or qi.client_selected)), '[]'::jsonb),
      'labor', (
        select jsonb_build_object('crew_days', sum(ms.labor_days), 'crew_size', max(ms.labor_crew_size), 'man_hours', sum(ms.labor_man_hours))
          from public.materials_sections ms where ms.feature_id = f.id and ms.project_id = p.id),
      'changes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'number', public.change_order_number(co.id), 'title', co.title, 'approved_at', co.approved_at, 'scope_note', cs.scope_note,
                 'items', coalesce((select jsonb_agg(jsonb_build_object('name', ci.name, 'description', ci.description, 'quantity', ci.quantity, 'unit', ci.unit) order by ci.sort_order)
                                      from public.change_order_items ci where ci.section_id = cs.id), '[]'::jsonb)) order by co.created_at)
          from public.change_order_sections cs
          join public.change_orders co on co.id = cs.change_order_id
         where cs.feature_id = f.id and co.status = 'approved'), '[]'::jsonb)
    ) order by f.sort_order, f.created_at)
      from public.project_features f
      left join public.categories cat on cat.id = f.category_id
     where f.project_id = p.id and f.status = 'active'), '[]'::jsonb);

  -- Approved quote scope not tied to a feature (older quotes).
  v_general := coalesce((
    select jsonb_agg(jsonb_build_object('name', qi.name, 'description', qi.description, 'quantity', qi.quantity, 'unit', qi.unit) order by qs.sort_order, qi.sort_order)
      from public.quote_sections qs
      join public.quotes q on q.id = qs.quote_id
      join public.quote_items qi on qi.section_id = qs.id
     where qs.feature_id is null and q.project_id = p.id and q.status = 'approved'
       and public.quote_section_included(qs.id)
       and (not coalesce(qi.is_optional, false) or qi.client_selected)), '[]'::jsonb);

  return jsonb_build_object(
    'project', jsonb_build_object(
      'id', p.id, 'name', p.name, 'status', p.status, 'address', p.address,
      'scheduled_start_date', p.scheduled_start_date, 'scheduled_end_date', p.scheduled_end_date,
      'actual_start_date', p.actual_start_date, 'crew_name', p.crew_name),
    'site', jsonb_build_object(
      'conditions', p.site_conditions, 'slope', p.job_slope, 'access', p.job_access, 'soil', p.job_soil, 'demo', p.job_demo),
    'permits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', pi.kind, 'label', pi.label, 'status', pi.status,
               'ticket', pi.details->>'ticket', 'submitted', pi.details->>'submitted',
               'permit_status', pi.details->>'status', 'number', pi.details->>'number', 'date', pi.details->>'date') order by pi.sort_order)
        from public.project_precon_items pi
       where pi.project_id = p.id and not pi.removed and pi.kind in ('locate', 'permit', 'hoa') and pi.status <> 'na'), '[]'::jsonb),
    'locate_rules', jsonb_build_object('wait_days', coalesce(st.locate_wait_days, 3), 'valid_days', coalesce(st.locate_valid_days, 15)),
    'client', jsonb_build_object(
      'name', p.client_name,
      'phone', case when p.crew_hide_client_phone then null else p.client_phone end,
      'notes_for_crew', p.crew_client_notes),
    'crew_notes', jsonb_build_object('text', p.crew_notes, 'photos', coalesce(p.crew_note_photos, '[]'::jsonb)),
    'features', v_scope,
    'general_scope', v_general,
    'materials', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', mi.id, 'feature_id', ms.feature_id, 'section', ms.name, 'name', mi.name, 'color', mi.color,
               'product', pc.name, 'quantity', mi.quantity, 'unit', mi.unit, 'waste_percent', mi.waste_percent,
               'planned_quantity', coalesce((select b.quantity from public.materials_item_baselines b
                                              where b.materials_item_id = mi.id and b.reason is not null
                                              order by b.created_at desc limit 1), mi.quantity),
               'conversion_factor', mi.conversion_factor, 'conversion_unit', mi.conversion_unit, 'tracked', mi.tracked,
               -- 0145: logged usage so far, in the line's unit — so a second crew
               -- member sees what's already been logged.
               'used', coalesce((select sum(ul.quantity) from public.materials_usage_logs ul where ul.materials_item_id = mi.id), 0),
               'orders', coalesce((
                 -- 0168: paid supplier purchases only, with how it gets to site
                 -- (delivery date, or which supplier to pick it up from).
                 select jsonb_agg(jsonb_build_object('quantity', oi.quantity, 'unit', oi.unit,
                                                     'status', coalesce(oi.status, mo.status), 'expected_date', mo.expected_delivery_date,
                                                     'fulfillment', coalesce(mo.fulfillment, 'delivery'), 'supplier', mo.supplier))
                   from public.material_order_items oi join public.material_orders mo on mo.id = oi.material_order_id
                  where oi.materials_item_id = mi.id and coalesce(mo.payment_status, 'paid') = 'paid'), '[]'::jsonb)
             )
             -- 0162: the line's description (specs / notes, never a price) and
             -- a missing-color flag for a colored category — each key only
             -- when it has something, so existing work orders' version hash
             -- (and the crew's "changed" flag) only moves where there's news.
             || case when nullif(trim(mi.internal_description), '') is not null
                     then jsonb_build_object('description', left(mi.internal_description, 1000)) else '{}'::jsonb end
             || case when coalesce(mc.needs_color, false) and nullif(trim(mi.color), '') is null
                     then jsonb_build_object('missing_color', true) else '{}'::jsonb end
             order by ms.sort_order, mi.sort_order)
        from public.materials_items mi
        join public.materials_sections ms on ms.id = mi.section_id
        left join public.project_features f on f.id = ms.feature_id
        left join public.product_catalog pc on pc.id = mi.catalog_product_id
        left join public.material_categories mc on mc.id = mi.material_category_id
       where ms.project_id = p.id and coalesce(mi.cost_type, 'material') = 'material'
         and (ms.feature_id is null or f.status = 'active')), '[]'::jsonb),
    -- 0152: every delivery (not just pending), with when it arrived, its open
    -- issues and its photos (where the pallets were dropped) — never a price.
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', mo.id, 'supplier', mo.supplier, 'expected_date', mo.expected_delivery_date, 'status', mo.status,
               'delivered_on', mo.delivered_on, 'fulfillment', coalesce(mo.fulfillment, 'delivery'), 'note', mo.notes,
               'items', coalesce((select jsonb_agg(oi.description order by oi.sort_order) from public.material_order_items oi
                                   where oi.material_order_id = mo.id), '[]'::jsonb),
               'photos', coalesce((select jsonb_agg(jsonb_build_object('id', im.id, 'storage_path', im.storage_path, 'caption', im.caption) order by im.sort_order, im.created_at)
                                     from public.material_order_images im where im.material_order_id = mo.id), '[]'::jsonb))
             order by mo.expected_delivery_date nulls last)
        from public.material_orders mo where mo.project_id = p.id and coalesce(mo.payment_status, 'paid') = 'paid'), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', pi.id, 'storage_path', pi.storage_path, 'caption', pi.caption) order by pi.sort_order, pi.created_at)
        from public.project_images pi where pi.project_id = p.id), '[]'::jsonb),
    'delays', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.delay_date, 'days', d.days, 'reason', d.reason) order by d.created_at desc)
        from public.schedule_delays d
       where d.undone_at is null and (d.project_id = p.id or d.changes @> jsonb_build_array(jsonb_build_object('project_id', p.id)))), '[]'::jsonb),
    'updated_at', greatest(
      p.updated_at,
      (select max(updated_at) from public.project_feature_measurements where project_id = p.id),
      (select max(co.approved_at) from public.change_orders co where co.project_id = p.id),
      (select max(updated_at) from public.material_orders where project_id = p.id),
      (select max(updated_at) from public.project_precon_items where project_id = p.id))
  );
end;
$$;

-- Report: what the migration did with existing orders.
select 'orders migrated to purchases (paid, delivery)' as item, count(*)::text as value from public.material_orders
union all select 'with an amount (every line priced)', count(*)::text from public.material_orders where amount_paid is not null
union all select 'without an amount (add it when you mark them)', count(*)::text from public.material_orders where amount_paid is null
union all select 'on site already (delivered)', count(*)::text from public.material_orders where status = 'delivered'
union all select 'open delivery issues (kept, no longer shown — see order notes)', count(*)::text from public.material_order_items where issue is not null and issue_resolved_at is null
union all select 'with pallet deposits', count(*)::text from public.material_orders where coalesce(pallets_delivered, 0) > 0
union all select 'returnable categories', count(*)::text from public.material_categories where returnable;
