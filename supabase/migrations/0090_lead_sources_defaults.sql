-- ContractorHQ — Lead sources: fix the empty dropdown. Run AFTER 0089
-- (and after 0077, which creates the lead_sources table).
--
-- Why the list came back empty: 0077 seeded defaults only for users who
-- already had at least one client at the moment it ran (it selected from
-- public.clients), and nothing seeded accounts created afterwards. Any
-- contractor outside that set had zero rows, so both dropdowns (New
-- opportunity dialog + opportunity page) rendered no options.
--
-- This migration:
--   1. adds a seed trigger on auth.users for new accounts — same pattern
--      as seed_default_categories (0018) / seed_default_expense_categories
--      (0021);
--   2. backfills EVERY existing account (auth.users, not clients) with the
--      default list. Additive only — `on conflict do nothing` keeps any
--      source a contractor already has (incl. 0077's Yelp / Walk-in), and
--      new names are appended after their existing ones.

create or replace function public.seed_default_lead_sources()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lead_sources (user_id, name, sort_order) values
    (new.id, 'Referral',      0),
    (new.id, 'Google',        1),
    (new.id, 'Website',       2),
    (new.id, 'Facebook',      3),
    (new.id, 'Instagram',     4),
    (new.id, 'Yard sign',     5),
    (new.id, 'Repeat client', 6),
    (new.id, 'Other',         7)
  on conflict (user_id, name) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_seed_lead_sources on auth.users;
create trigger on_auth_user_created_seed_lead_sources
  after insert on auth.users
  for each row execute function public.seed_default_lead_sources();

-- Backfill: existing users get whichever defaults they're missing, placed
-- after anything they already have (existing max sort_order + position).
insert into public.lead_sources (user_id, name, sort_order)
select u.id,
       v.name,
       coalesce((select max(l.sort_order) + 1 from public.lead_sources l where l.user_id = u.id), 0) + v.pos
from auth.users u
cross join (values
  ('Referral', 0), ('Google', 1), ('Website', 2), ('Facebook', 3),
  ('Instagram', 4), ('Yard sign', 5), ('Repeat client', 6), ('Other', 7)
) as v(name, pos)
where not exists (
  select 1 from public.lead_sources l where l.user_id = u.id and lower(l.name) = lower(v.name)
)
on conflict (user_id, name) do nothing;
