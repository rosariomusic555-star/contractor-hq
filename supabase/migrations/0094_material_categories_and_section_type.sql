-- ContractorHQ — Materials sheet: one editable material-category list, and
-- a project-type tag per section. Run AFTER 0093.
--
-- 1. material_categories — each contractor's own list (Settings > Material
--    categories): add, rename, reorder, delete. Replaces the fixed
--    ORDER_SHEET_CATEGORIES code list. Seeded with those same 10 names for
--    every account (and new accounts via trigger), same pattern as
--    lead_sources (0090).
--
-- 2. materials_items.material_category_id — the line's category by id, so
--    a rename shows everywhere at once. Backfilled from the old free-text
--    materials_items.category by name (case-insensitive). Any old text
--    value that isn't in the default list is added to that contractor's
--    list first, so nothing is lost. Deleting a category sets its lines to
--    null ("Uncategorized") — never deletes a line.
--    The old text column stays (not dropped) as a harmless snapshot.
--
--    This is the single "category" field on a line item now. The old cost
--    category (materials_items.expense_category_id) is no longer shown on
--    the sheet — nothing ever read it — but the column and its data are
--    kept untouched.
--
-- 3. materials_sections.job_category_id — which of the project's own
--    project types (Settings > Categories, the same list as the project's
--    "Project types" chips) a section belongs to. Nullable; deleting the
--    category just clears the tag.

-- 1 ---------------------------------------------------------------------
create table if not exists public.material_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists material_categories_user_id_idx on public.material_categories (user_id);

alter table public.material_categories enable row level security;

drop policy if exists "own" on public.material_categories;
create policy "own" on public.material_categories for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.material_categories from anon;

create or replace function public.seed_default_material_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.material_categories (user_id, name, sort_order) values
    (new.id, 'Pavers',         0),
    (new.id, 'Wall Block',     1),
    (new.id, 'Caps',           2),
    (new.id, 'Base Gravel',    3),
    (new.id, 'Bedding Sand',   4),
    (new.id, 'Polymeric Sand', 5),
    (new.id, 'Edging',         6),
    (new.id, 'Adhesive',       7),
    (new.id, 'Fabric',         8),
    (new.id, 'Other',          9)
  on conflict (user_id, name) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_seed_material_categories on auth.users;
create trigger on_auth_user_created_seed_material_categories
  after insert on auth.users
  for each row execute function public.seed_default_material_categories();

-- Backfill defaults for every existing account.
insert into public.material_categories (user_id, name, sort_order)
select u.id, v.name, v.pos
from auth.users u
cross join (values
  ('Pavers', 0), ('Wall Block', 1), ('Caps', 2), ('Base Gravel', 3), ('Bedding Sand', 4),
  ('Polymeric Sand', 5), ('Edging', 6), ('Adhesive', 7), ('Fabric', 8), ('Other', 9)
) as v(name, pos)
on conflict (user_id, name) do nothing;

-- Keep any old free-text category that isn't in the defaults.
insert into public.material_categories (user_id, name, sort_order)
select distinct on (p.user_id, lower(trim(mi.category)))
       p.user_id, trim(mi.category), 100
from public.materials_items mi
join public.materials_sections ms on ms.id = mi.section_id
join public.projects p on p.id = ms.project_id
where mi.category is not null and trim(mi.category) <> ''
  and not exists (
    select 1 from public.material_categories mc
    where mc.user_id = p.user_id and lower(mc.name) = lower(trim(mi.category))
  )
on conflict (user_id, name) do nothing;

-- 2 ---------------------------------------------------------------------
alter table public.materials_items
  add column if not exists material_category_id uuid references public.material_categories (id) on delete set null;

create index if not exists materials_items_material_category_id_idx on public.materials_items (material_category_id);

update public.materials_items mi
set material_category_id = mc.id
from public.materials_sections ms, public.projects p, public.material_categories mc
where ms.id = mi.section_id
  and p.id = ms.project_id
  and mc.user_id = p.user_id
  and mi.category is not null
  and lower(mc.name) = lower(trim(mi.category))
  and mi.material_category_id is null;

-- 3 ---------------------------------------------------------------------
alter table public.materials_sections
  add column if not exists job_category_id uuid references public.categories (id) on delete set null;
