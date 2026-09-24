-- ContractorHQ — Materials sheet line items: color + unit dropdown.
--
-- 1. product_catalog.colors — each Catalog product's color options, shown
--    in the Color dropdown after a product is picked. Empty for every
--    seeded row: no real color data has been sourced yet, and made-up
--    colors would be worse than none (the dropdown falls back to typing a
--    custom color). Fill in per product from the manufacturer's spec book.
--
-- 2. materials_items.color — the chosen (or custom-typed) color. Free text,
--    nullable; not a reference to the catalog list, so a custom color or a
--    later catalog edit never breaks an existing line.
--
-- 3. materials_items.unit normalized onto the new Unit dropdown's options
--    (sq ft, piece, layer, pallet, ton, bag, roll, tube). Only exact
--    known spellings are mapped (same table as normalizeMaterialUnit() in
--    src/lib/materialsMath.ts); anything else is left exactly as typed and
--    shows as a custom ("Other") unit. Nothing is ever cleared. Delivery
--    matching is unaffected — materialTracking.ts's unit aliases treat the
--    old and new spellings as the same unit.

alter table public.product_catalog
  add column if not exists colors text[] not null default '{}';

alter table public.materials_items
  add column if not exists color text;

update public.materials_items
set unit = case lower(trim(unit))
  when 'sq ft' then 'sq ft'
  when 'sqft' then 'sq ft'
  when 'sq. ft.' then 'sq ft'
  when 'sq.ft.' then 'sq ft'
  when 'sq.ft' then 'sq ft'
  when 'sf' then 'sq ft'
  when 'square foot' then 'sq ft'
  when 'square feet' then 'sq ft'
  when 'ft2' then 'sq ft'
  when 'piece' then 'piece'
  when 'pieces' then 'piece'
  when 'pc' then 'piece'
  when 'pcs' then 'piece'
  when 'ea' then 'piece'
  when 'each' then 'piece'
  when 'layer' then 'layer'
  when 'layers' then 'layer'
  when 'pallet' then 'pallet'
  when 'pallets' then 'pallet'
  when 'ton' then 'ton'
  when 'tons' then 'ton'
  when 'tn' then 'ton'
  when 'bag' then 'bag'
  when 'bags' then 'bag'
  when 'roll' then 'roll'
  when 'rolls' then 'roll'
  when 'tube' then 'tube'
  when 'tubes' then 'tube'
  else unit
end
where unit is not null
  and lower(trim(unit)) in (
    'sq ft', 'sqft', 'sq. ft.', 'sq.ft.', 'sq.ft', 'sf', 'square foot', 'square feet', 'ft2',
    'piece', 'pieces', 'pc', 'pcs', 'ea', 'each',
    'layer', 'layers', 'pallet', 'pallets', 'ton', 'tons', 'tn',
    'bag', 'bags', 'roll', 'rolls', 'tube', 'tubes'
  );
