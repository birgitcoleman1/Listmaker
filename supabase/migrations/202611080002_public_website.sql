-- Separate public website CMS. No Listmaker data, roles, email or DNS is changed.
begin;
create table public.website_admins(user_id uuid primary key references auth.users(id),role text not null check(role in ('masteradmin','editor')),created_at timestamptz not null default now());
alter table public.website_admins enable row level security;
create policy website_admin_self on public.website_admins for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.website_admins from anon,authenticated;
grant select on public.website_admins to authenticated;
create function public.is_website_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.website_admins where user_id=(select auth.uid()))$$;
revoke all on function public.is_website_admin() from public;
grant execute on function public.is_website_admin() to anon,authenticated;
create table public.website_pages(slug text primary key check(slug in ('home','about','references')),content jsonb not null,updated_at timestamptz not null default now());
create table public.website_published_pages(slug text primary key,content jsonb not null,published_at timestamptz not null default now());
alter table public.website_pages enable row level security;
alter table public.website_published_pages enable row level security;
create policy website_drafts_admin on public.website_pages for all to authenticated using(public.is_website_admin()) with check(public.is_website_admin());
create policy website_published_read on public.website_published_pages for select to anon,authenticated using(true);
revoke all on public.website_pages,public.website_published_pages from anon,authenticated;
grant select,insert,update on public.website_pages to authenticated;
grant select on public.website_published_pages to anon,authenticated;
create function public.publish_website_page(p_slug text) returns void language plpgsql security definer set search_path='' as $$
declare v_content jsonb;
begin
 if not public.is_website_admin() then raise exception 'Website administrator access required';end if;
 select content into v_content from public.website_pages where slug=p_slug;
 if not found then raise exception 'Save the page draft first';end if;
 if nullif(trim(v_content->>'headline'),'') is null then raise exception 'Headline is required';end if;
 if length(v_content::text)>60000 then raise exception 'Page content is too large';end if;
 if nullif(v_content->>'image_path','') is not null and nullif(trim(v_content->>'image_alt'),'') is null then raise exception 'Image alternative text is required';end if;
 insert into public.website_published_pages(slug,content) values(p_slug,v_content) on conflict(slug) do update set content=excluded.content,published_at=now();
