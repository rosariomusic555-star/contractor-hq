-- ContractorHQ — A quote's selection costs land in the Cost plan once. Run AFTER 0147.
--
-- Found 2026-09-29 (same re-approval as 0147): editing an approved quote
-- returns it to draft; when it's signed again, quote_selections_on_status
-- ran again and added every upgrade's internal cost to the Cost plan a
-- second time ("Selection: Countertop — Quartz $800" twice), and a second
-- 'original' history row. Now a re-approval replaces them. Same function as
-- 0116 otherwise.

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
      -- 0148: approved again (edited after approval, re-signed) → the
      -- original record is updated, not added a second time.
      update public.quote_selection_history
         set option_ids = v_ids, option_names = v_names, price = v_price
       where group_id = g.id and source = 'original';
      if not found then
        insert into public.quote_selection_history (group_id, source, option_ids, option_names, price)
        values (g.id, 'original', v_ids, v_names, v_price);
      end if;
      -- …and its internal-cost lines from the previous approval are replaced.
      delete from public.materials_items mi
       using public.materials_sections ms
       where mi.section_id = ms.id and ms.feature_id = g.feature_id
         and mi.sort_order = 9000 and mi.name like 'Selection: ' || g.name || ' — %';

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

-- Cleanup: duplicates already there (same section, same selection line —
-- keep one).
delete from public.materials_items mi
 using public.materials_items keep
 where mi.section_id = keep.section_id and mi.name = keep.name
   and mi.sort_order = 9000 and keep.sort_order = 9000 and mi.name like 'Selection: %'
   and keep.id < mi.id;  -- identical rows (no created_at on this table) — keep either one

delete from public.quote_selection_history h
 using public.quote_selection_history keep
 where h.group_id = keep.group_id and h.source = 'original' and keep.source = 'original'
   and (keep.created_at, keep.id) < (h.created_at, h.id);
