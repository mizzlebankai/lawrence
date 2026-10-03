-- Lawrence admissions, newsletter, and website content schema for Supabase

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-documents',
  'application-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text not null unique,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  program_type text not null check (program_type in ('shs', 'remedial', 'college')),
  applicant_name text not null,
  email text,
  phone text,
  guardian_name text,
  guardian_phone text,
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'waitlisted', 'accepted', 'rejected')),
  intake_year int,
  form_data jsonb not null default '{}'::jsonb,
  notes text,
  email_verified_at timestamptz,
  email_verification_token_hash text,
  email_verification_expires_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.applications
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verification_token_hash text,
  add column if not exists email_verification_expires_at timestamptz;

create unique index if not exists applications_email_verification_token_hash_uidx
  on public.applications (email_verification_token_hash)
  where email_verification_token_hash is not null;

create table if not exists public.application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  created_by uuid,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email text not null unique,
  interest_area text not null default 'general' check (interest_area in ('general', 'shs', 'remedial', 'college')),
  consent_given boolean not null default false,
  status text not null default 'active' check (status in ('active', 'unsubscribed', 'bounced')),
  subscribed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.newsletter_signup_rate_limits (
  bucket_hash text primary key,
  attempts int not null default 0,
  window_started_at timestamptz not null default now()
);

alter table public.newsletter_subscribers
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmation_token_hash text,
  add column if not exists confirmation_expires_at timestamptz,
  add column if not exists unsubscribe_token_hash text;

alter table public.newsletter_subscribers
  drop constraint if exists newsletter_subscribers_status_check;
alter table public.newsletter_subscribers
  add constraint newsletter_subscribers_status_check
  check (status in ('pending_confirmation', 'active', 'unsubscribed', 'bounced'));

update public.newsletter_subscribers
set confirmed_at = coalesce(confirmed_at, subscribed_at)
where status = 'active' and consent_given = true and confirmed_at is null;

create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body_text text not null,
  headline text,
  image_url text,
  image_alt text not null default '',
  button_label text,
  button_url text,
  interest_area text not null default 'general' check (interest_area in ('general', 'shs', 'remedial', 'college')),
  audience_type text not null default 'subscribers' check (audience_type in ('subscribers', 'applicants')),
  applicant_status text not null default 'all' check (applicant_status in ('all', 'submitted', 'in_review', 'waitlisted', 'accepted', 'rejected')),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'partial', 'failed', 'no_recipients')),
  created_by uuid,
  recipient_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.newsletter_campaigns
  add column if not exists headline text,
  add column if not exists image_url text,
  add column if not exists image_alt text not null default '',
  add column if not exists button_label text,
  add column if not exists button_url text,
  add column if not exists audience_type text not null default 'subscribers',
  add column if not exists applicant_status text not null default 'all';

alter table public.newsletter_campaigns
  drop constraint if exists newsletter_campaigns_audience_type_check,
  drop constraint if exists newsletter_campaigns_applicant_status_check;
alter table public.newsletter_campaigns
  add constraint newsletter_campaigns_audience_type_check
    check (audience_type in ('subscribers', 'applicants')),
  add constraint newsletter_campaigns_applicant_status_check
    check (applicant_status in ('all', 'submitted', 'in_review', 'waitlisted', 'accepted', 'rejected'));

alter table public.newsletter_campaigns
  drop constraint if exists newsletter_campaigns_status_check;
alter table public.newsletter_campaigns
  add constraint newsletter_campaigns_status_check
  check (status in ('draft', 'sending', 'sent', 'partial', 'failed', 'no_recipients'));

create table if not exists public.newsletter_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  subscriber_id uuid references public.newsletter_subscribers(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  email text not null,
  full_name text,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, subscriber_id)
);

alter table public.newsletter_campaign_deliveries
  alter column subscriber_id drop not null,
  add column if not exists application_id uuid references public.applications(id) on delete cascade;
alter table public.newsletter_campaign_deliveries
  drop constraint if exists newsletter_campaign_deliveries_recipient_check;
alter table public.newsletter_campaign_deliveries
  add constraint newsletter_campaign_deliveries_recipient_check
    check ((subscriber_id is not null and application_id is null) or (subscriber_id is null and application_id is not null));
create unique index if not exists newsletter_campaign_deliveries_application_uidx
  on public.newsletter_campaign_deliveries (campaign_id, application_id)
  where application_id is not null;

