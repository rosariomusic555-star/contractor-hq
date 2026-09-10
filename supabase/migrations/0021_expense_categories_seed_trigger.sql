-- ContractorHQ — seed default expense categories for every new user.
-- Run AFTER 0020_expense_categories.sql.
--
-- No backfill for existing users — run the same 11 inserts by hand (with
-- user_id set) for any account that predates this migration if it needs
-- the defaults. A second, independent trigger on auth.users (alongside
-- seed_default_categories from 0018) — Postgres fires multiple triggers
-- for the same event fine, and keeping the two seed lists in separate
-- functions means fixing one later never risks the other.

create or replace function public.seed_default_expense_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.expense_categories (user_id, name, sort_order) values
    (new.id, 'Pavers',                        0),
    (new.id, 'Base material',                 1),
    (new.id, 'Sand (bedding / polymeric)',     2),
    (new.id, 'Edge restraint',                3),
    (new.id, 'Equipment rental',              4),
    (new.id, 'Fuel',                          5),
    (new.id, 'Dump fees',                     6),
    (new.id, 'Subcontractor',                 7),
    (new.id, 'Labor',                         8),
    (new.id, 'Permits',                       9),
    (new.id, 'Other',                        10);
  return new;
end $$;

drop trigger if exists on_auth_user_created_seed_expense_categories on auth.users;
create trigger on_auth_user_created_seed_expense_categories
  after insert on auth.users
  for each row execute function public.seed_default_expense_categories();
