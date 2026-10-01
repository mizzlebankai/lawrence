-- Lawrence admissions and newsletter schema for Supabase

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
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  interest_area text not null default 'general' check (interest_area in ('general', 'shs', 'remedial', 'college')),
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
  drop constraint if exists newsletter_campaigns_status_check;
alter table public.newsletter_campaigns
  add constraint newsletter_campaigns_status_check
  check (status in ('draft', 'sending', 'sent', 'partial', 'failed', 'no_recipients'));

create table if not exists public.newsletter_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
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

create index if not exists newsletter_campaign_deliveries_queue_idx
  on public.newsletter_campaign_deliveries (campaign_id, status, created_at);

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
create policy "Public can submit applications"
on public.applications
for insert
with check (true);

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

  insert into public.newsletter_campaign_deliveries (campaign_id, subscriber_id, email, full_name)
  select campaign_row.id, subscriber.id, subscriber.email, subscriber.full_name
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
  a.updated_at
from public.applications a;
