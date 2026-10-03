alter table public.applications
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verification_token_hash text,
  add column if not exists email_verification_expires_at timestamptz;

create unique index if not exists applications_email_verification_token_hash_uidx
  on public.applications (email_verification_token_hash)
  where email_verification_token_hash is not null;

drop policy if exists "Public can submit applications" on public.applications;

alter table public.newsletter_campaigns
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

alter table public.newsletter_campaign_deliveries
  alter column subscriber_id drop not null,
  add column if not exists application_id uuid references public.applications(id) on delete cascade;

alter table public.newsletter_campaign_deliveries
  drop constraint if exists newsletter_campaign_deliveries_recipient_check;
alter table public.newsletter_campaign_deliveries
  add constraint newsletter_campaign_deliveries_recipient_check
    check ((subscriber_id is not null and application_id is null) or (subscriber_id is null and application_id is not null));

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

create unique index if not exists newsletter_campaign_deliveries_application_uidx
  on public.newsletter_campaign_deliveries (campaign_id, application_id)
  where application_id is not null;

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

revoke all on function public.prepare_newsletter_campaign(uuid) from public, anon, authenticated;
grant execute on function public.prepare_newsletter_campaign(uuid) to service_role;
