-- ContractorHQ — Generate Order Sheet: adds the one new field the feature
-- needs, a material category on the Materials Sheet line itself. Run
-- AFTER 0088.
--
-- Free text, not a CHECK-constrained enum — same "the list can grow
-- without a migration" convention as materials_items.material_type
-- (Price Book, 0034)/quotes.project_type-turned-categories. The app's own
-- suggested list (Pavers, Wall Block, Caps, Base Gravel, Bedding Sand,
-- Polymeric Sand, Edging, Adhesive, Fabric, Other) lives in
-- src/lib/api.ts's ORDER_SHEET_CATEGORIES, not the database.
--
-- Product Catalog already has a real `category` column (0036) — nothing
-- to add there. A materials_item picked from the Catalog gets this field
-- prefilled from the product's own category at pick time (app-layer, same
-- "picking fills in name/unit/cost" convention every other Catalog/Price
-- Book pick already follows) — never a live join, and never locked, so
-- the contractor can still retag it afterward like any other field.
alter table public.materials_items
  add column if not exists category text;

-- Price Book items can carry a default category too, prefilled onto a
-- materials_item the same way at pick time.
alter table public.price_book
  add column if not exists category text;
