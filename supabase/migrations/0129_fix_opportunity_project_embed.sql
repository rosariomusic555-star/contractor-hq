-- ContractorHQ — URGENT fix for 0127. Run right away.
--
-- 0127 added opportunities.source_project_id as a foreign key to projects.
-- That gave PostgREST two relationships between projects and
-- opportunities, so every query that embeds one in the other without a
-- hint — the app's project list (PROJECT_SELECT's opportunities(id, stage)),
-- opportunity → project embeds, and the deployed assistant-chat function —
-- fails with "more than one relationship was found".
--
-- Fix: keep the column, drop the FK constraint. It's only a back-reference
-- to the original job for a maintenance lead; nothing embeds through it, and
-- a stale id just shows no link. Every existing query works again unchanged.

do $$
declare c text;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
     where con.conrelid = 'public.opportunities'::regclass
       and con.contype = 'f'
       and a.attname = 'source_project_id'
  loop
    execute format('alter table public.opportunities drop constraint %I', c);
  end loop;
end $$;

-- PostgREST caches relationships — reload so the fix takes effect now.
notify pgrst, 'reload schema';
