-- ContractorHQ — Supabase Storage bucket for user-uploaded images (quote
-- line-item photos, project progress photos). Run AFTER 0001–0022.
--
-- Private bucket. Storage RLS mirrors the app's existing security model:
-- owners can read/write their own images; the ONE public carve-out is that
-- an image on a quote line item becomes anonymously readable exactly while
-- that quote is shared (share_token is not null) — same "public access only
-- through the narrow share mechanism" philosophy as get_shared_quote /
-- get_shared_invoice, just expressed as storage.objects RLS instead of a
-- SECURITY DEFINER function (Storage doesn't support those the same way).
-- Revoking a quote's share link immediately cuts off its images too.
--
-- Path convention (encodes ownership for the RLS joins below):
--   quote-items/{quote_item_id}/{uuid}.{ext}
--   projects/{project_id}/{uuid}.{ext}
--
-- Project images get NO anon policy at all — never public, full stop.
--
-- `storage.objects.name` is written out in full everywhere below, not as a
-- bare `name` — quote_items/quote_sections/projects all have their own
-- `name` column, and inside the EXISTS subqueries a bare `name` resolves
-- against THOSE first (ambiguous when two match, silently wrong table when
-- only one does), not against storage.objects like the top-level clause
-- would suggest.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'images', 'images', false, 15728640,  -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Owner: full read/write on their own quote-item images.
-- ---------------------------------------------------------------------------

create policy "own quote-item images select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'quote-items'
    and exists (
      select 1 from public.quote_items qi
      join public.quote_sections qs on qs.id = qi.section_id
      join public.quotes q on q.id = qs.quote_id
      where qi.id::text = (storage.foldername(storage.objects.name))[2]
        and q.user_id = auth.uid()
    )
  );

create policy "own quote-item images insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'quote-items'
    and exists (
      select 1 from public.quote_items qi
      join public.quote_sections qs on qs.id = qi.section_id
      join public.quotes q on q.id = qs.quote_id
      where qi.id::text = (storage.foldername(storage.objects.name))[2]
        and q.user_id = auth.uid()
    )
  );

create policy "own quote-item images update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'quote-items'
    and exists (
      select 1 from public.quote_items qi
      join public.quote_sections qs on qs.id = qi.section_id
      join public.quotes q on q.id = qs.quote_id
      where qi.id::text = (storage.foldername(storage.objects.name))[2]
        and q.user_id = auth.uid()
    )
  );

create policy "own quote-item images delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'quote-items'
    and exists (
      select 1 from public.quote_items qi
      join public.quote_sections qs on qs.id = qi.section_id
      join public.quotes q on q.id = qs.quote_id
      where qi.id::text = (storage.foldername(storage.objects.name))[2]
        and q.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Anon (and authenticated non-owners): read-only, quote-items prefix only,
-- only while the parent quote is currently shared.
-- ---------------------------------------------------------------------------

create policy "shared quote-item images select" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'quote-items'
    and exists (
      select 1 from public.quote_items qi
      join public.quote_sections qs on qs.id = qi.section_id
      join public.quotes q on q.id = qs.quote_id
      where qi.id::text = (storage.foldername(storage.objects.name))[2]
        and q.share_token is not null
    )
  );

-- ---------------------------------------------------------------------------
-- Owner: full read/write on their own project images. No anon policy.
-- ---------------------------------------------------------------------------

create policy "own project images select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'projects'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );

create policy "own project images insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'projects'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );

create policy "own project images update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'projects'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );

create policy "own project images delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'projects'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );
