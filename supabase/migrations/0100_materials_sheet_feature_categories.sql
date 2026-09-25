-- ContractorHQ — which project types a materials sheet has accounted for.
-- Run AFTER 0099.
--
-- New materials sheets start with one section per project type (or, for a
-- second sheet, the types the user picks). When a project type is added to
-- the project later, the sheet shows a non-blocking "X was added to this
-- project · Add section" banner instead of adding it silently. To know
-- what's new, each sheet remembers the project types it has already
-- accounted for: the ones present when it was created (whether they got a
-- section or were deliberately left out of a partial-scope sheet), plus any
-- the user later added or dismissed from the banner.
--
-- project_categories can't answer "added when?": it has no timestamp, and
-- setProjectCategories() replaces the whole set on every change.
--
-- Existing sheets are backfilled with their project's current types, so
-- nothing already on a project raises a banner — only types added from now on.

alter table public.materials_sheets
  add column if not exists feature_category_ids uuid[] not null default '{}';

update public.materials_sheets s
set feature_category_ids = coalesce(
  (select array_agg(pc.category_id) from public.project_categories pc where pc.project_id = s.project_id),
  '{}'
);
