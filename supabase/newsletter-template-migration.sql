alter table public.newsletter_campaigns
  add column if not exists headline text,
  add column if not exists image_url text,
  add column if not exists image_alt text not null default '',
  add column if not exists button_label text,
  add column if not exists button_url text;

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
