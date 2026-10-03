alter table public.site_sections
  add column if not exists image_fit text not null default 'cover' check (image_fit in ('cover', 'contain')),
  add column if not exists image_zoom_x int not null default 100 check (image_zoom_x between 100 and 200),
  add column if not exists image_zoom_y int not null default 100 check (image_zoom_y between 100 and 200),
  add column if not exists image_position_x int not null default 50 check (image_position_x between 0 and 100),
  add column if not exists image_position_y int not null default 50 check (image_position_y between 0 and 100);

alter table public.leadership
  add column if not exists image_fit text not null default 'cover' check (image_fit in ('cover', 'contain')),
  add column if not exists image_zoom_x int not null default 100 check (image_zoom_x between 100 and 200),
  add column if not exists image_zoom_y int not null default 100 check (image_zoom_y between 100 and 200),
  add column if not exists image_position_x int not null default 50 check (image_position_x between 0 and 100),
  add column if not exists image_position_y int not null default 50 check (image_position_y between 0 and 100);

alter table public.gallery_items
  add column if not exists image_fit text not null default 'cover' check (image_fit in ('cover', 'contain')),
  add column if not exists image_zoom_x int not null default 100 check (image_zoom_x between 100 and 200),
  add column if not exists image_zoom_y int not null default 100 check (image_zoom_y between 100 and 200),
  add column if not exists image_position_x int not null default 50 check (image_position_x between 0 and 100),
  add column if not exists image_position_y int not null default 50 check (image_position_y between 0 and 100);
