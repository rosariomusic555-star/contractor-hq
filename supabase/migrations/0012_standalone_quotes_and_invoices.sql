-- ContractorHQ — support quotes and invoices that aren't tied to a project.
--
-- quotes.project_id is already nullable (confirmed live). This migration:
--   1. Adds quotes.client_id, so a standalone quote (no project) can still
--      have a client — project-linked quotes can leave it null and fall
--      back to the project's client, or set it directly.
--   2. Makes invoices.project_id nullable too, for standalone invoices.
--   3. Fixes get_shared_quote / get_shared_invoice: both previously INNER
--      JOINed projects, so a share_token on a project-less quote/invoice
--      silently returned null (confirmed live — a real bug, not
--      hypothetical). Both now LEFT JOIN, and return `project`/`client`
--      as a real null (not an object with a null name) when absent.
--      get_shared_quote resolves client via
--      coalesce(quote.client_id, project.client_id).

alter table public.quotes add column if not exists client_id
  uuid references public.clients (id) on delete set null;
create index if not exists quotes_client_id_idx on public.quotes (client_id);

alter table public.invoices alter column project_id drop not null;

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
  left join public.projects p on p.id = q.project_id
  left join public.clients  c on c.id = coalesce(q.client_id, p.client_id)
  where p_token is not null
    and q.share_token = p_token;
$$;

create or replace function public.get_shared_invoice(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'invoice', to_jsonb(inv) - 'user_id' - 'share_token',
    'project', case when p.id is null then null else jsonb_build_object('name', p.name) end,
    'client',  case when c.id is null then null else jsonb_build_object('name', c.name) end
  )
  from public.invoices inv
  left join public.projects p on p.id = inv.project_id
  left join public.clients  c on c.id = p.client_id
  where p_token is not null
    and inv.share_token = p_token;
$$;

-- Grants unchanged, but re-assert defensively since create or replace can
-- run against a fresh function definition in some restore scenarios.
revoke execute on function public.get_shared_quote(uuid) from public;
revoke execute on function public.get_shared_invoice(uuid) from public;
grant execute on function public.get_shared_quote(uuid) to anon, authenticated;
grant execute on function public.get_shared_invoice(uuid) to anon, authenticated;
