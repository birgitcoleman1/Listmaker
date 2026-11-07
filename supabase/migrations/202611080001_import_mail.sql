-- Additive import + private mailbox metadata. Apply after migrations 001 and 002.
begin;
-- Import history deliberately retains imported_at, not created_at.
alter table public.import_records add column if not exists error_details text;
create or replace function public.import_contacts(p_org uuid,p_batch uuid,p_file text,p_sheet text,p_policy text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; d jsonb; cid uuid; coid uuid; existing uuid; result jsonb:='[]'; outcome text; rownum integer; prior record; err text;
begin
 if not public.is_org_writer(p_org) then raise exception 'Write access required';end if;
 if p_policy not in ('skip','update','create') then raise exception 'Choose duplicate handling';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>100 then raise exception 'Maximum 100 rows per request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 for r in select value from jsonb_array_elements(p_rows) loop
  cid:=null;coid:=null;existing:=null;err:=null;outcome:='success';rownum:=(r->>'rowNumber')::integer;d:=r->'data';
  select * into prior from public.import_records where organization_id=p_org and source_file=p_batch::text and source_sheet=p_sheet and source_row=rownum;
  if found then result:=result||jsonb_build_array(jsonb_build_object('row',rownum,'status',prior.mapping_status,'error',prior.error_details,'contact_id',prior.contact_id));continue;end if;
  begin
   if jsonb_typeof(d)<>'object' then raise exception 'Invalid row data';end if;
   if exists(select 1 from jsonb_each(d) e where e.key not in ('first_name','last_name','email','phone','job_title','company','notes','source','location','outreach_status','relationship_status','partner_referrals','scope_of_work') or jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>10000) then raise exception 'Unsupported field or oversized value';end if;
   if nullif(trim(d->>'first_name'),'') is null then raise exception 'First name is required';end if;
   if length(d::text)>140000 then raise exception 'Row too large';end if;
   if coalesce(d->>'email','')<>'' and (d->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email address';end if;
   if coalesce(d->>'email','')<>'' then select id into existing from public.contacts where organization_id=p_org and lower(email)=lower(trim(d->>'email'));end if;
   if existing is not null and p_policy='skip' then cid:=existing;outcome:='skipped';
   elsif existing is not null and p_policy='create' then raise exception 'Email already exists; unique email policy prevents another contact';
   else
    if nullif(trim(d->>'company'),'') is not null then
     select id into coid from public.companies where organization_id=p_org and lower(name)=lower(trim(d->>'company')) order by created_at limit 1;
     if coid is null then insert into public.companies(organization_id,name) values(p_org,trim(d->>'company')) returning id into coid;end if;
    end if;
    if existing is null then
     insert into public.contacts(organization_id,first_name,last_name,email,phone,job_title,company_id,notes,source,location,outreach_status,relationship_status,partner_referrals,scope_of_work)
     values(p_org,trim(d->>'first_name'),nullif(d->>'last_name',''),nullif(lower(trim(d->>'email')),''),nullif(d->>'phone',''),nullif(d->>'job_title',''),coid,nullif(d->>'notes',''),nullif(d->>'source',''),nullif(d->>'location',''),nullif(d->>'outreach_status',''),nullif(d->>'relationship_status',''),nullif(d->>'partner_referrals',''),nullif(d->>'scope_of_work','')) returning id into cid;
    else
     cid:=existing;
     update public.contacts set first_name=trim(d->>'first_name'),last_name=coalesce(nullif(d->>'last_name',''),last_name),phone=coalesce(nullif(d->>'phone',''),phone),job_title=coalesce(nullif(d->>'job_title',''),job_title),company_id=coalesce(coid,company_id),notes=coalesce(nullif(d->>'notes',''),notes),source=coalesce(nullif(d->>'source',''),source),location=coalesce(nullif(d->>'location',''),location),outreach_status=coalesce(nullif(d->>'outreach_status',''),outreach_status),relationship_status=coalesce(nullif(d->>'relationship_status',''),relationship_status),partner_referrals=coalesce(nullif(d->>'partner_referrals',''),partner_referrals),scope_of_work=coalesce(nullif(d->>'scope_of_work',''),scope_of_work) where id=cid and organization_id=p_org;
    end if;
   end if;
  exception when others then outcome:='failed';err:=sqlerrm;cid:=null;coid:=null;
  end;
  insert into public.import_records(organization_id,source_file,source_sheet,source_row,source_cells,mapping_status,contact_id,company_id,error_details) values(p_org,p_batch::text,p_sheet,rownum,jsonb_build_object('filename',p_file,'mapped',d),outcome,cid,coid,err);
  result:=result||jsonb_build_array(jsonb_build_object('row',rownum,'status',outcome,'error',err,'contact_id',cid));
 end loop;
 return result;
end $$;
revoke all on function public.import_contacts(uuid,uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.import_contacts(uuid,uuid,text,text,text,jsonb) to authenticated;

create table public.mail_accounts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),user_id uuid not null references auth.users(id),email text not null,configured_at timestamptz not null default now(),verified_at timestamptz,last_synced_at timestamptz,last_error text,
 unique(organization_id,user_id),unique(organization_id,id)
);
create table public.mail_credentials(account_id uuid primary key references public.mail_accounts(id) on delete cascade,ciphertext text not null);
create table public.mail_folders(id uuid primary key default gen_random_uuid(),organization_id uuid not null,account_id uuid not null,path text not null,special_use text,unique(account_id,path),foreign key(organization_id,account_id) references public.mail_accounts(organization_id,id) on delete cascade);
alter table public.email_messages add column if not exists mail_account_id uuid;
alter table public.email_messages add column if not exists workflow_id uuid;
alter table public.email_messages add column if not exists workflow_job_id uuid;
alter table public.email_messages add column if not exists error_details text;
alter table public.email_messages add column if not exists sent_at timestamptz;
alter table public.email_messages add column if not exists message_at timestamptz;
alter table public.email_messages add column if not exists internet_message_id text;
alter table public.email_messages add foreign key(organization_id,mail_account_id) references public.mail_accounts(organization_id,id);
alter table public.email_messages add foreign key(organization_id,workflow_id) references public.workflows(organization_id,id);
alter table public.workflow_jobs add constraint workflow_jobs_org_id_unique unique(organization_id,id);
alter table public.email_messages add foreign key(organization_id,workflow_job_id) references public.workflow_jobs(organization_id,id);
create unique index email_one_message_per_job on public.email_messages(workflow_job_id) where workflow_job_id is not null;
-- Mailbox copies have independent IMAP locations; one message is shown once in the timeline.
create table public.mail_locations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,account_id uuid not null,folder text not null,uid_validity text not null,uid bigint not null,message_id uuid not null references public.email_messages(id),present boolean not null default true,
 unique(account_id,folder,uid_validity,uid),foreign key(organization_id,account_id) references public.mail_accounts(organization_id,id)
);
create unique index mail_message_internet_id on public.email_messages(mail_account_id,internet_message_id) where mail_account_id is not null and internet_message_id is not null;
alter table public.workflow_jobs add column if not exists error_details text;
-- A committed send claim must never be automatically re-sent after an uncertain network outcome.
alter table public.workflow_jobs add column if not exists send_claimed_at timestamptz;
create or replace function public.claim_email_send(p_job uuid) returns boolean language sql security definer set search_path='' as $$
 with claimed as(update public.workflow_jobs set send_claimed_at=now() where id=p_job and status='processing' and send_claimed_at is null returning id) select exists(select 1 from claimed)
