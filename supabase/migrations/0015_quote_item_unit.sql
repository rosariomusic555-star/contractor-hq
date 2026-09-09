-- ContractorHQ — unit label on quote line items.
-- Run AFTER 0001–0014.
--
-- Adds a free-text unit of measure per line (sf, cy, lf, tons, ea…), shown
-- next to Qty × Rate in the quote builder and on the client-facing quote.
-- Purely a label — it does not affect the line total (still quantity × price).
--
-- Nullable, no default: existing lines keep a blank unit and render unchanged.
-- get_shared_quote / the standalone variant both select the item row with
-- to_jsonb(i), so the new column reaches the client-facing page with no
-- function change.

alter table public.quote_items
  add column if not exists unit text;
