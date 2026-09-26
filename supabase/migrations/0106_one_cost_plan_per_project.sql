-- =============================================================================
-- 0106 — One living Cost plan per project (Phase B)
--
-- A project has exactly one Cost plan (materials_sheets row). Features make
-- the quote <-> plan link automatic, so:
--   * projects with more than one plan are merged into one (below), with a
--     before/after total per project so nothing is lost
--   * materials_sheets gets a unique index on project_id
--   * a plan is no longer one-to-one with a quote: every quote on a project
--     points at the project's plan (quotes.material_sheet_id is kept, filled
--     automatically, because tracking baselines and the change order cost
--     panel key off it)
--   * the "link the solo sheet" triggers from 0087 are replaced by that
--     always-linked rule
--
-- Merge rule per project: keep the plan linked to the most recent approved
-- quote, else the oldest. Every other plan's sections move into it whole
-- (items, labor and feature_id intact). Its General section's lines move into
-- the kept General; its General labor moves too when the kept General has
-- none, otherwise that section is kept as a normal section named
-- "General (<old plan name>)" so no labor is lost. Quotes and change orders
-- that pointed at a merged plan point at the kept one.
-- =============================================================================

create temp table _plan_merge_report (
  project      text,
  kept_plan    uuid,
  merged_plans int,
  total_before numeric,
  total_after  numeric
);

-- Cost of a set of sections, same math as src/lib/costPlanMath.ts
-- (material lines keep waste %, other lines qty x rate, + labor block).
create or replace function public.cost_plan_sections_total(p_section_ids uuid[])
returns numeric language sql stable as $$
  select coalesce((
    select sum(case when coalesce(mi.cost_type, 'material') = 'material'
                    then mi.quantity * (1 + coalesce(mi.waste_percent, 0) / 100) * mi.unit_cost
                    else mi.quantity * mi.unit_cost end)
    from public.materials_items mi where mi.section_id = any (p_section_ids)
  ), 0) + coalesce((
    select sum(case s.labor_mode
                 when 'lump_sum' then coalesce(s.labor_lump_sum, 0)
                 when 'crew' then coalesce(s.labor_crew_size, 0) * coalesce(s.labor_days, 0)
                                  * coalesce(s.labor_hours_per_day, 0) * coalesce(s.labor_rate, 0)
                 else 0 end)
    from public.materials_sections s where s.id = any (p_section_ids)
  ), 0)
$$;

do $$
declare
  p          record;
  x          record;
  v_keep     uuid;
  v_keep_gen uuid;
  v_x_gen    record;
  v_before   numeric;
  v_offset   int;
  v_count    int;
