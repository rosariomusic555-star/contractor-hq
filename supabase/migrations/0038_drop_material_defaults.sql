-- ContractorHQ — drop material_defaults (0034, revised 0035). Run AFTER
-- 0001-0037.
--
-- This table existed solely to support the old Materials Sheet "Smart
-- Calculator" (build-type dimension form + formula engine), which has been
-- removed and replaced by the new Smart Section feature (a simple,
-- config-driven line-item name template — no calculation, no dimension
-- defaults to pre-fill). Nothing else in the app reads this table.
--
-- Price Book's own material_type/specs columns (also added in 0034) are
-- untouched — those are Price Book's data, not the calculator's, and stay
-- exactly as they are.

drop table if exists public.material_defaults;
