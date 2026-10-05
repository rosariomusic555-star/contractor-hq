-- 0165 — Default unit per material category.
--
-- material_categories.default_unit — the category's usual unit ("sq ft" for
-- Pavers, "ton" for Base Gravel…). When a cost plan line's category is set,
-- the line's unit becomes this while the unit is still empty or still the
-- previous category's default — never over a unit the contractor chose
-- (src/lib/categoryUnits.ts). Editable in Settings › Material categories;
-- null = no default.
--
-- suggest_category_unit(name) is the name → unit rule, the same one as
-- suggestCategoryUnit() in src/lib/categoryUnits.ts (keep them in step).
-- It backfills every existing category, and fills new ones on insert when
-- no unit is given (so the new-account seed gets them too, unchanged).
--
-- Existing line items are not changed.

alter table public.material_categories add column if not exists default_unit text;

create or replace function public.suggest_category_unit(p_name text)
returns text
language sql
immutable
as $$
  select case
    when n ~ '\y(gravel|aggregates?|crushed stone|bedding sand|top ?soil|mulch|paver base|screenings|stone dust)\y'
      then case when n ~ '\y(yards?|yds?|cu\.? ?yd)\y' then 'cu yd' else 'ton' end
    when n ~ '\y(polymeric sand|poly sand|mortar|concrete mix)\y' then 'bag'
    when n ~ '\y(veneers?|sod)\y' then 'sq ft'
    when n ~ '\ypavers?\y' then 'sq ft'
    when n ~ '\y(wall ?blocks?|caps?|coping|steps?|treads?|light fixtures?|fixtures?|transformers?)\y' then 'piece'
    when n ~ '\y(geotextile|fabric)\y' then 'roll'
    when n ~ '\y(edge restraints?|edging|drain pipe|pipe|wire)\y' then 'ft'
    when n ~ '\yadhesives?\y' then 'tube'
    else null
  end
  from (select lower(trim(coalesce(p_name, ''))) as n) s
$$;

create or replace function public.material_category_fill_default_unit()
returns trigger
language plpgsql
as $$
begin
  if new.default_unit is null then
    new.default_unit := public.suggest_category_unit(new.name);
  end if;
  return new;
end $$;

drop trigger if exists material_category_fill_default_unit on public.material_categories;
create trigger material_category_fill_default_unit
  before insert on public.material_categories
  for each row execute function public.material_category_fill_default_unit();

-- Backfill: every existing category without one.
update public.material_categories
   set default_unit = public.suggest_category_unit(name)
 where default_unit is null
   and public.suggest_category_unit(name) is not null;

-- Check: categories per default unit.
select coalesce(default_unit, '(none)') as default_unit, count(*) as categories
  from public.material_categories
 group by 1
 order by 2 desc;
