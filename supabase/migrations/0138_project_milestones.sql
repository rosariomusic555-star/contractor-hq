-- ContractorHQ — Per-project milestones for progress updates. Run AFTER 0137.
--
-- Milestones came only from the build type (app defaults, or the
-- contractor's presets in Settings › Progress updates — progress_settings,
-- 0126). Now each project feature can have its own list:
--   project_features.milestones  null = use the presets; a list = this job's own
-- Edited on the project's Progress updates card (add / remove / rename /
-- reorder, reset to the preset). Used by the owner's and the crew's "Post
-- update" and by the Client Hub's milestone tracker.

alter table public.project_features add column if not exists milestones text[];

-- Client Hub: each feature carries its own list (0126's function, + milestones).
create or replace function public.client_progress_json(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id, 'date', coalesce(u.shared_at, u.created_at), 'text', u.note, 'milestone', u.milestone,
               'feature', u.feature_id,
               'photos', coalesce((select jsonb_agg(pi.storage_path order by pi.created_at) from public.project_images pi
                                    where pi.progress_update_id = u.id and pi.client_visible), '[]'::jsonb),
               'liked', exists (select 1 from public.progress_update_reactions r where r.update_id = u.id),
               'comments', coalesce((select jsonb_agg(jsonb_build_object('author', c.author, 'name', c.author_name, 'body', c.body, 'created_at', c.created_at) order by c.created_at)
                                       from public.progress_update_comments c where c.update_id = u.id), '[]'::jsonb)
             ) order by coalesce(u.shared_at, u.created_at) desc)
        from public.progress_updates u where u.project_id = p_project_id and u.status = 'shared'), '[]'::jsonb),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'label', coalesce(nullif(f.label, ''), cat.name, 'Feature'), 'category', cat.name, 'milestones', to_jsonb(f.milestones)) order by f.sort_order)
        from public.project_features f left join public.categories cat on cat.id = f.category_id
       where f.project_id = p_project_id and f.status = 'active'), '[]'::jsonb),
    'milestone_presets', coalesce((select ps.milestones from public.progress_settings ps join public.projects p on p.user_id = ps.user_id where p.id = p_project_id), '{}'::jsonb),
    'before_after', coalesce((
      select jsonb_agg(jsonb_build_object('feature', x.feature_id, 'before', x.before_path, 'after', x.after_path))
        from (
          select pi.ba_feature_id as feature_id,
                 (select b.storage_path from public.project_images b where b.project_id = p_project_id and b.ba_feature_id is not distinct from pi.ba_feature_id and b.ba_role = 'before' order by b.created_at desc limit 1) as before_path,
                 (select a.storage_path from public.project_images a where a.project_id = p_project_id and a.ba_feature_id is not distinct from pi.ba_feature_id and a.ba_role = 'after' order by a.created_at desc limit 1) as after_path
            from public.project_images pi where pi.project_id = p_project_id and pi.ba_role is not null
           group by pi.ba_feature_id
        ) x where x.before_path is not null and x.after_path is not null), '[]'::jsonb),
    'marketing_ok', (select c.marketing_ok from public.projects p join public.clients c on c.id = p.client_id where p.id = p_project_id)
  );
$$;

-- Crew "Post update": the contractor's presets + this job's own lists. (The
-- crew's post sheet used the app defaults only — it couldn't read
-- progress_settings.) Assigned active crew members only (_crew_can_see, 0125).
create or replace function public.crew_milestones(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._crew_can_see(p_project_id) then return null; end if;
  return jsonb_build_object(
    'presets', coalesce((select ps.milestones from public.progress_settings ps join public.projects p on p.user_id = ps.user_id where p.id = p_project_id), '{}'::jsonb),
    'features', coalesce((select jsonb_object_agg(f.id, to_jsonb(f.milestones)) from public.project_features f
                           where f.project_id = p_project_id and f.milestones is not null), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.crew_milestones(uuid) from public, anon;
grant execute on function public.crew_milestones(uuid) to authenticated;
