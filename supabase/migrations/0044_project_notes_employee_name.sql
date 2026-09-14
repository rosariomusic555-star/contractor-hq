-- ContractorHQ — Employee-Only Mode follow-up: a project_note needs to
-- display WHICH employee wrote it once a project has more than one
-- employee assigned. Employees deliberately can only read their OWN row
-- in `employees` (0043) — not each other's — so resolving employee_id to
-- a name at read time would require a new cross-employee RLS policy
-- (broader access than intended, since employees.email would come along
-- with it). Simpler and more private: snapshot the author's name onto the
-- note itself at write time. This also reads more naturally as a
-- historical log — the name shown never silently changes if that
-- employee is later renamed or deactivated.

alter table public.project_notes add column employee_name text;
