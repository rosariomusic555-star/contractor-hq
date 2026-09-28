-- ContractorHQ — Contractor-side quote approval. Run AFTER 0001-0132.
--
-- The client signed on paper / agreed in person: the contractor marks the
-- quote Approved in the app. Same downstream effects as a client approval
-- in the Client Hub — this function does exactly what sign_quote /
-- portal_approve_quote do (project → scheduled, "quote_signed" event,
-- apply_quote_signed → sibling options not selected + opportunity Won
-- transaction), and the status-change triggers that already fire on any
-- approval run too (Client Selections lock + history, add-on quotes join
-- the job, overhead rate copied to the project, document version snapshot).
--
--   quotes.approved_manually_by   who recorded it (the contractor's name) — null = client approved
--   quotes.approval_method        in_person | paper | other
--   quotes.approval_note          optional note

alter table public.quotes add column if not exists approved_manually_by text;
alter table public.quotes add column if not exists approval_method text check (approval_method in ('in_person', 'paper', 'other'));
alter table public.quotes add column if not exists approval_note text;

create or replace function public.contractor_approve_quote(
  p_quote_id uuid,
  p_method text,
  p_note text,
  p_signed_by text,
  p_approved_on date,
  p_recorded_by text
)
returns void language plpgsql security definer set search_path = public as $$
declare q record; v_method_label text;
begin
  select * into q from public.quotes where id = p_quote_id and user_id = auth.uid();
  if not found or public.is_employee() then raise exception 'Quote not found.'; end if;
  if q.status not in ('draft', 'sent') then raise exception 'Only a draft or sent quote can be marked approved.'; end if;
  if p_method not in ('in_person', 'paper', 'other') then raise exception 'Pick how the client approved.'; end if;
  v_method_label := case p_method when 'in_person' then 'in person' when 'paper' then 'on paper' else 'another way' end;

  update public.quotes
     set status = 'approved',
         signed_at = coalesce(p_approved_on::timestamptz + interval '12 hours', now()),
         signed_by = nullif(trim(p_signed_by), ''),
         signed_ip = null,
         approved_manually_by = coalesce(nullif(trim(p_recorded_by), ''), 'Contractor'),
         approval_method = p_method,
         approval_note = nullif(trim(p_note), '')
   where id = p_quote_id;

  if q.project_id is not null then
    update public.projects set status = 'scheduled' where id = q.project_id and status = 'estimating';
    insert into public.project_events (project_id, user_id, kind, summary, meta)
    values (q.project_id, q.user_id, 'quote_signed',
            'Quote approved ' || v_method_label || coalesce(' by ' || nullif(trim(p_signed_by), ''), '') || ' — recorded in the app',
            jsonb_build_object('method', p_method, 'manual', true));
  end if;

  perform public.apply_quote_signed(p_quote_id);
end;
$$;
revoke all on function public.contractor_approve_quote(uuid, text, text, text, date, text) from public, anon;
grant execute on function public.contractor_approve_quote(uuid, text, text, text, date, text) to authenticated;

-- The activity log says how it was approved (0117's function, summary only).
create or replace function public.quote_activity_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare n record; v_kind text;
begin
  if new.status = 'sent' and old.status is distinct from 'sent' and old.status <> 'approved' then
    update public.quotes set sent_at = now() where id = new.id;
  end if;
  if new.status in ('approved', 'declined') and old.status is distinct from new.status then
    v_kind := case when new.status = 'approved' then 'approved' else 'declined' end;
    insert into public.quote_activity_events (user_id, quote_id, version, kind, summary, detail)
    values (new.user_id, new.id, public._quote_version(new.id), v_kind,
            case when v_kind = 'approved' and new.approved_manually_by is not null
                   then 'Approved ' || case new.approval_method when 'in_person' then 'in person' when 'paper' then 'on paper' else '' end
                        || coalesce(' by ' || new.signed_by, '') || ' — recorded by ' || new.approved_manually_by
                 when v_kind = 'approved' then 'Approved and signed' || coalesce(' by ' || new.signed_by, '')
                 else 'Declined' || coalesce(' — "' || left(new.decline_comment, 120) || '"', '') end,
            jsonb_build_object('total', public.quote_committed_total(new.id), 'manual', new.approved_manually_by is not null));
    update public.quotes set last_activity_at = now() where id = new.id;
    if not public._is_quote_team(new.user_id) then
      select * into n from public._quote_names(new.id);
      perform public._notify(new.user_id, 'quote_' || v_kind, 'quote_decided',
              coalesce(n.client_name, 'Your client') || case when v_kind = 'approved' then ' signed' else ' declined' end
                || ' your ' || coalesce(n.project_name || ' ', '') || 'quote',
              case when v_kind = 'approved' then 'Total $' || to_char(public.quote_committed_total(new.id), 'FM999,999,990.00') else new.decline_comment end,
              new.id, v_kind || ':' || new.id || ':' || coalesce(public._quote_version(new.id), 0));
    end if;
  end if;
  return null;
end;
$$;
