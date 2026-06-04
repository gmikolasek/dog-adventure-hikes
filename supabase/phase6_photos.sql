-- ============================================================================
-- Dog Adventure Hikes — Phase 6 (photo system)
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- policies are DROPped before re-creation.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Add photo_url to dogs (already queried by the app — safe to add again)
-- ----------------------------------------------------------------------------
alter table public.dogs add column if not exists photo_url text;


-- ----------------------------------------------------------------------------
-- 2. hike_photos — one row per photo uploaded by staff after a hike.
--    dog_id is nullable: null means a group photo (no specific dog tagged).
-- ----------------------------------------------------------------------------
create table if not exists public.hike_photos (
  id           uuid        primary key default gen_random_uuid(),
  hike_day_id  uuid        not null references public.hike_days(id) on delete cascade,
  dog_id       uuid        references public.dogs(id) on delete set null,
  uploaded_by  uuid        not null references public.users(id),
  storage_path text        not null,   -- path within the dog-photos bucket, e.g. hikes/{id}/{ts}.jpg
  caption      text,
  taken_at     timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists hike_photos_hike_day_idx on public.hike_photos(hike_day_id);
create index if not exists hike_photos_dog_idx      on public.hike_photos(dog_id);


-- ----------------------------------------------------------------------------
-- 3. RLS for hike_photos
-- ----------------------------------------------------------------------------
alter table public.hike_photos enable row level security;

drop policy if exists "staff insert hike_photos"  on public.hike_photos;
drop policy if exists "staff update hike_photos"  on public.hike_photos;
drop policy if exists "clients read hike photos"  on public.hike_photos;

-- Only staff can upload photos.
create policy "staff insert hike_photos" on public.hike_photos
  for insert to authenticated
  with check ( public.is_staff() );

create policy "staff update hike_photos" on public.hike_photos
  for update to authenticated
  using     ( public.is_staff() )
  with check( public.is_staff() );

-- Staff see all; clients see photos from hike days they attended (confirmed booking).
create policy "clients read hike photos" on public.hike_photos
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.bookings
      where bookings.hike_day_id = hike_photos.hike_day_id
        and bookings.owner_id    = auth.uid()
        and bookings.status      = 'confirmed'
    )
  );


-- ----------------------------------------------------------------------------
-- 4. Storage RLS for the dog-photos bucket
--    (bucket must be created as PUBLIC in the Dashboard first)
--
--    Public bucket: reads are unrestricted — no SELECT policy needed.
--    We only restrict writes via INSERT / UPDATE policies.
-- ----------------------------------------------------------------------------

-- Clients upload to profiles/<their own user id>/...
drop policy if exists "clients upload profile photos" on storage.objects;
create policy "clients upload profile photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dog-photos'
    and split_part(name, '/', 1) = 'profiles'
    and split_part(name, '/', 2) = auth.uid()::text
  );

-- Clients can overwrite their own profile photo (same path, different file).
drop policy if exists "clients update profile photos" on storage.objects;
create policy "clients update profile photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'dog-photos'
    and split_part(name, '/', 1) = 'profiles'
    and split_part(name, '/', 2) = auth.uid()::text
  );

-- Staff upload to hikes/...
drop policy if exists "staff upload hike photos" on storage.objects;
create policy "staff upload hike photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dog-photos'
    and split_part(name, '/', 1) = 'hikes'
    and public.is_staff()
  );
