-- ContractorHQ — client-facing share links.
-- Run AFTER 0003_projects_schema.sql.
--
-- Base-table RLS is strictly owner-only (0003). Anonymous, client-facing access
-- to a shared quote/invoice happens ONLY through these SECURITY DEFINER
-- functions, which return exactly one row matched on the exact share_token.
-- RLS cannot express "the token in the visitor's URL", so a function is the
-- correct boundary.

-- ---------------------------------------------------------------------------
-- Read a shared quote (quote + sections + items + display names)
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_quote(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'quote',    to_jsonb(q) - 'user_id' - 'share_token',
    'project',  jsonb_build_object('name', p.name),
    'client',   jsonb_build_object('name', c.name),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'is_optional', s.is_optional,
          'sort_order', s.sort_order,
          'items', coalesce((
            select jsonb_agg(to_jsonb(i) order by i.sort_order, i.name)
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
  join public.projects p on p.id = q.project_id
  left join public.clients c on c.id = p.client_id
  where p_token is not null
    and q.share_token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- Read a shared invoice
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_invoice(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'invoice', to_jsonb(inv) - 'user_id' - 'share_token',
    'project', jsonb_build_object('name', p.name),
    'client',  jsonb_build_object('name', c.name)
  )
  from public.invoices inv
  join public.projects p on p.id = inv.project_id
  left join public.clients c on c.id = p.client_id
  where p_token is not null
    and inv.share_token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- Client toggles an optional line item on/off
-- ---------------------------------------------------------------------------
create or replace function public.set_quote_item_selection(
  p_token uuid, p_item_id uuid, p_selected bool
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null then
    return;
  end if;
  update public.quote_items i
     set client_selected = p_selected
    from public.quote_sections s
    join public.quotes q on q.id = s.quote_id
   where i.id = p_item_id
     and s.id = i.section_id
     and q.share_token = p_token
     and i.is_optional;          -- only optional items are client-toggleable
end $$;

-- ---------------------------------------------------------------------------
-- Client accepts the quote
-- ---------------------------------------------------------------------------
create or replace function public.sign_quote(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null then
    return;
  end if;
  update public.quotes
     set signed_at = now(),
         status = 'accepted'
   where share_token = p_token
     and signed_at is null;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: anon may execute ONLY these four functions.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.get_shared_quote(uuid),
  public.get_shared_invoice(uuid),
  public.set_quote_item_selection(uuid, uuid, bool),
  public.sign_quote(uuid)
from public;

grant execute on function
  public.get_shared_quote(uuid),
  public.get_shared_invoice(uuid),
  public.set_quote_item_selection(uuid, uuid, bool),
  public.sign_quote(uuid)
to anon, authenticated;