create index if not exists newsletter_campaign_deliveries_queue_idx
  on public.newsletter_campaign_deliveries (campaign_id, status, created_at);

create table if not exists public.newsletter_campaign_attachments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size between 1 and 5242880),
  created_at timestamptz not null default now()
);

alter table public.newsletter_campaign_attachments enable row level security;
grant select, insert, delete on public.newsletter_campaign_attachments to authenticated;

drop policy if exists "Admins can manage newsletter campaign attachments" on public.newsletter_campaign_attachments;
create policy "Admins can manage newsletter campaign attachments"
on public.newsletter_campaign_attachments
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'newsletter-attachments',
  'newsletter-attachments',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can upload newsletter attachments" on storage.objects;
create policy "Admins can upload newsletter attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'newsletter-attachments'
  and (storage.foldername(name))[1] = 'campaigns'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can read newsletter attachments" on storage.objects;
create policy "Admins can read newsletter attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'newsletter-attachments'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can delete newsletter attachments" on storage.objects;
create policy "Admins can delete newsletter attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'newsletter-attachments'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Public can upload application documents" on storage.objects;
create policy "Public can upload application documents"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'application-documents'
  and (storage.foldername(name))[1] ~ '^(LSHS|LREM|LCOL)-[0-9]{4}-[0-9]{4}$'
);

drop policy if exists "Admins can read application documents" on storage.objects;
create policy "Admins can read application documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'application-documents'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can delete application documents" on storage.objects;
create policy "Admins can delete application documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'application-documents'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists applications_updated_at on public.applications;
create trigger applications_updated_at
before update on public.applications
for each row
execute function public.update_updated_at();

drop trigger if exists newsletter_campaigns_updated_at on public.newsletter_campaigns;
create trigger newsletter_campaigns_updated_at
before update on public.newsletter_campaigns
for each row
execute function public.update_updated_at();

drop trigger if exists newsletter_updated_at on public.newsletter_subscribers;
create trigger newsletter_updated_at
before update on public.newsletter_subscribers
for each row
execute function public.update_updated_at();

alter table public.admin_users enable row level security;
alter table public.applications enable row level security;
alter table public.application_notes enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_campaign_deliveries enable row level security;
alter table public.newsletter_signup_rate_limits enable row level security;

drop policy if exists "Admins can read all admin records" on public.admin_users;
create policy "Admins can read all admin records"
on public.admin_users
for select
using (user_id = auth.uid() and is_active = true);

drop policy if exists "Public can submit applications" on public.applications;

drop policy if exists "Admins can read all applications" on public.applications;
create policy "Admins can read all applications"
on public.applications
for select
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can update applications" on public.applications;
create policy "Admins can update applications"
on public.applications
for update
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can delete applications" on public.applications;
create policy "Admins can delete applications"
on public.applications
for delete
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can read notes" on public.application_notes;
create policy "Admins can read notes"
on public.application_notes
for select
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can insert notes" on public.application_notes;
create policy "Admins can insert notes"
on public.application_notes
for insert
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Public can subscribe" on public.newsletter_subscribers;

drop policy if exists "Admins can read subscribers" on public.newsletter_subscribers;
create policy "Admins can read subscribers"
on public.newsletter_subscribers
for select
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can update subscribers" on public.newsletter_subscribers;
create policy "Admins can update subscribers"
on public.newsletter_subscribers
for update
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can delete subscribers" on public.newsletter_subscribers;
create policy "Admins can delete subscribers"
on public.newsletter_subscribers
for delete
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can read newsletter campaigns" on public.newsletter_campaigns;
create policy "Admins can read newsletter campaigns"
on public.newsletter_campaigns
for select
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can delete newsletter campaigns" on public.newsletter_campaigns;
create policy "Admins can delete newsletter campaigns"
on public.newsletter_campaigns
for delete
using (
  status <> 'sending'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

drop policy if exists "Admins can read newsletter campaign deliveries" on public.newsletter_campaign_deliveries;
create policy "Admins can read newsletter campaign deliveries"
on public.newsletter_campaign_deliveries
for select
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true
  )
);

