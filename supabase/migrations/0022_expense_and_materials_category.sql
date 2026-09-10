-- ContractorHQ — optional expense category on expenses and Materials Sheet
-- line items. Run AFTER 0020_expense_categories.sql.
--
-- Nullable, `on delete set null`: an untagged/uncategorized record is NULL,
-- not a special row — the seeded "Other" expense category is just a normal,
-- renamable/deletable default like the rest. Same NULL="Uncategorized"
-- convention as quote_items.category_id (0019).
--
-- Named `expense_category_id` (not `category_id`) on both tables so it
-- self-documents which table it points to, and stays visually distinct
-- from quote_items.category_id (work-type tags, a different table
-- entirely — see 0020's header comment).

alter table public.expenses
  add column if not exists expense_category_id uuid references public.expense_categories (id) on delete set null;
create index if not exists expenses_expense_category_id_idx on public.expenses (expense_category_id);

alter table public.materials_items
  add column if not exists expense_category_id uuid references public.expense_categories (id) on delete set null;
create index if not exists materials_items_expense_category_id_idx on public.materials_items (expense_category_id);
