-- ContractorHQ — Invoice page redesign: itemised invoices + "viewed".
-- Run AFTER 0096.
--
-- 1. invoice_items — an invoice's own editable line items. An invoice with
--    lines has amount = sum(quantity × unit_price) (the app writes the sum
--    to invoices.amount on save, so every existing total/revenue/aging
--    reader keeps working unchanged). An invoice with no lines keeps its
--    single hand-entered amount, exactly as before.
-- 2. invoices.viewed_at — first time the client opened the share link,
--    for the draft → sent → viewed → paid timeline. Set by
--    mark_invoice_viewed(); never by the owner viewing their own link.
-- 3. get_shared_invoice — same as 0012, plus the line items so the client
--    sees an itemised invoice.

create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  description text not null default '',
  quantity    numeric not null default 1,
  unit_price  numeric not null default 0,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

alter table public.invoice_items enable row level security;

drop policy if exists "own" on public.invoice_items;
create policy "own" on public.invoice_items for all to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.user_id = auth.uid()))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.user_id = auth.uid()));

revoke all on public.invoice_items from anon;

alter table public.invoices add column if not exists viewed_at timestamptz;

create or replace function public.mark_invoice_viewed(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invoices
     set viewed_at = now()
   where p_token is not null
     and share_token = p_token
     and viewed_at is null
     and status <> 'draft'
     and (auth.uid() is null or auth.uid() <> user_id);
end;
$$;

revoke execute on function public.mark_invoice_viewed(uuid) from public;
grant execute on function public.mark_invoice_viewed(uuid) to anon, authenticated;

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
    'client',  case when c.id is null then null else jsonb_build_object('name', c.name) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'description', it.description,
               'quantity', it.quantity,
               'unit_price', it.unit_price
             ) order by it.sort_order)
        from public.invoice_items it
       where it.invoice_id = inv.id
    ), '[]'::jsonb)
  )
  from public.invoices inv
  left join public.projects p on p.id = inv.project_id
  left join public.clients  c on c.id = p.client_id
  where p_token is not null
    and inv.share_token = p_token;
$$;

revoke execute on function public.get_shared_invoice(uuid) from public;
grant execute on function public.get_shared_invoice(uuid) to anon, authenticated;
