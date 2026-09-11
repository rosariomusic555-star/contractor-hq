-- ContractorHQ — Storage RLS for change-order photos. Run AFTER 0001-0031.
--
-- 0023 set up the "images" bucket's RLS for the "quote-items/" and
-- "projects/" path prefixes only — it has no policy at all for the new
-- "change-orders/{change_order_id}/{uuid}.{ext}" prefix addChangeOrderImage()
-- (src/lib/api.ts) writes to, so every upload/read/delete is silently
-- rejected by Storage RLS (no matching policy = denied) until this runs.
--
-- Owner-only, same as project images — no anon policy; change-order photos
-- are never publicly shared.

create policy "own change-order images select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'change-orders'
    and exists (
      select 1 from public.change_orders co
      where co.id::text = (storage.foldername(storage.objects.name))[2]
        and co.user_id = auth.uid()
    )
  );

create policy "own change-order images insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'change-orders'
    and exists (
      select 1 from public.change_orders co
      where co.id::text = (storage.foldername(storage.objects.name))[2]
        and co.user_id = auth.uid()
    )
  );

create policy "own change-order images update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'change-orders'
    and exists (
      select 1 from public.change_orders co
      where co.id::text = (storage.foldername(storage.objects.name))[2]
        and co.user_id = auth.uid()
    )
  );

create policy "own change-order images delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'change-orders'
    and exists (
      select 1 from public.change_orders co
      where co.id::text = (storage.foldername(storage.objects.name))[2]
        and co.user_id = auth.uid()
    )
  );
