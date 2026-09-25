-- ContractorHQ — opportunities.measurements → opportunities.site_conditions.
-- Run AFTER 0098.
--
-- Structured measurements now live on the project (project_feature_measurements,
-- 0098). The opportunity's free-text field is repurposed for site conditions
-- (access, slope, drainage, soil, utilities…), so the column is renamed to
-- say so. A plain rename keeps every note already entered, and nothing in
-- the database refers to the old name: no function, view, policy or
-- trigger (checked across 0049–0098). Internal only — not exposed to the
-- Client Hub, quotes or the AI assistant.

alter table public.opportunities rename column measurements to site_conditions;

comment on column public.opportunities.site_conditions is
  'Internal free-text site conditions (access, slope, drainage, soil, utilities). Formerly "measurements".';
