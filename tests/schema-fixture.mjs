// Contract fixture based on the supplied initial SQL. Not a production migration.
export async function seedSchema(db){
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.organizations(id uuid primary key default gen_random_uuid(),name text not null,created_at timestamptz default now());
create table public.organization_members(organization_id uuid references public.organizations(id),user_id uuid,role text,primary key(organization_id,user_id));
create function public.is_org_member(p_org uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid()) $$;`);
const definitions={
 companies:'name text not null,website text,industry text,notes text',
 contacts:"company_id uuid,first_name text not null,last_name text,email text,phone text,job_title text,category text check(category in ('A','B','C')),notes text,foreign key(organization_id,company_id) references public.companies(organization_id,id)",
 events:'name text not null,location text,starts_at date,ends_at date,notes text',
 contact_events:'contact_id uuid not null,event_id uuid not null,notes text,met_at timestamptz default now(),foreign key(organization_id,contact_id) references public.contacts(organization_id,id),foreign key(organization_id,event_id) references public.events(organization_id,id),unique(organization_id,contact_id,event_id)',
 categories:'code text,name text,reminder_days integer default 7,unique(organization_id,code)',
 deals:"contact_id uuid,company_id uuid,title text not null,value numeric(14,2) default 0,currency text default 'USD',stage text default 'new',notes text",
 tasks:"contact_id uuid,title text not null,due_at timestamptz,status text default 'open',notes text",
 activities:'contact_id uuid not null,kind text not null,description text,foreign key(organization_id,contact_id) references public.contacts(organization_id,id)',
 email_messages:"thread_id uuid,contact_id uuid,direction text not null check(direction in ('inbound','outbound')),sender_email text,recipient_email text,subject text,body text,status text default 'draft' check(status in ('draft','queued','sent','delivered','bounced','failed','received')),provider_message_id text,foreign key(organization_id,contact_id) references public.contacts(organization_id,id)",
 sending_identities:'domain text,from_email text,verified boolean default false,sending_enabled boolean default false',
 email_templates:'name text not null,subject text not null,body text not null',
 workflows:'name text not null,category_code text,enabled boolean default false',
 workflow_steps:"workflow_id uuid not null,step_order integer not null,kind text check(kind in ('email','wait','task')),delay_days integer default 0,template_id uuid,foreign key(organization_id,workflow_id) references public.workflows(organization_id,id),foreign key(organization_id,template_id) references public.email_templates(organization_id,id),unique(workflow_id,step_order)",
 workflow_enrollments:"workflow_id uuid not null,contact_id uuid not null,status text default 'paused',foreign key(organization_id,workflow_id) references public.workflows(organization_id,id),foreign key(organization_id,contact_id) references public.contacts(organization_id,id)",
 workflow_jobs:"enrollment_id uuid not null,step_id uuid not null,run_at timestamptz not null,status text default 'pending',idempotency_key text unique,foreign key(organization_id,enrollment_id) references public.workflow_enrollments(organization_id,id),foreign key(organization_id,step_id) references public.workflow_steps(organization_id,id)"
};
for(const[name,columns]of Object.entries(definitions)){
 await db.exec(`create table public.${name}(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),created_at timestamptz not null default now(),${['companies','contacts','events','email_templates','workflows','workflow_steps','workflow_enrollments'].includes(name)?'unique(organization_id,id),':''}${columns});alter table public.${name} enable row level security;
 create policy ${name}_read on public.${name} for select to authenticated using(public.is_org_member(organization_id));
 create policy ${name}_insert on public.${name} for insert to authenticated with check(public.is_org_member(organization_id));
 create policy ${name}_update on public.${name} for update to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
 create policy ${name}_delete on public.${name} for delete to authenticated using(public.is_org_member(organization_id));`);
}
await db.exec(`create unique index contacts_email_per_org on public.contacts(organization_id,lower(email)) where email is not null and length(trim(email))>0;
grant usage on schema public,auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;`);
}
