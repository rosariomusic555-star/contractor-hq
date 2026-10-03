-- 0164 — The SQL copy of the Cost plan total includes sales tax (0163).
--
-- cost_plan_sections_total() backs feature_planned_cost(), which records a
-- feature's cost before / after each approved quote and change order
-- (feature_history). Same math as src/lib/costPlanMath.ts sectionTotals():
-- a taxable line adds round(pre-tax cost × tax_rate %, 2).
--
-- Also counts the 'hours' labor mode (man-hours × rate, 0110), which the
-- app has always counted but this copy had missed.

create or replace function public.cost_plan_sections_total(p_section_ids uuid[])
returns numeric language sql stable as $$
  select coalesce((
    select sum(c.cost + case when c.taxable then round(c.cost * c.tax_rate / 100, 2) else 0 end)
    from (
      select case when coalesce(mi.cost_type, 'material') = 'material'
                  then mi.quantity * (1 + coalesce(mi.waste_percent, 0) / 100) * mi.unit_cost
                  else mi.quantity * mi.unit_cost end as cost,
             coalesce(mi.taxable, false) as taxable,
             coalesce(mi.tax_rate, 0) as tax_rate
      from public.materials_items mi where mi.section_id = any (p_section_ids)
    ) c
  ), 0) + coalesce((
    select sum(case s.labor_mode
                 when 'lump_sum' then coalesce(s.labor_lump_sum, 0)
                 when 'crew' then coalesce(s.labor_crew_size, 0) * coalesce(s.labor_days, 0)
                                  * coalesce(s.labor_hours_per_day, 0) * coalesce(s.labor_rate, 0)
                 when 'hours' then coalesce(s.labor_man_hours, 0) * coalesce(s.labor_rate, 0)
                 else 0 end)
    from public.materials_sections s where s.id = any (p_section_ids)
  ), 0)
$$;
