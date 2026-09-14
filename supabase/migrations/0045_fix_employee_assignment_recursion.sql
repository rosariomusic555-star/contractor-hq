-- ContractorHQ — fixes "infinite recursion detected in policy for
-- relation employee_project_assignments" (Postgres error 42P17), hit as
-- soon as an owner tries to assign a project to an employee. Root cause:
-- employee_project_assignments' own INSERT/UPDATE check (0043) reads
-- `projects` to confirm the project belongs to the caller — but
-- `projects` itself now has an employee-visibility policy that reads
-- BACK into employee_project_assignments. That's a two-table circular
-- policy reference: Postgres's RLS planner refuses it outright (even
-- though the actual data recursion always terminates after one hop,
-- planning can't statically bound it).
--
-- Standard fix: move the project-ownership check into a SECURITY
-- DEFINER function. It evaluates against `projects` as the function's
-- owner (which bypasses RLS as the table owner), not as the calling
-- user, so it never re-triggers projects' own policies — breaking the
-- cycle without weakening the check itself (still verifies the project
-- actually belongs to the caller before letting an assignment reference
-- it, so an owner can never assign an employee onto another owner's
-- project).

create or replace function public.owns_project(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.projects p where p.id = p_project_id and p.user_id = auth.uid()
  );
$$;

revoke all on function public.owns_project(uuid) from public;
grant execute on function public.owns_project(uuid) to authenticated;

drop policy "own" on public.employee_project_assignments;

create policy "own" on public.employee_project_assignments for all to authenticated
  using (
    exists (select 1 from public.employees e where e.id = employee_id and e.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.employees e where e.id = employee_id and e.owner_user_id = auth.uid())
    and public.owns_project(project_id)
  );
