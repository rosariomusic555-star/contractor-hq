-- ContractorHQ — Contractor-side change order approval. Run AFTER 0138.
--
-- Same idea as 0133 for quotes: the client agreed on paper / in person, and
-- the contractor records it in the app. Everything a client approval does
-- happens the same way, because it all hangs off the status change to
-- 'approved' (triggers): the contract value (approved change orders are
-- summed live), features (0107 apply_change_order_to_features), schedule
-- impact (0071), document version snapshot (0113), selections change
-- requests (0115). This function only sets the approval and logs it.
--
--   change_orders.approved_manually_by   who recorded it — null = client approved
--   change_orders.approval_method        in_person | paper | other
--   change_orders.approval_note          optional note

alter table public.change_orders add column if not exists approved_manually_by text;
alter table public.change_orders add column if not exists approval_method text check (approval_method in ('in_person', 'paper', 'other'));
alter table public.change_orders add column if not exists approval_note text;

create or replace function public.contractor_approve_change_order(
  p_change_order_id uuid,
  p_method text,
  p_note text,
  p_signed_by text,
  p_approved_on date,
  p_recorded_by text
)
returns void language plpgsql security definer set search_path = public as $$
declare co record; v_method_label text; v_at timestamptz;
begin
  select * into co from public.change_orders where id = p_change_order_id and user_id = auth.uid();
  if not found or public.is_employee() then raise exception 'Change order not found.'; end if;
  if co.status not in ('draft', 'sent') then raise exception 'Only a draft or sent change order can be marked approved.'; end if;
  if p_method not in ('in_person', 'paper', 'other') then raise exception 'Pick how the client approved.'; end if;
  v_method_label := case p_method when 'in_person' then 'in person' when 'paper' then 'on paper' else 'another way' end;
  v_at := coalesce(p_approved_on::timestamptz + interval '12 hours', now());

  update public.change_orders
     set status = 'approved',
         approved_at = v_at,
         signed_at = v_at,
         signed_by = nullif(trim(p_signed_by), ''),
         approved_by = nullif(trim(p_signed_by), ''),
         approved_ip = null,
         approved_manually_by = coalesce(nullif(trim(p_recorded_by), ''), 'Contractor'),
         approval_method = p_method,
         approval_note = nullif(trim(p_note), '')
   where id = p_change_order_id;

  insert into public.project_events (project_id, user_id, kind, summary, meta)
  values (co.project_id, co.user_id, 'change_order_approved',
          'Change order approved ' || v_method_label || coalesce(' by ' || nullif(trim(p_signed_by), ''), '') || ' — recorded in the app',
          jsonb_build_object('change_order_id', co.id, 'method', p_method, 'manual', true));
end;
$$;
revoke all on function public.contractor_approve_change_order(uuid, text, text, text, date, text) from public, anon;
grant execute on function public.contractor_approve_change_order(uuid, text, text, text, date, text) to authenticated;
