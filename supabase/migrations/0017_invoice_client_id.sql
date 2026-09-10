-- ContractorHQ — support a client on a standalone invoice.
--
-- invoices.project_id was already nullable (0012), but the client was only
-- ever resolved through the project (project_id -> projects.client_id) —
-- a standalone invoice had no way to carry a client at all. Mirrors what
-- 0012 already did for quotes.client_id:
--   1. Adds invoices.client_id, independent of any project — a project-
--      linked invoice can leave it null and fall back to the project's
--      client, or set it directly to override.
--   2. get_shared_invoice now resolves client via
--      coalesce(inv.client_id, project.client_id), same as get_shared_quote.

alter table public.invoices add column if not exists client_id
  uuid references public.clients (id) on delete set null;
create index if not exists invoices_client_id_idx on public.invoices (client_id);

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
  left join public.clients  c on c.id = coalesce(inv.client_id, p.client_id)
  where p_token is not null
    and inv.share_token = p_token;
$$;

revoke execute on function public.get_shared_invoice(uuid) from public;
grant execute on function public.get_shared_invoice(uuid) to anon, authenticated;