$$;
revoke all on function public.claim_email_send(uuid) from public,anon,authenticated;
grant execute on function public.claim_email_send(uuid) to service_role;
alter table public.mail_accounts enable row level security;
alter table public.mail_credentials enable row level security;
alter table public.mail_folders enable row level security;
alter table public.mail_locations enable row level security;
create or replace function public.owns_mail_account(p_account uuid,p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.mail_accounts where id=p_account and organization_id=p_org and user_id=(select auth.uid())) and public.is_org_member(p_org)$$;
revoke all on function public.owns_mail_account(uuid,uuid) from public;
grant execute on function public.owns_mail_account(uuid,uuid) to authenticated;
create policy own_mail_accounts on public.mail_accounts for select to authenticated using(user_id=(select auth.uid()) and public.is_org_member(organization_id));
create policy own_mail_folders on public.mail_folders for select to authenticated using(public.owns_mail_account(account_id,organization_id));
create policy own_mail_locations on public.mail_locations for select to authenticated using(public.owns_mail_account(account_id,organization_id));
drop policy if exists email_messages_read on public.email_messages;
create policy email_messages_read on public.email_messages for select to authenticated using(public.is_org_member(organization_id) and (mail_account_id is null or public.owns_mail_account(mail_account_id,organization_id)));
revoke all on public.mail_credentials from public,anon,authenticated;
revoke insert,update,delete on public.mail_accounts,public.mail_folders,public.mail_locations from public,anon,authenticated;
grant select on public.mail_accounts,public.mail_folders,public.mail_locations to authenticated;
grant all on public.mail_accounts,public.mail_credentials,public.mail_folders,public.mail_locations to service_role;


