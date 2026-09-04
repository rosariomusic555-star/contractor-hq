-- ContractorHQ — record the client's typed name when they approve a quote.
-- Run AFTER 0003/0004/0005/0006.

alter table public.quotes add column if not exists signed_by text;

-- sign_quote now takes the signer's name and also promotes the project to
-- 'approved' (SECURITY DEFINER, so it can update the owner's project row
-- even though the caller is anon).
drop function if exists public.sign_quote(uuid);

create or replace function public.sign_quote(p_token uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
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
  returning project_id into v_project_id;

  if v_project_id is not null then
    update public.projects set status = 'approved' where id = v_project_id;
  end if;
end $$;

revoke execute on function public.sign_quote(uuid, text) from public;
grant execute on function public.sign_quote(uuid, text) to anon, authenticated;