end $$;
revoke all on function public.publish_website_page(text) from public,anon;
grant execute on function public.publish_website_page(text) to authenticated;
create table public.website_references(id uuid primary key default gen_random_uuid(),headline text not null check(length(trim(headline)) between 1 and 200),short_copy text not null default '' check(length(short_copy)<=3000),long_copy text not null default '' check(length(long_copy)<=10000),image_path text not null default '',image_alt text not null default '',position integer not null default 0,published boolean not null default false,check(not published or (length(trim(short_copy))>0 and length(trim(image_path))>0 and length(trim(image_alt))>0)),created_at timestamptz not null default now());
alter table public.website_references enable row level security;
create policy references_public_read on public.website_references for select to anon,authenticated using(published or public.is_website_admin());
create policy references_admin_insert on public.website_references for insert to authenticated with check(public.is_website_admin());
create policy references_admin_update on public.website_references for update to authenticated using(public.is_website_admin()) with check(public.is_website_admin());
create policy references_admin_delete on public.website_references for delete to authenticated using(public.is_website_admin());
revoke all on public.website_references from anon,authenticated;
grant select on public.website_references to anon,authenticated;
grant insert,update,delete on public.website_references to authenticated;
create table public.website_submissions(id uuid primary key default gen_random_uuid(),nonce uuid not null unique,ip_hash text not null,name text not null check(length(trim(name)) between 1 and 200),email text not null check(length(email)<=254),organization text not null default '' check(length(organization)<=200),subject text not null default '' check(length(subject)<=200),message text not null check(length(trim(message)) between 1 and 10000),created_at timestamptz not null default now(),read_at timestamptz,archived_at timestamptz);
create index website_submission_rate on public.website_submissions(ip_hash,created_at);
alter table public.website_submissions enable row level security;
create policy submissions_admin_read on public.website_submissions for select to authenticated using(public.is_website_admin());
create policy submissions_admin_update on public.website_submissions for update to authenticated using(public.is_website_admin()) with check(public.is_website_admin());
revoke all on public.website_submissions from anon,authenticated;
grant select on public.website_submissions to authenticated;
grant update(read_at,archived_at) on public.website_submissions to authenticated;
create function public.submit_website_contact(p_nonce uuid,p_ip_hash text,p_name text,p_email text,p_organization text,p_subject text,p_message text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email address';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ip_hash,0));
 if exists(select 1 from public.website_submissions where nonce=p_nonce) then return;end if;
 if (select count(*) from public.website_submissions where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=5 then raise exception 'Too many messages. Please try again later';end if;
 insert into public.website_submissions(nonce,ip_hash,name,email,organization,subject,message) values(p_nonce,p_ip_hash,trim(p_name),lower(trim(p_email)),p_organization,p_subject,trim(p_message));
end $$;
revoke all on function public.submit_website_contact(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_website_contact(uuid,text,text,text,text,text,text) to service_role;
grant all on public.website_pages,public.website_published_pages,public.website_references,public.website_submissions,public.website_admins to service_role;
-- New uploads only. The existing Website-media and business-card buckets remain unchanged.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('website-assets','website-assets',true,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy website_assets_read on storage.objects for select to anon,authenticated using(bucket_id='website-assets');
create policy website_assets_insert on storage.objects for insert to authenticated with check(bucket_id='website-assets' and public.is_website_admin());
create policy website_assets_update on storage.objects for update to authenticated using(bucket_id='website-assets' and public.is_website_admin()) with check(bucket_id='website-assets' and public.is_website_admin());
create policy website_assets_delete on storage.objects for delete to authenticated using(bucket_id='website-assets' and public.is_website_admin());
insert into public.website_pages(slug,content) values('home',$site${"eyebrow":"PARTNERSHIPS · INNOVATION · WELLBEING","headline":"Connecting people and ideas for a healthier future.","short_copy":"I work at the intersection of partnerships, innovation, and creativity, bringing people together to advance nutrition, healthy aging, wellbeing, and longevity. Through trusted relationships and conscious leadership, I help entrepreneurs, executives, and innovation teams explore possibilities and co-create positive, sustainable change.","about_label":"About Birgit","contact_label":"Let’s connect","focus_label":"AREAS OF FOCUS","focus_headline":"Where connection creates possibility.","focus_1_title":"Partnerships and meaningful connections.","focus_1_copy":"Bringing complementary people and perspectives together through trusted relationships.","focus_2_title":"Innovation in nutrition, wellbeing, and longevity.","focus_2_copy":"Exploring possibilities for a healthier future, across industries and geographies.","focus_3_title":"Conscious leadership and co-creation.","focus_3_copy":"Working with intention, curiosity, generosity of spirit, and compassion.","closing_headline":"The next possibility starts with a conversation.","closing_copy":"If you’re exploring a partnership, developing an idea, or working toward a healthier future, I’d be happy to hear from you.","image_path":"","image_alt":"Birgit Coleman","use_initial_image":true}$site$::jsonb) on conflict(slug) do nothing;
insert into public.website_published_pages(slug,content) select slug,content from public.website_pages where slug='home' on conflict(slug) do nothing;
insert into public.website_pages(slug,content) values('about',$site${"headline":"Relationships at the heart of innovation.","short_copy":"I’m Birgit Coleman. I bring curiosity, intentionality, and a global perspective to connecting people, building partnerships, and supporting innovation in nutrition, health, and wellbeing.","long_copy":"My work is rooted in a belief that meaningful relationships can unlock extraordinary possibilities. I am curious about the intersection of partnerships, innovation, and creativity, with a particular passion for advances in nutrition, healthy aging, wellbeing, and longevity.\n\nHaving served as a trusted advisor to executives, entrepreneurs, and innovation teams, I connect people across industries and geographies. My global network informs a collaborative approach to startup and corporate growth, bringing complementary perspectives together to co-create positive and sustainable change.\n\nMindfulness, generosity of spirit, and compassion shape how I work. I value the intention behind each action and aim to inspire and empower others through conscious leadership.\n\nI am a co-author of ‘Food Industry Design, Technology and Innovation’ and ‘Food Industry R&D,’ published by Wiley Blackwell.","image_path":"","image_alt":"Birgit Coleman","use_initial_image":true}$site$::jsonb) on conflict(slug) do nothing;
insert into public.website_published_pages(slug,content) select slug,content from public.website_pages where slug='about' on conflict(slug) do nothing;
insert into public.website_pages(slug,content) values('references',$site${"headline":"Relationships. Collaboration. Shared progress.","image_path":"","image_alt":"","use_initial_image":false}$site$::jsonb) on conflict(slug) do nothing;
insert into public.website_published_pages(slug,content) select slug,content from public.website_pages where slug='references' on conflict(slug) do nothing;
create function public.reorder_website_references(p_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_website_admin() then raise exception 'Website administrator access required';end if;
 perform pg_advisory_xact_lock(hashtextextended('website_references',0));
 if coalesce(cardinality(p_ids),0)<>(select count(*) from public.website_references) or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids) or exists(select 1 from unnest(p_ids) u(id) where not exists(select 1 from public.website_references r where r.id=u.id)) then raise exception 'References changed. Reload before reordering';end if;
 update public.website_references r set position=u.n from unnest(p_ids) with ordinality u(id,n) where r.id=u.id;
end $$;
revoke all on function public.reorder_website_references(uuid[]) from public,anon;
grant execute on function public.reorder_website_references(uuid[]) to authenticated;
create function public.search_website_submissions(p_query text default '',p_archived boolean default false,p_offset integer default 0) returns setof public.website_submissions language sql stable security invoker set search_path='' as $$
 select * from public.website_submissions where (archived_at is not null)=p_archived and position(lower(coalesce(p_query,'')) in lower(concat_ws(' ',name,email,organization,subject,message)))>0 order by created_at desc limit 100 offset greatest(0,p_offset)
$$;
revoke all on function public.search_website_submissions(text,boolean,integer) from public,anon;
grant execute on function public.search_website_submissions(text,boolean,integer) to authenticated;
notify pgrst,'reload schema';
commit;
