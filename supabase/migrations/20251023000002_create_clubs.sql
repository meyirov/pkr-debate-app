-- Clubs data model

-- Ensure UUID generation is available
create extension if not exists pgcrypto;

-- Clubs table
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city_id text not null,
  description text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_clubs_city on public.clubs(city_id);
create index if not exists idx_clubs_active on public.clubs(is_active);

-- Coordinators: which profiles can manage which clubs
create table if not exists public.club_coordinators (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id, profile_id)
);

create index if not exists idx_coordinators_profile on public.club_coordinators(profile_id);
create index if not exists idx_coordinators_club on public.club_coordinators(club_id);

-- Storage bucket for club logos (public read)
insert into storage.buckets (id, name, public)
values ('club-logos', 'club-logos', true)
on conflict (id) do nothing;

-- Optional seed: Almaty clubs (names only)
insert into public.clubs (name, city_id)
values
  ('SDU QAZAQ DC', 'almaty'),
  ('ТЭО ЖПМ', 'almaty'),
  ('Алтын Сапа ИПК', 'almaty'),
  ('Sirius IDC', 'almaty'),
  ('UIB DC', 'almaty'),
  ('Парасатты НЛО', 'almaty'),
  ('Атамекен ИПК', 'almaty'),
  ('Жастар ИПК', 'almaty'),
  ('Energo DC', 'almaty'),
  ('Technokrat', 'almaty'),
  ('President LDC', 'almaty'),
  ('KBTU DC', 'almaty'),
  ('Патриот', 'almaty'),
  ('Alma Mater LDC', 'almaty'),
  ('Нұр-Мүбәрәк', 'almaty'),
  ('КАУ', 'almaty')
on conflict do nothing;


