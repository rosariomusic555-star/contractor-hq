-- =============================================================================
-- 0109 — Actual costs by feature and type (Phase E)
--
-- Expenses (and each split line) already carry an optional feature_id (0105;
-- null = General). This adds their cost type — material / labor /
-- subcontractor / equipment / other — so actual spend lines up with the Cost
-- plan's planned types. Null = follow the expense category's cost_type
-- (0103), which is how every existing expense keeps reading.
--
-- Labor logged per feature uses labor_entries.feature_id (0105).
-- =============================================================================

alter table public.expenses
  add column if not exists cost_type text
  check (cost_type in ('material', 'labor', 'subcontractor', 'equipment', 'other'));

alter table public.expense_lines
  add column if not exists cost_type text
  check (cost_type in ('material', 'labor', 'subcontractor', 'equipment', 'other'));
