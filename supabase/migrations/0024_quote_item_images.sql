-- ContractorHQ — photos attached to quote line items (paver style, area
-- being worked on, etc). Multiple per item. Run AFTER 0023.
--
-- `storage_path` points into the `images` bucket (0023), always under
-- `quote-items/{quote_item_id}/...` — the storage RLS policies key off that
-- prefix + this row's quote_item_id, so the two must stay in agreement (the
-- app controls this entirely; nothing here enforces it at the DB level).
--
-- No `on delete cascade` gap for Storage: deleting a quote_item cascades
-- this table via the FK below, but the actual file in Storage is NOT
-- touched by that cascade — the app must explicitly remove the storage
-- object before (or as part of) deleting the row/item/section, or it
-- orphans. See deleteQuoteItem/deleteQuoteSection in src/lib/api.ts.

create table public.quote_item_images (
  id            uuid primary key default gen_random_uuid(),
  quote_item_id uuid not null references public.quote_items (id) on delete cascade,
  storage_path  text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index on public.quote_item_images (quote_item_id);

alter table public.quote_item_images enable row level security;

-- Same "own" pattern as quote_items itself (0003) — ownership through the
-- quote_item -> quote_section -> quote chain.
create policy "own" on public.quote_item_images for all to authenticated
  using      (exists (select 1 from public.quote_items qi
                        join public.quote_sections qs on qs.id = qi.section_id
                        join public.quotes q on q.id = qs.quote_id
                       where qi.id = quote_item_id and q.user_id = auth.uid()))
  with check (exists (select 1 from public.quote_items qi
                        join public.quote_sections qs on qs.id = qi.section_id
                        join public.quotes q on q.id = qs.quote_id
                       where qi.id = quote_item_id and q.user_id = auth.uid()));

-- No anon policy here — get_shared_quote (0026) is SECURITY DEFINER and
-- bypasses RLS entirely to read this table for the client-facing page. The
-- anon carve-out that matters is on storage.objects (0023), for the actual
-- image bytes.
revoke all on public.quote_item_images from anon;
