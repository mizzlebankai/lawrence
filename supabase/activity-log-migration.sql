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
