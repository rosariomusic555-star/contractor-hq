-- ContractorHQ — payments (0111) follow-up. Run AFTER 0111.
--
-- Deleting a project cascades to its payments, and from them to their
-- allocations. The allocation audit trigger then tried to log an
-- 'unapplied' event for a payment that was already gone, so the foreign key
-- failed and the whole project delete was rejected. Skip the audit row when
-- the payment itself is being deleted, since its events go with it.

create or replace function public.payment_allocations_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_num text;
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.payments where id = old.payment_id) then
    return null;
  end if;
  select invoice_number into v_num from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if tg_op = 'INSERT' then
    insert into public.payment_events (payment_id, action, changes)
    values (new.payment_id, 'applied', jsonb_build_object('invoice', v_num, 'amount', new.amount));
  elsif tg_op = 'UPDATE' then
    insert into public.payment_events (payment_id, action, changes)
    values (new.payment_id, 'applied', jsonb_build_object('invoice', v_num, 'amount', jsonb_build_object('from', old.amount, 'to', new.amount)));
  else
    insert into public.payment_events (payment_id, action, changes)
    values (old.payment_id, 'unapplied', jsonb_build_object('invoice', v_num, 'amount', old.amount));
  end if;
  return null;
end;
$$;

select 'payment_allocations_audit updated' as result;
