-- Run in the Supabase SQL Editor as the project owner, after the website migration.
-- Grants only Birgit's previously confirmed Auth account. Public signups cannot call this.
insert into public.website_admins(user_id,role)
select id,'masteradmin' from auth.users
where id='6942d7aa-445a-4fc3-93b9-3725646ad4b9'::uuid
on conflict(user_id) do update set role='masteradmin'
returning user_id,role;
