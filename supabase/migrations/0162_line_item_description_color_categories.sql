-- 0162 — Cost plan line items: description, template categories, color.
--
-- 1. materials_items.internal_description — an optional description on
--    every Cost plan line (specs, notes: "Running bond, 90° herringbone
--    border", "Pick up from yard Tuesday"). Internal: shown to the crew
--    (work order) and on the order sheet, never to clients (the column name
--    is on the client serializer's blocked list; no client_*_json reads
--    materials_items).
-- 2. material_categories.needs_color — whether lines in the category ask
--    for a color (hardscape: pavers, wall block, caps, steps/treads,
--    veneer, edgers/borders, coping). On for those names, off otherwise;
--    editable in Settings › Material categories.
-- 3. Seven new default material categories, so every Smart Section
--    template line has a category to come in with: Concrete & Masonry,
--    Lighting, Lumber & Hardware, Irrigation, Plants & Soil, Water Feature,
--    Stone & Gravel. Added to every contractor account (skipped where the
--    name exists) and to the new-account seed.
-- 4. crew_work_order_json — each material carries its description and a
--    missing-color flag (only when set — see below). Otherwise identical
--    to 0152.
--
-- Existing lines are not changed: descriptions start empty, colors and
-- categories stay as they are.

alter table public.materials_items add column if not exists internal_description text;

alter table public.material_categories add column if not exists needs_color boolean not null default false;

-- The colored hardscape categories (case-insensitive, singular or plural).
update public.material_categories
   set needs_color = true
 where name ~* '^\s*(pavers?|border pavers?|edge pavers?|wall ?blocks?|caps?|coping|steps?|treads?|steps? ?/ ?treads?|veneers?|stone veneers?|edgers?|borders?|edgers? ?/ ?borders?)\s*$';

-- New defaults for every contractor account (one that already has material
-- categories — crew / Client Hub logins have none since 0146).
insert into public.material_categories (user_id, name, sort_order)
select u.user_id, v.name, u.next_pos + v.pos
from (select user_id, max(sort_order) + 1 as next_pos from public.material_categories group by user_id) u
cross join (values
  ('Concrete & Masonry', 0), ('Lighting', 1), ('Lumber & Hardware', 2), ('Irrigation', 3),
  ('Plants & Soil', 4), ('Water Feature', 5), ('Stone & Gravel', 6)
) as v(name, pos)
on conflict (user_id, name) do nothing;

-- New accounts: the full list, colored ones flagged. (The trigger from
-- 0146 — skipping crew / Client Hub logins — is unchanged.)
create or replace function public.seed_default_material_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.material_categories (user_id, name, sort_order, needs_color) values
    (new.id, 'Pavers',             0,  true),
    (new.id, 'Wall Block',         1,  true),
    (new.id, 'Caps',               2,  true),
    (new.id, 'Base Gravel',        3,  false),
    (new.id, 'Bedding Sand',       4,  false),
    (new.id, 'Polymeric Sand',     5,  false),
    (new.id, 'Edging',             6,  false),
    (new.id, 'Adhesive',           7,  false),
    (new.id, 'Fabric',             8,  false),
    (new.id, 'Concrete & Masonry', 9,  false),
    (new.id, 'Lighting',           10, false),
    (new.id, 'Lumber & Hardware',  11, false),
    (new.id, 'Irrigation',         12, false),
    (new.id, 'Plants & Soil',      13, false),
    (new.id, 'Water Feature',      14, false),
    (new.id, 'Stone & Gravel',     15, false),
    (new.id, 'Other',              16, false)
  on conflict (user_id, name) do nothing;
  return new;
end $$;

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
                 select jsonb_agg(jsonb_build_object('quantity', oi.quantity, 'unit', oi.unit,
                                                     'status', coalesce(oi.status, mo.status), 'expected_date', mo.expected_delivery_date,
                                                     -- 0152: an open delivery issue on this line (short / damaged / wrong item / backordered)
                                                     'issue', case when oi.issue is not null and oi.issue_resolved_at is null then oi.issue end,
                                                     'issue_note', case when oi.issue is not null and oi.issue_resolved_at is null then oi.issue_note end,
                                                     'issue_expected_date', case when oi.issue is not null and oi.issue_resolved_at is null then oi.issue_expected_on end))
                   from public.material_order_items oi join public.material_orders mo on mo.id = oi.material_order_id
                  where oi.materials_item_id = mi.id), '[]'::jsonb)
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
               'delivered_on', mo.delivered_on,
               'open_issues', (select count(*) from public.material_order_items oi
                                where oi.material_order_id = mo.id and oi.issue is not null and oi.issue_resolved_at is null),
               'photos', coalesce((select jsonb_agg(jsonb_build_object('id', im.id, 'storage_path', im.storage_path, 'caption', im.caption) order by im.sort_order, im.created_at)
                                     from public.material_order_images im where im.material_order_id = mo.id), '[]'::jsonb))
             order by mo.expected_delivery_date nulls last)
        from public.material_orders mo where mo.project_id = p.id), '[]'::jsonb),
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


-- Check: the new columns, and the colored / new categories per account.
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials_items' and column_name = 'internal_description') as description_column,
  (select count(*) from public.material_categories where needs_color) as colored_categories,
  (select count(*) from public.material_categories where name in ('Concrete & Masonry', 'Lighting', 'Lumber & Hardware', 'Irrigation', 'Plants & Soil', 'Water Feature', 'Stone & Gravel')) as new_categories;
