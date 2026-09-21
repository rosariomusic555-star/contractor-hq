-- ContractorHQ — Storage RLS for materials usage-log photos. Run AFTER
-- 0080.
--
-- Same recurring gotcha as every other photo feature in this app (0023,
-- 0032, 0060): table RLS alone does nothing for Storage — without a
-- matching policy on storage.objects for the "materials-usage/" prefix,
-- every upload/read/delete under it is silently denied. Path shape:
-- "materials-usage/{materials_item_id}/{uuid}.{ext}" — scoped to the
-- materials_item (not the usage log itself, which may not exist yet at
-- upload time — see uploadUsageLogPhoto's own doc comment, api.ts) via
-- materials_items -> materials_sections -> projects.

create policy "own materials-usage photos select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'materials-usage'
    and exists (
      select 1 from public.materials_items mi
      join public.materials_sections ms on ms.id = mi.section_id
      join public.projects p on p.id = ms.project_id
      where mi.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );

create policy "own materials-usage photos insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'materials-usage'
    and exists (
      select 1 from public.materials_items mi
      join public.materials_sections ms on ms.id = mi.section_id
      join public.projects p on p.id = ms.project_id
      where mi.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );

create policy "own materials-usage photos update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'materials-usage'
    and exists (
      select 1 from public.materials_items mi
      join public.materials_sections ms on ms.id = mi.section_id
      join public.projects p on p.id = ms.project_id
      where mi.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );

create policy "own materials-usage photos delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'materials-usage'
    and exists (
      select 1 from public.materials_items mi
      join public.materials_sections ms on ms.id = mi.section_id
      join public.projects p on p.id = ms.project_id
      where mi.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );
