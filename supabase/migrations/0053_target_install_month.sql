-- ContractorHQ — Seasonal Backlog card (Dashboard hardscape pass, part 1).
-- Run AFTER 0001-0052.
--
-- Which calendar month a job is targeted to install in. Nullable — set by
-- the contractor once a job is roughly scheduled, usually around when the
-- quote is approved; older/unscheduled jobs stay null and are excluded from
-- the backlog view. Stored as the first-of-month date (e.g. 2026-10-01) so
-- it sorts/groups like any other date column; the UI only ever shows/edits
-- the month.

alter table public.projects
  add column if not exists target_install_month date;