-- Ambiguous address matches are deliberately left unlinked.
create or replace function public.find_mail_contact(p_org uuid,p_emails text[]) returns uuid language sql stable security definer set search_path='' as $$
 select case when count(*)=1 then (array_agg(id))[1] else null end from public.contacts c where c.organization_id=p_org and
 (lower(trim(c.email))=any(p_emails) or exists(select 1 from unnest(c.additional_emails) a where lower(trim(a))=any(p_emails)))
$$;
revoke all on function public.find_mail_contact(uuid,text[]) from public,anon,authenticated;
grant execute on function public.find_mail_contact(uuid,text[]) to service_role;

-- Operational records cannot be forged from browser clients.
revoke insert,update,delete on public.email_messages,public.workflow_jobs,public.workflow_enrollments from anon,authenticated;
alter table public.email_messages add constraint email_messages_org_id_unique unique(organization_id,id);
alter table public.mail_locations add foreign key(organization_id,message_id) references public.email_messages(organization_id,id);
-- Serialize mailbox commands across concurrent requests; leases recover after interrupted functions.
alter table public.mail_accounts add column lease_token uuid;
alter table public.mail_accounts add column lease_until timestamptz;
create function public.claim_mailbox(p_account uuid,p_token uuid) returns boolean language sql security definer set search_path='' as $$
 with claimed as(update public.mail_accounts set lease_token=p_token,lease_until=now()+interval '2 minutes' where id=p_account and verified_at is not null and (lease_until is null or lease_until<now()) returning id) select exists(select 1 from claimed)
$$;
create function public.save_mail_account(p_org uuid,p_user uuid,p_email text,p_ciphertext text) returns public.mail_accounts language plpgsql security definer set search_path='' as $$
declare a public.mail_accounts;
begin
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user and role in ('owner','admin','member')) then raise exception 'Write access required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_user::text,0));
 select * into a from public.mail_accounts where organization_id=p_org and user_id=p_user for update;
 if a.id is not null and a.email<>p_email then raise exception 'Mailbox address cannot be changed for an existing connection';end if;
 if a.lease_until>now() then raise exception 'Mailbox is busy; try again shortly';end if;
 insert into public.mail_accounts(organization_id,user_id,email) values(p_org,p_user,p_email) on conflict(organization_id,user_id) do update set configured_at=clock_timestamp(),verified_at=null,last_error=null returning * into a;
 insert into public.mail_credentials(account_id,ciphertext) values(a.id,p_ciphertext) on conflict(account_id) do update set ciphertext=excluded.ciphertext;
 return a;
end $$;
revoke all on function public.claim_mailbox(uuid,uuid),public.save_mail_account(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_mailbox(uuid,uuid),public.save_mail_account(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
