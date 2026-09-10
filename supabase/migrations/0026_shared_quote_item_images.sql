-- ContractorHQ — expose quote line-item images (0024) on the client-facing
-- shared quote. Run AFTER 0024.
--
-- Returns each image's storage_path (not a URL) — the share page signs
-- these itself via the anon storage.objects policy from 0023, scoped to
-- exactly the images belonging to this (currently shared) quote. This
-- function is SECURITY DEFINER so it bypasses quote_item_images' RLS to
-- read the rows; the anon-facing gate that actually matters for the image
-- bytes lives on storage.objects, not here.

create or replace function public.get_shared_quote(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'quote',    to_jsonb(q) - 'user_id' - 'share_token',
    'project',  case when p.id is null then null else jsonb_build_object('name', p.name) end,
    'client',   case when c.id is null then null else jsonb_build_object('name', c.name) end,
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'is_optional', s.is_optional,
          'sort_order', s.sort_order,
          'items', coalesce((
            select jsonb_agg(
              to_jsonb(i) || jsonb_build_object(
                'images', coalesce((
                  select jsonb_agg(
                    jsonb_build_object('id', img.id, 'storage_path', img.storage_path)
                    order by img.sort_order
                  )
                  from public.quote_item_images img
                  where img.quote_item_id = i.id
                ), '[]'::jsonb)
              )
              order by i.sort_order, i.name
            )
            from public.quote_items i
            where i.section_id = s.id
          ), '[]'::jsonb)
        )
        order by s.sort_order, s.name
      )
      from public.quote_sections s
      where s.quote_id = q.id
    ), '[]'::jsonb)
  )
  from public.quotes q
  left join public.projects p on p.id = q.project_id
  left join public.clients  c on c.id = coalesce(q.client_id, p.client_id)
  where p_token is not null
    and q.share_token = p_token;
$$;

revoke execute on function public.get_shared_quote(uuid) from public;
grant execute on function public.get_shared_quote(uuid) to anon, authenticated;
