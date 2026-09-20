-- ContractorHQ — Storage RLS for material-order (delivery) photos. Run AFTER 0059.
--
-- 0023 set up the "images" bucket's RLS for the "quote-items/" and
-- "projects/" prefixes only (0032 later added "change-orders/") — it has no
-- policy for the new "material-orders/{material_order_id}/{uuid}.{ext}"
-- prefix addMaterialOrderImage() (src/lib/api.ts) writes to, so every
-- upload/read/delete is silently rejected by Storage RLS (no matching
-- policy = denied) until this runs.
--
-- Owner-only, same as change-order images — no anon policy; delivery photos
-- are never publicly shared.

create policy "own material-order images select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'material-orders'
    and exists (
      select 1 from public.material_orders mo
      where mo.id::text = (storage.foldername(storage.objects.name))[2]
        and mo.user_id = auth.uid()
    )
  );

create policy "own material-order images insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'material-orders'
    and exists (
      select 1 from public.material_orders mo
      where mo.id::text = (storage.foldername(storage.objects.name))[2]
        and mo.user_id = auth.uid()
    )
  );

create policy "own material-order images update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'material-orders'
    and exists (
      select 1 from public.material_orders mo
      where mo.id::text = (storage.foldername(storage.objects.name))[2]
        and mo.user_id = auth.uid()
    )
  );

create policy "own material-order images delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'material-orders'
    and exists (
      select 1 from public.material_orders mo
      where mo.id::text = (storage.foldername(storage.objects.name))[2]
        and mo.user_id = auth.uid()
    )
  );
