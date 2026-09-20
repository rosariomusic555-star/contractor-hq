-- ContractorHQ — photos on a material order/delivery (proof of delivery,
-- damaged pallet, packing slip…). Run AFTER 0056.
--
-- Same shape as project_images (0025) — id/storage_path/caption/sort_order
-- — so the Photos gallery UI (src/components/common/PhotoGallery.tsx) can
-- treat a delivery's photos identically to a project's. `storage_path`
-- points into the same `images` bucket (0023), under
-- `material-orders/{material_order_id}/...` this time. As with
-- project_images, deleteMaterialOrder (src/lib/api.ts) must explicitly
-- remove the storage objects first — the cascade below only removes the
-- DB rows.

create table public.material_order_images (
  id                uuid primary key default gen_random_uuid(),
  material_order_id uuid not null references public.material_orders (id) on delete cascade,
  storage_path      text not null,
  caption           text,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

create index on public.material_order_images (material_order_id);

alter table public.material_order_images enable row level security;

-- Same "own via material_orders" pattern as material_order_items (0056).
create policy "own via material_orders" on public.material_order_images for all to authenticated
  using      (exists (select 1 from public.material_orders mo where mo.id = material_order_id and mo.user_id = auth.uid()))
  with check (exists (select 1 from public.material_orders mo where mo.id = material_order_id and mo.user_id = auth.uid()));

revoke all on public.material_order_images from anon;
