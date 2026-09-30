-- 0153 — Client Hub sign-in: one stored form for client emails.
--
-- The Hub matches a signed-in client to their records by email
-- (portal_email() = lower(trim(jwt email)) against lower(clients.email)),
-- and portal-request-link looks the email up the same way. A client email
-- saved with stray spaces (" pat@x.com") never matched, so that client
-- could get a link but land on "no project found" — or get no link at all.
--
-- Store every client email trimmed + lowercased (blank → null), keep it
-- that way with a trigger, and backfill existing rows. Every existing
-- lower(c.email) comparison then matches exactly; nothing else changes.

create or replace function public.normalize_client_email()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  return new;
end;
$$;

drop trigger if exists clients_normalize_email on public.clients;
create trigger clients_normalize_email
  before insert or update of email on public.clients
  for each row execute function public.normalize_client_email();

update public.clients
   set email = nullif(lower(trim(email)), '')
 where email is distinct from nullif(lower(trim(email)), '');
