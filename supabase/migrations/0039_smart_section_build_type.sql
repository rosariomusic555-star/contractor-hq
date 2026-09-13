-- ContractorHQ — Smart Section step 2 (the in-section calculator). Run
-- AFTER 0001-0038.
--
-- A section created via "Create Smart Section" remembers which build type
-- it was created as, so its header can show a calculator icon that knows
-- which question set/formulas to run. Null for ordinary manually-created
-- sections (no calculator icon shown). This is Smart Section's own
-- metadata — Price Book, Catalog, and materials_items are untouched.

alter table public.materials_sections
  add column if not exists smart_section_build_type text;
