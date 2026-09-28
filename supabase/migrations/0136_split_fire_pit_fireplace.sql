-- ContractorHQ — Fire Pit and Fireplace are separate project types. Run AFTER 0135.
--
-- They were one Job Category, "Fire Pit / Fireplace", mapped to the fire_pit
-- build type. Now:
--   · every contractor's "Fire Pit / Fireplace" is renamed "Fire Pit" (same
--     row, same id — every feature, measurement, section and quote line on it
--     stays exactly as it was, now under Fire Pit). Skipped if they already
--     have a separate "Fire Pit" category.
--   · a new "Fireplace" category is added right after it (if missing).
--   · Cost plan / quote section names that start "Fire Pit / Fireplace" follow
--     the rename (not approved quotes — locked, 0033).
--   · new accounts start with both (seed_default_categories), and the
--     maintenance starting suggestions gain a Fireplace item.
-- The app side: build type "fireplace" with its own Measurements card, Smart
-- Section template, Quick Quote default and milestones.

-- 1. Rename the combined category.
update public.categories c
   set name = 'Fire Pit'
 where lower(trim(c.name)) = 'fire pit / fireplace'
   and not exists (select 1 from public.categories o where o.user_id = c.user_id and lower(trim(o.name)) = 'fire pit');

-- 2. Fireplace right after Fire Pit (later ones shift down one).
do $$
declare r record;
begin
  for r in
    select c.user_id, c.sort_order
      from public.categories c
     where lower(trim(c.name)) = 'fire pit'
       and not exists (select 1 from public.categories o where o.user_id = c.user_id and lower(trim(o.name)) = 'fireplace')
  loop
    update public.categories set sort_order = sort_order + 1 where user_id = r.user_id and sort_order > r.sort_order;
    insert into public.categories (user_id, name, sort_order) values (r.user_id, 'Fireplace', r.sort_order + 1);
  end loop;
end $$;

-- 3. Section names follow the rename ("Fire Pit / Fireplace · Firepit 1" → "Fire Pit · Firepit 1").
update public.materials_sections
   set name = 'Fire Pit' || substr(name, length('Fire Pit / Fireplace') + 1)
 where name ilike 'Fire Pit / Fireplace%';
update public.quote_sections s
   set name = 'Fire Pit' || substr(s.name, length('Fire Pit / Fireplace') + 1)
  from public.quotes q
 where q.id = s.quote_id and q.status <> 'approved' and s.name ilike 'Fire Pit / Fireplace%';

-- 4. New accounts.
create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, sort_order) values
    (new.id, 'Paver Patio',            0),
    (new.id, 'Outdoor Kitchen',        1),
    (new.id, 'Seating Wall',           2),
    (new.id, 'Retaining Wall',         3),
    (new.id, 'Fire Pit',               4),
    (new.id, 'Fireplace',              5),
    (new.id, 'Walkway',                6),
    (new.id, 'Driveway',               7),
    (new.id, 'Outdoor Lighting',       8),
    (new.id, 'Steps',                  9),
    (new.id, 'Drainage',              10),
    (new.id, 'Pergola',               11),
    (new.id, 'Water Feature',         12),
    (new.id, 'Sod',                   13),
    (new.id, 'Irrigation',            14),
    (new.id, 'Plants',                15),
    (new.id, 'Other / Uncategorized', 16);
  return new;
end $$;

-- 5. Maintenance starting suggestions (0127) gain Fireplace — for new
-- contractors, and for anyone who already has the Fire Pit suggestion.
create or replace function public.maintenance_seed_templates()
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null or public.is_employee() then return 0; end if;
  if exists (select 1 from public.maintenance_templates where user_id = v_uid) then return 0; end if;
  insert into public.maintenance_templates (user_id, build_type, label, description, interval_months, interval_months_max, as_needed, remind_month, sort_order)
  select v_uid, bt, x.label, x.descr, x.i_min, x.i_max, x.as_needed, x.month, x.ord
    from (values
      ('Clean & reseal', 'A deep clean and fresh sealer keeps the color rich and protects against stains and weeds.', 24, 36, false, 4, 10),
      ('Re-sand joints (polymeric sand)', 'Topping up the joint sand keeps pavers locked in place and weeds out.', null::int, null::int, true, null::int, 20)
    ) as x(label, descr, i_min, i_max, as_needed, month, ord),
    unnest(array['paver_patio', 'walkway', 'driveway']) bt
  union all
  select v_uid, bt, 'Inspect drainage & caps', 'A quick check that drainage is flowing and caps are secure keeps the wall solid for years.', 24, null, false, 4, 10
    from unnest(array['retaining_wall', 'seating_wall']) bt
  union all
  select v_uid, 'outdoor_lighting', 'Annual lighting check', 'Bulbs, timer and connections checked so everything shines when you need it.', 12, null, false, 10, 10
  union all
  select v_uid, bt, 'Inspect & clean', 'A yearly inspection and cleaning keeps it safe and looking its best.', 12, null, false, 4, 10
    from unnest(array['fire_pit', 'outdoor_kitchen']) bt
  union all
  select v_uid, 'fireplace', 'Inspect & sweep chimney', 'A yearly chimney sweep and inspection keeps it drawing well and safe to use.', 12, null, false, 9, 10;
  get diagnostics n = row_count;
  return n;
end;
$$;

insert into public.maintenance_templates (user_id, build_type, label, description, interval_months, interval_months_max, as_needed, remind_month, sort_order)
select distinct t.user_id, 'fireplace', 'Inspect & sweep chimney', 'A yearly chimney sweep and inspection keeps it drawing well and safe to use.', 12, null::int, false, 9, 10
  from public.maintenance_templates t
 where t.build_type = 'fire_pit'
   and not exists (select 1 from public.maintenance_templates f where f.user_id = t.user_id and f.build_type = 'fireplace');
