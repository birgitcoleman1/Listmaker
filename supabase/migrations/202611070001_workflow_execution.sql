-- ADDITIVE migration for the supplied, already executed initial schema.
-- Review and execute once. Does not recreate existing tables or rerun initial SQL.
begin;
create unique index one_active_enrollment_per_contact on public.workflow_enrollments(organization_id,contact_id) where status='active';
create function public.manage_enrollment(p_org uuid,p_contact uuid,p_user uuid,p_stop boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_workflow uuid; v_category text; v_step record; v_delay integer:=0;
begin
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user and role in ('owner','admin','member')) then raise exception 'Access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_contact::text,0));
 select category into v_category from public.contacts where id=p_contact and organization_id=p_org;
 if not found then raise exception 'Contact not found'; end if;
 if p_stop then
 update public.workflow_jobs set status='cancelled' where enrollment_id in(select id from public.workflow_enrollments where organization_id=p_org and contact_id=p_contact and status='active') and status='pending';
 update public.workflow_enrollments set status='stopped' where organization_id=p_org and contact_id=p_contact and status='active'; return null;
 end if;
 select id into v_id from public.workflow_enrollments where organization_id=p_org and contact_id=p_contact and status='active';
 if v_id is not null then return v_id; end if;
 if (select count(*) from public.workflows where organization_id=p_org and category_code=v_category and enabled)<>1 then raise exception 'Enable exactly one workflow for this category'; end if;
 select id into v_workflow from public.workflows where organization_id=p_org and category_code=v_category and enabled;
 if not exists(select 1 from public.workflow_steps where workflow_id=v_workflow) then raise exception 'Add workflow steps first'; end if;
 if exists(select 1 from public.workflow_steps where workflow_id=v_workflow and kind='email' and template_id is null) then raise exception 'Email steps need templates'; end if;
 insert into public.workflow_enrollments(organization_id,workflow_id,contact_id,status) values(p_org,v_workflow,p_contact,'active') returning id into v_id;
 for v_step in select * from public.workflow_steps where workflow_id=v_workflow order by step_order loop
 v_delay:=v_delay+v_step.delay_days;
 insert into public.workflow_jobs(organization_id,enrollment_id,step_id,run_at,idempotency_key) values(p_org,v_id,v_step.id,now()+make_interval(days=>v_delay),v_id::text||':'||v_step.id::text);
 end loop;
 return v_id;
end $$;
revoke all on function public.manage_enrollment(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.manage_enrollment(uuid,uuid,uuid,boolean) to service_role;
create function public.claim_workflow_jobs() returns setof public.workflow_jobs language sql security definer set search_path='' as $$
 with candidates as (
 select j.id from public.workflow_jobs j
 join public.workflow_steps s on s.id=j.step_id
 where j.status='pending' and j.run_at<=now()
 and not exists(select 1 from public.workflow_jobs prev join public.workflow_steps ps on ps.id=prev.step_id where prev.enrollment_id=j.enrollment_id and ps.step_order<s.step_order and prev.status<>'done')
 order by j.run_at limit 10 for update of j skip locked
 ) update public.workflow_jobs set status='processing' where id in(select id from candidates) returning *;
$$;
revoke all on function public.claim_workflow_jobs() from public,anon,authenticated;
grant execute on function public.claim_workflow_jobs() to service_role;
-- Existing policies allowed viewers to write. Restrict write policies to actual writers.
create function public.is_org_writer(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organization_members where organization_id=p_org and user_id=(select auth.uid()) and role in ('owner','admin','member'))$$;
revoke all on function public.is_org_writer(uuid) from public;
grant execute on function public.is_org_writer(uuid) to authenticated;
do $$declare t text;begin foreach t in array array['companies','contacts','events','contact_events','categories','deals','tasks','activities','email_templates','workflows','workflow_steps'] loop
 execute format('drop policy %I on public.%I',t||'_insert',t);
 execute format('drop policy %I on public.%I',t||'_update',t);
 execute format('drop policy %I on public.%I',t||'_delete',t);
 execute format('create policy %I on public.%I for insert to authenticated with check(public.is_org_writer(organization_id))',t||'_insert',t);
 execute format('create policy %I on public.%I for update to authenticated using(public.is_org_writer(organization_id)) with check(public.is_org_writer(organization_id))',t||'_update',t);
 execute format('create policy %I on public.%I for delete to authenticated using(public.is_org_writer(organization_id))',t||'_delete',t);
 end loop;end $$;
-- Keep queued jobs tied to the reviewed step definitions.
create function public.protect_enrolled_steps() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.workflow_enrollments where workflow_id=old.workflow_id and status='active') then raise exception 'Stop active enrollments before editing steps';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.protect_enrolled_steps() from public;
create trigger protect_enrolled_steps before update or delete on public.workflow_steps for each row execute function public.protect_enrolled_steps();
commit;
