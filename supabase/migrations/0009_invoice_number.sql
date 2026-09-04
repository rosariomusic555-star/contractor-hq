-- ContractorHQ — expose a stable, client-visible invoice number ("INV-00X")
-- on the shared invoice RPC.
--
-- The owner-side app computes this by sorting its own invoices list (RLS
-- lets an owner see every invoice on their own projects), but the public
-- share page only ever fetches ONE invoice via get_shared_invoice, so the
-- ordinal has to be computed here, server-side — using the same tie-break
-- rule the app uses (created_at ascending, then id ascending).
-- Run AFTER 0003_projects_schema.sql / 0004_share_functions.sql.

create or replace function public.get_shared_invoice(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'invoice', (to_jsonb(inv) - 'user_id' - 'share_token') || jsonb_build_object(
      'number', (
        select count(*)
        from public.invoices i2
        where i2.project_id = inv.project_id
          and (i2.created_at, i2.id) <= (inv.created_at, inv.id)
      )
    ),
    'project', jsonb_build_object('name', p.name),
    'client',  jsonb_build_object('name', c.name)
  )
  from public.invoices inv
  join public.projects p on p.id = inv.project_id
  left join public.clients c on c.id = p.client_id
  where p_token is not null
    and inv.share_token = p_token;
$$;

-- Function signature is unchanged, but re-grant defensively in case this
-- migration is ever run standalone against a fresh function definition.
revoke execute on function public.get_shared_invoice(uuid) from public;
grant execute on function public.get_shared_invoice(uuid) to anon, authenticated;
