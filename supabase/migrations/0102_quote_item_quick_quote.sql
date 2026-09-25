-- ContractorHQ — mark Quick Quote–generated quote lines. Run AFTER 0101.
--
-- Each quote section now has its own "Quick quote" action. The line it
-- produces is marked with the build type it was quoted as (paver_patio,
-- outdoor_kitchen…), so running Quick Quote on that section again updates
-- that same line in place instead of adding a duplicate — the same way the
-- materials sheet calculator overwrites on a re-run. Null = an ordinary,
-- hand-entered line. Existing lines are left null.

alter table public.quote_items
  add column if not exists quick_quote_build_type text;
