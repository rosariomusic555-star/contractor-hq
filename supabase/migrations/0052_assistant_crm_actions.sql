-- ContractorHQ — CRM Phase 7: AI Assistant integration. Run AFTER 0001-0051.
--
-- assistant_action_log (0030) gains a nullable created_task_id so a
-- confirmed create_task action (the CRM write-proposal tool, mirroring
-- create_expense exactly) has somewhere to record what it created —
-- same additive, one-column-per-action-type convention as the existing
-- project_id/amount/expense_category_id/created_expense_id columns.

alter table public.assistant_action_log add column created_task_id uuid references public.tasks (id) on delete set null;
