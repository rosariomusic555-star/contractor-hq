-- ContractorHQ — Seasonal Backlog card range toggle (6 vs 12 months).
-- Run AFTER 0054.
--
-- Remembers the user's last choice of range on the Dashboard card so it
-- doesn't reset to 6 months on every load. Same one-row-per-user table as
-- the capacity setting (0054) — just one more column, not a new table.

alter table public.backlog_settings
  add column if not exists default_range_months integer not null default 6
    check (default_range_months in (6, 12));
