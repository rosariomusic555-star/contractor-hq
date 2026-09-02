-- ContractorHQ auth + per-user Row Level Security
-- Run in the Supabase dashboard SQL editor AFTER 0001_init.sql.
--
-- This clears the demo data (it has no owner) and makes every row belong to
-- an authenticated user, enforced by RLS.

do $$
declare
  tbl text;
begin
  foreach tbl in array array['clients','quotes','invoices','expenses'] loop
    execute format('delete from public.%I', tbl);

    execute format(
      'alter table public.%I
         add column if not exists user_id uuid not null default auth.uid()
         references auth.users (id) on delete cascade', tbl);

    execute format(
      'create index if not exists %I on public.%I (user_id)',
      tbl || '_user_id_idx', tbl);

    -- Replace the permissive placeholder policy with per-user isolation.
    execute format('drop policy if exists "public read/write" on public.%I', tbl);
    execute format('drop policy if exists "own rows" on public.%I', tbl);
    execute format(
      'create policy "own rows" on public.%I
         for all to authenticated
         using (user_id = auth.uid())
         with check (user_id = auth.uid())', tbl);

    -- Logged-out (anon) requests can no longer touch these tables.
    execute format('revoke all on public.%I from anon', tbl);
  end loop;
end $$;
