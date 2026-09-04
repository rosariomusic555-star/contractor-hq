-- ContractorHQ — close a minor gap on the new expenses table.
--
-- expenses already has owner-only RLS (verified live: inserting without a
-- matching user_id is rejected, and an anon SELECT sees zero rows). But
-- unlike every other table in 0003, anon was never explicitly revoked here,
-- so anon still holds a bare SELECT grant — RLS happens to filter it down
-- to nothing today, but that's relying on RLS alone rather than defense in
-- depth. Bring it in line with clients/projects/quotes/invoices/etc.

revoke all on public.expenses from anon;
