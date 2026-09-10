-- ContractorHQ — optional category on quote line items.
-- Run AFTER 0017_categories.sql.
--
-- Nullable: an uncategorized line item is NULL, not a special row — the
-- Quote Builder's category picker and the "Revenue by category" chart both
-- treat null as "Uncategorized". `on delete set null` so deleting a category
-- (Settings > Categories) demotes its line items to uncategorized instead of
-- failing or cascading a delete.

alter table public.quote_items
  add column if not exists category_id uuid references public.categories (id) on delete set null;

create index if not exists quote_items_category_id_idx on public.quote_items (category_id);
