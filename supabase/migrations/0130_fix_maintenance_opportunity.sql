-- ContractorHQ — fix for 0127: maintenance opportunities. Run AFTER 0129.
--
-- _maintenance_opportunity() inserted opportunities.user_id, which doesn't
-- exist (opportunities are owned through their client, 0049), so "Create
-- opportunity" on a maintenance reminder and the client's "Request service"
-- in the Client Hub both failed with 42703. Same function, minus that column.

create or replace function public._maintenance_opportunity(p_project_id uuid, p_item_ids uuid[], p_from_client boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare p record; v_opp uuid; v_items text; v_src text := 'Maintenance / Past client';
begin
  select pr.*, c.name as client_name into p from public.projects pr join public.clients c on c.id = pr.client_id where pr.id = p_project_id;
  if not found then raise exception 'Project not found.'; end if;
  select string_agg(i.label, ', ' order by i.label) into v_items
    from public.project_maintenance_items i where i.project_id = p_project_id and (p_item_ids is null or i.id = any(p_item_ids)) and i.status = 'active';
  insert into public.lead_sources (user_id, name, sort_order) values (p.user_id, v_src, 900) on conflict (user_id, name) do nothing;
  insert into public.opportunities (client_id, title, address, description, lead_source, source_project_id)
  values (p.client_id,
          'Maintenance: ' || coalesce(v_items, 'service') || ' — ' || p.name,
          p.address,
          case when p_from_client then 'Requested by the client from the Client Hub. ' else '' end
            || 'Maintenance for the original job “' || p.name || '”' || coalesce(' (completed ' || to_char(p.completed_at, 'FMMon YYYY') || ')', '') || '. Items: ' || coalesce(v_items, '—') || '.',
          v_src, p.id)
  returning id into v_opp;
  insert into public.opportunity_categories (opportunity_id, category_id)
  select distinct v_opp, f.category_id from public.project_features f
   where f.project_id = p_project_id and f.status = 'active' and f.category_id is not null
     and (p_item_ids is null or f.id in (select i.feature_id from public.project_maintenance_items i where i.id = any(p_item_ids)))
  on conflict do nothing;
  update public.project_maintenance_items set opportunity_id = v_opp
   where project_id = p_project_id and status = 'active' and (p_item_ids is null or id = any(p_item_ids));
  insert into public.maintenance_events (user_id, item_id, kind, note)
  select p.user_id, i.id, case when p_from_client then 'client_request' else 'opportunity' end, v_opp::text
    from public.project_maintenance_items i where i.opportunity_id = v_opp;
  return v_opp;
end;
$$;
