-- ContractorHQ — quantity on quote line items.
-- Run AFTER 0001–0013.
--
-- Quote items become quantity × unit price = line total, matching the
-- Materials sheet (materials_items already has quantity + unit_cost).
-- The `price` column is now the UNIT price.
--
-- Default 1 so every existing line's total (1 × price) is unchanged.
-- get_shared_quote / the standalone variant both select the item row with
-- to_jsonb(i), so the new column reaches the client-facing page with no
-- function change.

alter table public.quote_items
  add column if not exists quantity numeric not null default 1;