create or replace function public.prepare_newsletter_campaign(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_row public.newsletter_campaigns%rowtype;
  queued_count integer;
begin
  select * into campaign_row
  from public.newsletter_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Campaign not found';
  end if;

  if campaign_row.status <> 'draft' then
    return campaign_row.recipient_count;
  end if;

  if campaign_row.audience_type = 'subscribers' then
    insert into public.newsletter_campaign_deliveries (campaign_id, subscriber_id, application_id, email, full_name)
    select campaign_row.id, subscriber.id, null, subscriber.email, subscriber.full_name
    from public.newsletter_subscribers subscriber
    where subscriber.status = 'active'
      and subscriber.consent_given = true
      and subscriber.confirmed_at is not null
      and (
        campaign_row.interest_area = 'general'
        or subscriber.interest_area = 'general'
        or subscriber.interest_area = campaign_row.interest_area
      )
    on conflict (campaign_id, subscriber_id) do nothing;
  else
    insert into public.newsletter_campaign_deliveries (campaign_id, subscriber_id, application_id, email, full_name)
    select campaign_row.id, null, application.id, application.email, application.applicant_name
    from public.applications application
    where application.email is not null
      and application.email_verified_at is not null
      and (
        campaign_row.interest_area = 'general'
        or application.program_type = campaign_row.interest_area
      )
      and (campaign_row.applicant_status = 'all' or application.status = campaign_row.applicant_status)
    on conflict (campaign_id, application_id) where application_id is not null do nothing;
  end if;

  select count(*) into queued_count
  from public.newsletter_campaign_deliveries
  where campaign_id = p_campaign_id;

  update public.newsletter_campaigns
  set status = 'sending', recipient_count = queued_count
  where id = p_campaign_id;

  return queued_count;
end;
$$;

create or replace function public.claim_newsletter_campaign_deliveries(p_campaign_id uuid, p_limit integer default 20)
returns setof public.newsletter_campaign_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select delivery.id
    from public.newsletter_campaign_deliveries delivery
    where delivery.campaign_id = p_campaign_id and delivery.status = 'queued'
    order by delivery.created_at, delivery.id
    limit greatest(1, least(coalesce(p_limit, 20), 25))
    for update skip locked
  )
  update public.newsletter_campaign_deliveries delivery
  set status = 'sending', attempts = delivery.attempts + 1
  from claimed
  where delivery.id = claimed.id
  returning delivery.*;
end;
$$;

create or replace function public.consume_newsletter_signup_limit(p_bucket_hash text, p_max_attempts integer default 10, p_window_seconds integer default 3600)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_count integer;
begin
  insert into public.newsletter_signup_rate_limits (bucket_hash, attempts, window_started_at)
  values (p_bucket_hash, 1, now())
  on conflict (bucket_hash) do update
  set attempts = case
        when newsletter_signup_rate_limits.window_started_at <= now() - make_interval(secs => greatest(60, least(p_window_seconds, 86400))) then 1
        else newsletter_signup_rate_limits.attempts + 1
      end,
      window_started_at = case
        when newsletter_signup_rate_limits.window_started_at <= now() - make_interval(secs => greatest(60, least(p_window_seconds, 86400))) then now()
        else newsletter_signup_rate_limits.window_started_at
      end
  returning attempts into attempt_count;

  return attempt_count <= greatest(1, least(p_max_attempts, 100));
end;
$$;

revoke all on function public.prepare_newsletter_campaign(uuid) from public, anon, authenticated;
revoke all on function public.claim_newsletter_campaign_deliveries(uuid, integer) from public, anon, authenticated;
revoke all on function public.consume_newsletter_signup_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.prepare_newsletter_campaign(uuid) to service_role;
grant execute on function public.claim_newsletter_campaign_deliveries(uuid, integer) to service_role;
grant execute on function public.consume_newsletter_signup_limit(text, integer, integer) to service_role;

-- Helpful view for dashboard queries
create or replace view public.application_dashboard as
select
  a.id,
  a.reference_number,
  a.program_type,
  a.applicant_name,
  a.email,
  a.phone,
  a.status,
  a.submitted_at,
  a.updated_at,
  a.email_verified_at
from public.applications a;

-- Public news and events content management
create or replace function public.is_site_content_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.is_active = true
  );
$$;

revoke all on function public.is_site_content_admin() from public, anon;
grant execute on function public.is_site_content_admin() to authenticated;

create table if not exists public.admin_activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_label text not null,
  event_name text not null,
  entity_type text not null,
  entity_id uuid,
  entity_label text not null default '',
  details text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_logs_created_at_idx
  on public.admin_activity_logs (created_at desc);

