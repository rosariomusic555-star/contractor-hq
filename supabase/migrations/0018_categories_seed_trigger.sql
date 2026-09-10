-- ContractorHQ — seed default work categories for every new user.
-- Run AFTER 0017_categories.sql.
--
-- No backfill for existing users — run the same 11 inserts by hand (with
-- user_id set) for any account that predates this migration if it needs
-- the defaults. SECURITY DEFINER + a trigger on auth.users (rather than an
-- app-side lazy seed) so it fires for every signup path and can't race.

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
    (new.id, 'Other / Uncategorized', 10);
  return new;
end $$;

drop trigger if exists on_auth_user_created_seed_categories on auth.users;
create trigger on_auth_user_created_seed_categories
  after insert on auth.users
  for each row execute function public.seed_default_categories();
