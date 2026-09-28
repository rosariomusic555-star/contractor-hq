-- ContractorHQ — A quote can only be signed while it's out with the client. Run AFTER 0140.
--
-- sign_quote (the share-link signature, latest in 0075) only checked
-- signed_at is null — so a DRAFT (Preview creates a working link) or a
-- DECLINED quote could be signed from its link, running the whole Won
-- transaction (quote lock, deposit invoice, other quotes marked not
-- selected). The Client Hub's portal_approve_quote already required
-- status = 'sent'; the link now does too. Everything else is 0075's
-- function unchanged.

create or replace function public.sign_quote(p_token uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id   uuid;
  v_project_id uuid;
  v_user_id    uuid;
  v_signed_by  text;
begin
  if p_token is null then
    return;
  end if;

  update public.quotes
     set signed_at = now(),
         status = 'approved',
         signed_by = nullif(trim(p_signed_by), '')
   where share_token = p_token
     and signed_at is null
     and status = 'sent'
  returning id, project_id, user_id, signed_by
      into v_quote_id, v_project_id, v_user_id, v_signed_by;

  if v_quote_id is null then
    -- Already signed (a double tap): nothing to do. Anything else — a
    -- draft opened from Preview, a declined quote, a revoked link — can't be
    -- signed; say so instead of silently doing nothing.
    if exists (select 1 from public.quotes where share_token = p_token and status = 'approved') then
      return;
    end if;
    raise exception 'This quote isn''t open for signing.';
  end if;

  if v_project_id is not null then
    update public.projects set status = 'scheduled' where id = v_project_id and status = 'estimating';

    insert into public.project_events (project_id, user_id, kind, summary, meta)
    values (
      v_project_id,
      v_user_id,
      'quote_signed',
      'Quote approved' || coalesce(' by ' || v_signed_by, ''),
      '{}'::jsonb
    );
  end if;

  if v_quote_id is not null then
    perform public.apply_quote_signed(v_quote_id);
  end if;
end $$;

revoke execute on function public.sign_quote(uuid, text) from public;
grant execute on function public.sign_quote(uuid, text) to anon, authenticated;
