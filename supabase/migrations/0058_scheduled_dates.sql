-- ContractorHQ — Backlog Schedule calendar (day-precision scheduling).
-- Run AFTER 0053-0057.
--
-- target_install_month (0053) was month-precision only — fine for the
-- Seasonal Backlog card's monthly buckets, not enough for a real calendar
-- (week-spanning bars, drag-to-a-day, resize-from-an-edge). These two
-- columns replace it as the scheduling source of truth going forward;
-- target_install_month is left in place (never drop a column in this repo)
-- but nothing new reads it after this migration — see backlog.ts.
--
-- Both nullable: a job can have a start with no end yet (renders as a
-- single-day bar), or neither (Unscheduled rail).
--
-- One-time backfill: existing rows that already have a target_install_month
-- get scheduled_start_date = the 1st of that month, so nothing already
-- placed on the old month-only card silently disappears from the new
-- calendar. No scheduled_end_date is inferred — a month doesn't imply a
-- job's real duration.

alter table public.projects
  add column if not exists scheduled_start_date date,
  add column if not exists scheduled_end_date date;

update public.projects
   set scheduled_start_date = target_install_month
 where target_install_month is not null
   and scheduled_start_date is null;

-- Backlog Schedule page (/backlog) view-mode toggle (month/quarter/timeline)
-- — remembered per user, same one-row-per-user table as the 6/12 range
-- toggle (0057).
alter table public.backlog_settings
  add column if not exists default_calendar_view text not null default 'month'
    check (default_calendar_view in ('month', 'quarter', 'timeline'));