begin
  for p in
    select pr.id, pr.name from public.projects pr
    where (select count(*) from public.materials_sheets s where s.project_id = pr.id) > 1
  loop
    v_before := public.cost_plan_sections_total(array(select id from public.materials_sections where project_id = p.id));

    select q.material_sheet_id into v_keep
    from public.quotes q
    where q.project_id = p.id and q.status = 'approved' and q.material_sheet_id is not null
    order by q.created_at desc limit 1;
    if v_keep is null then
      select id into v_keep from public.materials_sheets where project_id = p.id order by created_at, id limit 1;
    end if;

    select id into v_keep_gen from public.materials_sections where sheet_id = v_keep and is_general limit 1;
    v_count := 0;

    for x in select * from public.materials_sheets where project_id = p.id and id <> v_keep order by created_at loop
      v_count := v_count + 1;
      select coalesce(max(sort_order), -1) + 1 into v_offset from public.materials_sections where sheet_id = v_keep;

      -- General of the merged plan
      for v_x_gen in select * from public.materials_sections where sheet_id = x.id and is_general loop
        if v_keep_gen is null then
          update public.materials_sections set sheet_id = v_keep where id = v_x_gen.id;
          v_keep_gen := v_x_gen.id;
        else
          update public.materials_items set section_id = v_keep_gen where section_id = v_x_gen.id;
          if v_x_gen.labor_mode is not null then
            if (select labor_mode from public.materials_sections where id = v_keep_gen) is null then
              update public.materials_sections k set
                labor_mode = v_x_gen.labor_mode, labor_crew_size = v_x_gen.labor_crew_size,
                labor_days = v_x_gen.labor_days, labor_hours_per_day = v_x_gen.labor_hours_per_day,
                labor_rate = v_x_gen.labor_rate, labor_lump_sum = v_x_gen.labor_lump_sum,
                labor_notes = v_x_gen.labor_notes
              where k.id = v_keep_gen;
              delete from public.materials_sections where id = v_x_gen.id;
            else
              update public.materials_sections
                 set sheet_id = v_keep, is_general = false, sort_order = v_offset,
                     name = 'General (' || x.name || ')'
               where id = v_x_gen.id;
              v_offset := v_offset + 1;
            end if;
          else
            delete from public.materials_sections where id = v_x_gen.id;
          end if;
        end if;
      end loop;

      -- every other section moves whole
      update public.materials_sections
         set sheet_id = v_keep, sort_order = v_offset + sort_order
       where sheet_id = x.id;

      update public.quotes set material_sheet_id = null where material_sheet_id = x.id;
      update public.change_orders set material_sheet_id = null where material_sheet_id = x.id;
      delete from public.materials_sheets where id = x.id;
    end loop;

    -- the kept General stays last
    update public.materials_sections
       set sort_order = (select coalesce(max(sort_order), 0) + 1 from public.materials_sections where sheet_id = v_keep)
     where id = v_keep_gen;

    insert into _plan_merge_report values (
      p.name, v_keep, v_count, v_before,
      public.cost_plan_sections_total(array(select id from public.materials_sections where project_id = p.id))
    );
  end loop;
end $$;

create unique index if not exists materials_sheets_project_id_key on public.materials_sheets (project_id);

-- ---------------------------------------------------------------------------
-- Every quote on a project uses the project's plan.
-- ---------------------------------------------------------------------------

drop index if exists public.quotes_material_sheet_id_key;

drop trigger if exists quote_approved_link_materials_sheet on public.quotes;
drop trigger if exists materials_item_added_link_sheet on public.materials_items;

create or replace function public.quote_use_project_plan()
returns trigger language plpgsql as $$
begin
  if new.project_id is null then
    new.material_sheet_id := null;
  elsif new.material_sheet_id is null or tg_op = 'INSERT' or old.project_id is distinct from new.project_id then
    new.material_sheet_id := (select id from public.materials_sheets where project_id = new.project_id limit 1);
  end if;
  return new;
end;
$$;

drop trigger if exists quote_use_project_plan on public.quotes;
create trigger quote_use_project_plan
  before insert or update of project_id, material_sheet_id on public.quotes
  for each row execute function public.quote_use_project_plan();

create or replace function public.plan_link_project_quotes()
returns trigger language plpgsql as $$
begin
  update public.quotes set material_sheet_id = new.id where project_id = new.project_id and material_sheet_id is null;
  return null;
end;
$$;

drop trigger if exists materials_sheet_link_project_quotes on public.materials_sheets;
create trigger materials_sheet_link_project_quotes
  after insert on public.materials_sheets
  for each row execute function public.plan_link_project_quotes();

-- Baselines on link only for an approved quote (Won already snapshots via
-- 0080's project trigger); linking a draft quote must not freeze estimates.
create or replace function public.snapshot_baselines_on_quote_sheet_linked()
returns trigger language plpgsql as $$
begin
  if new.material_sheet_id is not null and new.status = 'approved'
     and (old.material_sheet_id is distinct from new.material_sheet_id or old.status is distinct from 'approved') then
    perform public.snapshot_sheet_baselines(new.material_sheet_id);
  end if;
  return new;
end;
$$;

-- Backfill the link for every project quote.
update public.quotes q
   set material_sheet_id = s.id
  from public.materials_sheets s
 where s.project_id = q.project_id and q.material_sheet_id is distinct from s.id;

-- Per-project merge report (empty = no project had more than one plan).
select * from _plan_merge_report order by project;
