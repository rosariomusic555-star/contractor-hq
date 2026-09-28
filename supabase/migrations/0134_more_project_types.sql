-- ContractorHQ — More default project types. Run AFTER 0133.
--
-- Project types ARE the per-contractor Job Categories list (categories,
-- 0017/0079) — the opportunity "Project type" dropdown, the quote line-item
-- category and the Smart Section / Quick Quote / Measurements build types
-- (matched by name, src/lib/measurements.ts BUILD_TYPE_ALIASES) all read
-- it. This adds Pergola, Water Feature, Sod, Irrigation and Plants:
--   · to every existing contractor's list (only if they don't have that name)
--   · to the defaults a new account starts with.
-- The app's "Reset to default" (Settings › Manage Smart Section Templates ›
-- Project types) re-adds any missing default the same way — never deletes.

insert into public.categories (user_id, name, sort_order)
select u.user_id, v.name, coalesce(u.max_order, 0) + v.ord
  from (select user_id, max(sort_order) as max_order from public.categories group by user_id) u
 cross join (values ('Pergola', 1), ('Water Feature', 2), ('Sod', 3), ('Irrigation', 4), ('Plants', 5)) as v(name, ord)
 where not exists (
   select 1 from public.categories c where c.user_id = u.user_id and lower(trim(c.name)) = lower(v.name)
 );

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
    (new.id, 'Fire Pit / Fireplace',   4),
    (new.id, 'Walkway',                5),
    (new.id, 'Driveway',               6),
    (new.id, 'Outdoor Lighting',       7),
    (new.id, 'Steps',                  8),
    (new.id, 'Drainage',               9),
    (new.id, 'Pergola',               10),
    (new.id, 'Water Feature',         11),
    (new.id, 'Sod',                   12),
    (new.id, 'Irrigation',            13),
    (new.id, 'Plants',                14),
    (new.id, 'Other / Uncategorized', 15);
  return new;
end $$;
