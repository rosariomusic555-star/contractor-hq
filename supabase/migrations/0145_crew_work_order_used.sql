-- ContractorHQ — Crew work order shows material already used. Run AFTER 0144.
--
-- The crew's work order listed each material's planned quantity and order
-- status but not what had been logged as used, so a second crew member
-- could log the same usage again (found in the audit, 2026-09-28).
-- Same function as 0125 with one added field per material: `used`
-- (sum of materials_usage_logs, in the line's unit). The "changed since you
-- last opened" version only hashes named fields, so new usage doesn't mark
-- the work order as changed.

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
                                                     'status', coalesce(oi.status, mo.status), 'expected_date', mo.expected_delivery_date))
                   from public.material_order_items oi join public.material_orders mo on mo.id = oi.material_order_id
                  where oi.materials_item_id = mi.id), '[]'::jsonb)
             ) order by ms.sort_order, mi.sort_order)
        from public.materials_items mi
        join public.materials_sections ms on ms.id = mi.section_id
        left join public.project_features f on f.id = ms.feature_id
        left join public.product_catalog pc on pc.id = mi.catalog_product_id
       where ms.project_id = p.id and coalesce(mi.cost_type, 'material') = 'material'
         and (ms.feature_id is null or f.status = 'active')), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object('id', mo.id, 'supplier', mo.supplier, 'expected_date', mo.expected_delivery_date, 'status', mo.status)
                       order by mo.expected_delivery_date nulls last)
        from public.material_orders mo where mo.project_id = p.id and mo.status <> 'delivered'), '[]'::jsonb),
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
