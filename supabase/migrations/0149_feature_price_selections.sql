-- ContractorHQ — A feature's price includes its client selections. Run AFTER 0148.
--
-- feature_price (0107) predates Client Selections (0115): it summed a
-- feature's approved quote lines + approved change order lines, but not the
-- selection prices on those quote sections — while the app's featurePrice
-- (featureFinancials.ts, via quoteTotal) and quote_committed_total count
-- them. So the feature history a change order / add-on writes recorded a
-- price missing the client's upgrades (found 2026-09-29: an Outdoor Kitchen
-- with a +$1,250 Quartz countertop logged $14,320 → $13,600 instead of
-- $15,570 → $14,850). Deltas were right; the absolute prices weren't.
--
-- Selection prices are frozen at approval (approved_price) and a later swap
-- is priced by its own change order, so nothing is counted twice.

create or replace function public.feature_price(p_feature_id uuid)
returns numeric language sql stable as $$
  select coalesce((
    select sum(case when (not s.is_optional and not i.is_optional) or i.client_selected then i.price * i.quantity else 0 end)
    from public.quote_sections s
    join public.quote_items i on i.section_id = s.id
    join public.quotes q on q.id = s.quote_id
    where s.feature_id = p_feature_id and q.status = 'approved'
  ), 0) + coalesce((
    select sum(public.selection_group_price(g.id))
    from public.quote_sections s
    join public.quote_selection_groups g on g.quote_section_id = s.id
    join public.quotes q on q.id = s.quote_id
    where s.feature_id = p_feature_id and q.status = 'approved' and public.quote_section_included(s.id)
  ), 0) + coalesce((
    select sum(i.price * coalesce(i.quantity, 1))
    from public.change_order_sections s
    join public.change_order_items i on i.section_id = s.id
    join public.change_orders co on co.id = s.change_order_id
    where s.feature_id = p_feature_id and co.status = 'approved'
  ), 0)
$$;

-- Backfill the history already written: add each feature's (frozen) approved
-- selection prices to the prices its change order / add-on events recorded.
-- An add-on's price_before is 0 by design (the feature didn't exist yet).
do $$
declare n int;
begin
  with sel as (
    select s.feature_id, sum(g.approved_price) as amount
      from public.quote_sections s
      join public.quote_selection_groups g on g.quote_section_id = s.id
      join public.quotes q on q.id = s.quote_id
     where q.status = 'approved' and g.approved_price is not null and s.feature_id is not null
     group by s.feature_id
    having sum(g.approved_price) <> 0
  )
  update public.feature_history h
     set price_before = h.price_before + case when h.event in ('change_order_approved', 'change_order_declined') then sel.amount else 0 end,
         price_after  = h.price_after + sel.amount
    from sel
   where h.feature_id = sel.feature_id
     and h.event in ('change_order_approved', 'change_order_declined', 'addon_approved');
  get diagnostics n = row_count;
  raise notice '0149: corrected % feature history row(s)', n;
end $$;
