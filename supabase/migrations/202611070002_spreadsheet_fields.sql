-- Additive workbook mapping fields. No existing data is removed.
begin;
alter table public.contacts add column if not exists source text;
alter table public.contacts add column if not exists location text;
alter table public.contacts add column if not exists outreach_status text;
alter table public.contacts add column if not exists relationship_status text;
alter table public.contacts add column if not exists partner_referrals text;
alter table public.contacts add column if not exists scope_of_work text;
alter table public.contacts add column if not exists additional_emails text[] not null default '{}';
create table if not exists public.import_records (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 source_file text not null, source_sheet text not null, source_row integer not null,
 source_cells jsonb not null, mapping_status text not null,
 company_id uuid, contact_id uuid,
 imported_at timestamptz not null default now(),
 unique(organization_id,source_file,source_sheet,source_row),
 foreign key(organization_id,company_id) references public.companies(organization_id,id),
 foreign key(organization_id,contact_id) references public.contacts(organization_id,id)
);
alter table public.import_records enable row level security;
drop policy if exists import_records_read on public.import_records;
create policy import_records_read on public.import_records for select to authenticated using(public.is_org_member(organization_id));
-- Only the privileged SQL import can write raw provenance.
revoke insert,update,delete on public.import_records from anon,authenticated;
grant select on public.import_records to authenticated;
commit;