alter table public.admin_activity_logs enable row level security;
revoke all on public.admin_activity_logs from public, anon, authenticated;
grant select on public.admin_activity_logs to authenticated;

drop policy if exists "Admins can read activity logs" on public.admin_activity_logs;
create policy "Admins can read activity logs"
on public.admin_activity_logs
for select
to authenticated
using (public.is_site_content_admin());

create or replace function public.log_admin_activity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  row_data jsonb;
  actor uuid := auth.uid();
  actor_name text;
  entity_name text;
  record_label text;
  event_label text;
  event_details text := '';
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
  else
    row_data := to_jsonb(new);
  end if;

  entity_name := case tg_table_name
    when 'applications' then 'Application'
    when 'application_notes' then 'Application note'
    when 'newsletter_subscribers' then 'Newsletter subscriber'
    when 'newsletter_campaigns' then 'Newsletter campaign'
    when 'site_posts' then 'News or event'
    when 'site_sections' then 'Page section'
    when 'leadership' then 'Leadership profile'
    when 'gallery_items' then 'Gallery item'
    else 'Record'
  end;

  if tg_table_name = 'applications' and tg_op = 'UPDATE' then
    if old.status is not distinct from new.status then
      return new;
    end if;
    event_label := 'Application status changed';
    event_details := format('Status changed from %s to %s', old.status, new.status);
  else
    event_label := case
      when tg_table_name = 'applications' and tg_op = 'INSERT' then 'Application submitted'
      when tg_table_name = 'newsletter_subscribers' and tg_op = 'INSERT' then 'New newsletter subscriber'
      when tg_op = 'INSERT' then entity_name || ' created'
      when tg_op = 'UPDATE' and tg_table_name = 'newsletter_subscribers' then 'Newsletter subscriber updated'
      when tg_op = 'UPDATE' then entity_name || ' updated'
      when tg_op = 'DELETE' then entity_name || ' deleted'
    end;
  end if;

  record_label := case tg_table_name
    when 'applications' then coalesce(row_data ->> 'reference_number', '')
    when 'application_notes' then 'Application note'
    when 'newsletter_subscribers' then 'Subscriber'
    when 'newsletter_campaigns' then coalesce(row_data ->> 'subject', '')
    when 'site_posts' then coalesce(row_data ->> 'title', '')
    when 'site_sections' then concat_ws('/', row_data ->> 'page_slug', row_data ->> 'section_key')
    when 'leadership' then coalesce(row_data ->> 'full_name', '')
    when 'gallery_items' then coalesce(row_data ->> 'title', '')
    else ''
  end;

  select coalesce(nullif(full_name, ''), email)
  into actor_name
  from public.admin_users
  where user_id = actor and is_active = true
  limit 1;

  if actor_name is null then
    actor_name := case
      when tg_table_name = 'applications' and tg_op = 'INSERT' then 'Applicant'
      when tg_table_name = 'newsletter_subscribers' and tg_op = 'INSERT' then 'Visitor'
      else 'System'
    end;
  end if;

  insert into public.admin_activity_logs (
    actor_id, actor_label, event_name, entity_type, entity_id, entity_label, details
  ) values (
    actor, actor_name, event_label, entity_name,
    nullif(row_data ->> 'id', '')::uuid, record_label, event_details
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists applications_activity_log on public.applications;
create trigger applications_activity_log
after insert or update or delete on public.applications
for each row execute function public.log_admin_activity();

drop trigger if exists application_notes_activity_log on public.application_notes;
create trigger application_notes_activity_log
after insert on public.application_notes
for each row execute function public.log_admin_activity();

drop trigger if exists newsletter_subscribers_activity_log on public.newsletter_subscribers;
create trigger newsletter_subscribers_activity_log
after insert or update or delete on public.newsletter_subscribers
for each row execute function public.log_admin_activity();

drop trigger if exists newsletter_campaigns_activity_log on public.newsletter_campaigns;
create trigger newsletter_campaigns_activity_log
after insert or update or delete on public.newsletter_campaigns
for each row execute function public.log_admin_activity();

create table if not exists public.site_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('news', 'event')),
  title text not null check (char_length(title) between 1 and 180),
  slug text not null unique,
  excerpt text not null check (char_length(excerpt) between 1 and 500),
  body text not null default '',
  image_path text,
  image_alt text not null default '',
  event_date timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);

