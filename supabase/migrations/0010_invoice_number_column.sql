-- ContractorHQ — store the client-visible invoice number on the row itself,
-- instead of computing it on every read.
--
-- 0009 computed "INV-00X" server-side, inside get_shared_invoice, because
-- the public share page can't list an invoice's sibling invoices under RLS
-- and so couldn't derive the ordinal the way the owner-side app did (by
-- sorting its own full invoice list). Storing it once, at creation time,
-- is simpler and freezes the number permanently — it won't shift if an
-- earlier invoice on the project is later deleted.
-- Run AFTER 0009_invoice_number.sql.

alter table public.invoices add column invoice_number text;

-- Backfill any invoices that already exist, using the same order/tie-break
-- rule the app has used all along: created_at ascending, then id ascending.
with numbered as (
  select id, row_number() over (
    partition by project_id order by created_at, id
  ) as n
  from public.invoices
)
update public.invoices i
   set invoice_number = 'INV-' || lpad(numbered.n::text, 3, '0')
  from numbered
 where numbered.id = i.id;

-- get_shared_invoice goes back to the plain form — invoice_number is now a
-- real column, so to_jsonb(inv) carries it automatically. No more computed
-- ordinal subquery.
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

revoke execute on function public.get_shared_invoice(uuid) from public;
grant execute on function public.get_shared_invoice(uuid) to anon, authenticated;
