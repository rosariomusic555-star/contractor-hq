-- ContractorHQ — 0045's SECURITY DEFINER fix didn't actually break the
-- recursion: `owns_project` was `language sql`, and the Postgres planner
-- is allowed to INLINE simple SQL-language functions directly into the
-- calling query. Once inlined, the function body's reference to
-- `projects` is evaluated in the CALLER's context again, not the
-- function owner's — silently erasing the SECURITY DEFINER boundary that
-- was supposed to bypass RLS and break the cycle. `language plpgsql`
-- functions are never inlined by the planner (they're always executed as
-- an opaque call), which is what actually preserves the privilege
-- boundary here.

create or replace function public.owns_project(p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result boolean;
begin
  select exists (
    select 1 from public.projects p where p.id = p_project_id and p.user_id = auth.uid()
  ) into result;
  return result;
end;
$$;