alter table public.site_posts
  add column if not exists image_template text not null default 'news-4x3' check (image_template in ('news-4x3', 'poster-2x3', 'square-1x1', 'banner-16x9')),
  add column if not exists image_fit text not null default 'auto' check (image_fit in ('auto', 'cover', 'contain')),
  add column if not exists image_zoom_x int not null default 100 check (image_zoom_x between 100 and 200),
  add column if not exists image_zoom_y int not null default 100 check (image_zoom_y between 100 and 200),
  add column if not exists image_position_x int not null default 50 check (image_position_x between 0 and 100),
  add column if not exists image_position_y int not null default 50 check (image_position_y between 0 and 100);

create index if not exists site_posts_publication_idx
  on public.site_posts (published_at desc)
  where status = 'published';

alter table public.site_posts enable row level security;
grant select on public.site_posts to anon, authenticated;
grant insert, update, delete on public.site_posts to authenticated;

drop policy if exists "Visitors can read published site posts" on public.site_posts;
create policy "Visitors can read published site posts"
on public.site_posts
for select
to anon, authenticated
using (
  status = 'published'
  and published_at is not null
  and published_at <= now()
);

drop policy if exists "Admins can manage site posts" on public.site_posts;
create policy "Admins can manage site posts"
on public.site_posts
for all
to authenticated
using (public.is_site_content_admin())
with check (public.is_site_content_admin());

drop trigger if exists site_posts_updated_at on public.site_posts;
create trigger site_posts_updated_at
before update on public.site_posts
for each row
execute function public.update_updated_at();

create table if not exists public.site_sections (
  id uuid primary key default gen_random_uuid(),
  page_slug text not null,
  section_key text not null default 'hero',
  title text,
  subtitle text,
  body text default '',
  image_url text,
  image_template text not null default 'hero-16x9' check (image_template in ('hero-16x9', 'feature-4x3', 'square-1x1')),
  image_fit text not null default 'cover' check (image_fit in ('cover', 'contain')),
  image_zoom_x int not null default 100 check (image_zoom_x between 100 and 200),
  image_zoom_y int not null default 100 check (image_zoom_y between 100 and 200),
  image_position_x int not null default 50 check (image_position_x between 0 and 100),
  image_position_y int not null default 50 check (image_position_y between 0 and 100),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_slug, section_key)
);

alter table public.site_sections
  add column if not exists image_template text not null default 'hero-16x9' check (image_template in ('hero-16x9', 'feature-4x3', 'square-1x1')),
  add column if not exists image_fit text not null default 'cover' check (image_fit in ('cover', 'contain')),
  add column if not exists image_zoom_x int not null default 100 check (image_zoom_x between 100 and 200),
  add column if not exists image_zoom_y int not null default 100 check (image_zoom_y between 100 and 200),
  add column if not exists image_position_x int not null default 50 check (image_position_x between 0 and 100),
  add column if not exists image_position_y int not null default 50 check (image_position_y between 0 and 100);

