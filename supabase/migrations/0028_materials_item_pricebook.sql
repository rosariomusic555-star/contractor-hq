-- ContractorHQ — link a Materials Sheet line item to the Price Book
-- (0027) it was picked from, plus a unit-of-measure label materials_items
-- never had before. Run AFTER 0027_price_book.sql.
--
-- `unit` — free-text label (sf, cy, bag, lf, ea…), same purpose and shape
-- as quote_items.unit (0015). Label only, not part of the math (line total
-- is still quantity * unit_cost).
--
-- `price_book_item_id` — set when this line was auto-filled from a price
-- book pick; the Materials Sheet uses its presence to lock the line's
-- expense_category_id (picking from the price book is what's meant to keep
-- categorization consistent — price/unit stay freely editable per line
-- either way). `on delete set null`: deleting the price book item later
-- just unlinks the line (it keeps its current values and becomes a normal
-- editable custom line) rather than blocking the delete or losing data.

alter table public.materials_items
  add column if not exists unit text;

alter table public.materials_items
  add column if not exists price_book_item_id uuid references public.price_book (id) on delete set null;

create index if not exists materials_items_price_book_item_id_idx
  on public.materials_items (price_book_item_id);
