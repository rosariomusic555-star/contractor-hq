-- ContractorHQ — Client Selections follow-up. Run AFTER 0115.
--
-- FIX: 0115's approval trigger used the table alias "o" while also
-- declaring a record variable "o", so approving any quote with selections
-- failed with 'record "o" is not assigned yet'. Re-issued below with the
-- alias renamed ("op").
--
-- An approved selection change order now also sets the linked Cost plan
-- line to the new option's Catalog product / color (and name / unit cost
-- when the option specifies them), so the order sheet prints what the
-- client actually chose. The change order's own planned-cost change still
-- carries the price / cost math; this only adds product and color, which a
-- planned-cost change doesn't hold.

create or replace function public.change_order_selection_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record; o record;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform set_config('app.selection_unlock', 'on', true);
    for c in select * from public.change_order_selection_changes where change_order_id = new.id and applied_at is null loop
      delete from public.quote_selection_picks where group_id = c.group_id;
      insert into public.quote_selection_picks (group_id, option_id, picked_by)
      select c.group_id, x, 'change_order' from unnest(c.to_option_ids) x
      where exists (select 1 from public.quote_selection_options op where op.id = x);
      insert into public.quote_selection_history (group_id, source, change_order_id, option_ids, option_names, price)
      select c.group_id, 'change_order', new.id, c.to_option_ids,
             coalesce((select array_agg(op.name order by op.sort_order) from public.quote_selection_options op where op.id = any (c.to_option_ids)), '{}'),
             coalesce((select sum(op.price_delta) from public.quote_selection_options op where op.id = any (c.to_option_ids)), 0);
      for o in select * from public.quote_selection_options op where op.id = any (c.to_option_ids) and op.link_item_id is not null loop
        update public.materials_items mi
           set catalog_product_id = coalesce(nullif(o.link_set ->> 'catalog_product_id', '')::uuid, o.catalog_product_id, mi.catalog_product_id),
               color = coalesce(nullif(o.link_set ->> 'color', ''), o.color, mi.color),
               unit_cost = coalesce((o.link_set ->> 'unit_cost')::numeric, mi.unit_cost),
               name = coalesce(nullif(o.link_set ->> 'name', ''), mi.name)
         where mi.id = o.link_item_id;
      end loop;
      update public.change_order_selection_changes set applied_at = now() where id = c.id;
    end loop;
    perform set_config('app.selection_unlock', '', true);
    update public.selection_change_requests set status = 'completed' where change_order_id = new.id;
  elsif new.status = 'declined' and old.status is distinct from 'declined' then
    update public.selection_change_requests set status = 'declined' where change_order_id = new.id;
  end if;
  return null;
end;
$$;

-- Same fallback on the original approval: an option picked from the
-- Catalog carries its product / color even if the link didn't restate them.
create or replace function public.quote_selections_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare g record; o record; v_section uuid; v_ids uuid[]; v_names text[]; v_price numeric; v_included boolean;
begin
  perform set_config('app.selection_unlock', 'on', true);

  if new.status = 'approved' and old.status is distinct from 'approved' then
    for g in
      select sg.*, s.feature_id, s.id as section_id, s.quote_id
      from public.quote_selection_groups sg
      join public.quote_sections s on s.id = sg.quote_section_id
      where s.quote_id = new.id
    loop
      v_included := public.quote_section_included(g.section_id);
      select coalesce(array_agg(op.id order by op.sort_order), '{}'), coalesce(array_agg(op.name order by op.sort_order), '{}'), coalesce(sum(op.price_delta), 0)
        into v_ids, v_names, v_price
        from public.quote_selection_picks p join public.quote_selection_options op on op.id = p.option_id
       where p.group_id = g.id;
      update public.quote_selection_groups
         set approved_price = case when v_included then v_price else 0 end, approved_at = now()
       where id = g.id;
      if not v_included then continue; end if;
      insert into public.quote_selection_history (group_id, source, option_ids, option_names, price)
      values (g.id, 'original', v_ids, v_names, v_price);

      for o in select op.* from public.quote_selection_picks p join public.quote_selection_options op on op.id = p.option_id where p.group_id = g.id loop
        if o.link_item_id is not null then
          update public.materials_items mi
             set catalog_product_id = coalesce(nullif(o.link_set ->> 'catalog_product_id', '')::uuid, o.catalog_product_id, mi.catalog_product_id),
                 color = coalesce(nullif(o.link_set ->> 'color', ''), o.color, mi.color),
                 unit_cost = coalesce((o.link_set ->> 'unit_cost')::numeric, mi.unit_cost),
                 name = coalesce(nullif(o.link_set ->> 'name', ''), mi.name)
           where mi.id = o.link_item_id;
        elsif o.cost_delta <> 0 and g.feature_id is not null then
          v_section := null;
          select ms.id into v_section from public.materials_sections ms
           where ms.feature_id = g.feature_id and not coalesce(ms.is_general, false)
           order by ms.sort_order limit 1;
          if v_section is not null then
            insert into public.materials_items (section_id, name, quantity, unit, unit_cost, sort_order, cost_type, tracked)
            values (v_section, 'Selection: ' || g.name || ' — ' || o.name, 1, 'lump sum', o.cost_delta, 9000, 'other', false);
          end if;
        end if;
      end loop;
    end loop;
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    update public.quote_selection_groups sg set approved_price = null, approved_at = null
      from public.quote_sections s where s.id = sg.quote_section_id and s.quote_id = new.id;
  end if;

  perform set_config('app.selection_unlock', '', true);
  return null;
end;
$$;

select 'selection change orders update the Cost plan product / color' as result;