create table if not exists public.leadership (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role_title text not null,
  division text not null default 'general' check (division in ('general', 'college', 'high-school', 'remedial')),
  bio text not null default '',
  photo_url text,
  image_template text not null default 'portrait-3x4' check (image_template in ('portrait-3x4', 'square-1x1')),
  image_fit text not null default 'cover' check (image_fit in ('cover', 'contain')),
  image_zoom_x int not null default 100 check (image_zoom_x between 100 and 200),
  image_zoom_y int not null default 100 check (image_zoom_y between 100 and 200),
  image_position_x int not null default 50 check (image_position_x between 0 and 100),
  image_position_y int not null default 50 check (image_position_y between 0 and 100),
  display_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leadership
  add column if not exists image_template text not null default 'portrait-3x4' check (image_template in ('portrait-3x4', 'square-1x1')),
  add column if not exists image_fit text not null default 'cover' check (image_fit in ('cover', 'contain')),
  add column if not exists image_zoom_x int not null default 100 check (image_zoom_x between 100 and 200),
  add column if not exists image_zoom_y int not null default 100 check (image_zoom_y between 100 and 200),
  add column if not exists image_position_x int not null default 50 check (image_position_x between 0 and 100),
  add column if not exists image_position_y int not null default 50 check (image_position_y between 0 and 100);

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'general',
  image_url text not null,
  caption text default '',
  image_template text not null default 'gallery-4x3' check (image_template in ('gallery-4x3', 'portrait-3x4', 'square-1x1')),
  image_fit text not null default 'cover' check (image_fit in ('cover', 'contain')),
  image_zoom_x int not null default 100 check (image_zoom_x between 100 and 200),
  image_zoom_y int not null default 100 check (image_zoom_y between 100 and 200),
  image_position_x int not null default 50 check (image_position_x between 0 and 100),
  image_position_y int not null default 50 check (image_position_y between 0 and 100),
  display_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gallery_items
  add column if not exists image_template text not null default 'gallery-4x3' check (image_template in ('gallery-4x3', 'portrait-3x4', 'square-1x1')),
  add column if not exists image_fit text not null default 'cover' check (image_fit in ('cover', 'contain')),
  add column if not exists image_zoom_x int not null default 100 check (image_zoom_x between 100 and 200),
  add column if not exists image_zoom_y int not null default 100 check (image_zoom_y between 100 and 200),
  add column if not exists image_position_x int not null default 50 check (image_position_x between 0 and 100),
  add column if not exists image_position_y int not null default 50 check (image_position_y between 0 and 100);

alter table public.site_sections enable row level security;
alter table public.leadership enable row level security;
alter table public.gallery_items enable row level security;

drop trigger if exists site_sections_updated_at on public.site_sections;
create trigger site_sections_updated_at
before update on public.site_sections
for each row
execute function public.update_updated_at();

drop trigger if exists leadership_updated_at on public.leadership;
create trigger leadership_updated_at
before update on public.leadership
for each row
execute function public.update_updated_at();

drop trigger if exists gallery_items_updated_at on public.gallery_items;
create trigger gallery_items_updated_at
before update on public.gallery_items
for each row
execute function public.update_updated_at();

drop policy if exists "Visitors can read published site sections" on public.site_sections;
create policy "Visitors can read published site sections"
on public.site_sections
for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Admins can manage site sections" on public.site_sections;
create policy "Admins can manage site sections"
on public.site_sections
for all
to authenticated
using (public.is_site_content_admin())
with check (public.is_site_content_admin());

drop policy if exists "Visitors can read published leadership" on public.leadership;
create policy "Visitors can read published leadership"
on public.leadership
for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Admins can manage leadership" on public.leadership;
create policy "Admins can manage leadership"
on public.leadership
for all
to authenticated
using (public.is_site_content_admin())
with check (public.is_site_content_admin());

drop policy if exists "Visitors can read published gallery items" on public.gallery_items;
create policy "Visitors can read published gallery items"
on public.gallery_items
for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Admins can manage gallery items" on public.gallery_items;
create policy "Admins can manage gallery items"
on public.gallery_items
for all
to authenticated
using (public.is_site_content_admin())
with check (public.is_site_content_admin());

drop trigger if exists site_posts_activity_log on public.site_posts;
create trigger site_posts_activity_log
after insert or update or delete on public.site_posts
for each row execute function public.log_admin_activity();

drop trigger if exists site_sections_activity_log on public.site_sections;
create trigger site_sections_activity_log
after insert or update or delete on public.site_sections
for each row execute function public.log_admin_activity();

drop trigger if exists leadership_activity_log on public.leadership;
create trigger leadership_activity_log
after insert or update or delete on public.leadership
for each row execute function public.log_admin_activity();

drop trigger if exists gallery_items_activity_log on public.gallery_items;
create trigger gallery_items_activity_log
after insert or update or delete on public.gallery_items
for each row execute function public.log_admin_activity();

grant select on public.site_sections to anon, authenticated;
grant insert, update, delete on public.site_sections to authenticated;
grant select on public.leadership to anon, authenticated;
grant insert, update, delete on public.leadership to authenticated;
grant select on public.gallery_items to anon, authenticated;
grant insert, update, delete on public.gallery_items to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-media',
  'site-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Visitors can view public site media" on storage.objects;
create policy "Visitors can view public site media"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'site-media');

drop policy if exists "Admins can upload site media" on storage.objects;
create policy "Admins can upload site media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'site-media'
  and public.is_site_content_admin()
);

drop policy if exists "Admins can update site media" on storage.objects;
create policy "Admins can update site media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'site-media'
  and public.is_site_content_admin()
)
with check (
  bucket_id = 'site-media'
  and public.is_site_content_admin()
);

drop policy if exists "Admins can delete site media" on storage.objects;
create policy "Admins can delete site media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'site-media'
  and public.is_site_content_admin()
);
