-- ContractorHQ — Estimated duration card (project detail page). Run AFTER
-- 0060.
--
-- `estimated_duration_days` is the owner-entered estimate, in working
-- (crew) days. `actual_start_date`/`actual_end_date` are set manually by
-- the owner as the job actually runs — deliberately separate from
-- scheduled_start_date/scheduled_end_date (0058, the *planned* crew
-- window): the two are allowed to disagree, see
-- src/components/views/ProjectDetailView.tsx's Estimated duration card.
-- All three nullable — the card reads a blank estimate/not-started state
-- until the owner fills them in.

alter table public.projects
  add column if not exists estimated_duration_days integer,
  add column if not exists actual_start_date date,
  add column if not exists actual_end_date date;
