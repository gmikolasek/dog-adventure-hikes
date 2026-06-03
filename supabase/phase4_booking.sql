-- ============================================================================
-- Dog Adventure Hikes — Phase 4 (real booking flow)
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- Safe to re-run: tables use IF NOT EXISTS; every policy is dropped first.
--
-- ASSUMPTION: zones.id is `uuid` (matches users.id / dogs.id). If your zones.id
-- is bigint/int instead, change `zones uuid[]` below to `zones bigint[]`.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Staff helper (re-declared so this file is self-contained; identical to
--    the one created in phase2_rls.sql).
-- ----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'staff');
$$;
revoke execute on function public.is_staff() from public, anon;
grant  execute on function public.is_staff() to authenticated;


-- ----------------------------------------------------------------------------
-- 1. hike_days — Zoloo's weekly availability. One row per calendar day she opens.
-- ----------------------------------------------------------------------------
create table if not exists public.hike_days (
  id                  uuid primary key default gen_random_uuid(),
  date                date not null,
  status              text not null default 'open'
                        check (status in ('open','full','blocked','cancelled')),
  capacity            integer not null default 10,
  allow_over_capacity boolean not null default false,
  zones               uuid[] not null default '{}',   -- zone ids running that day
  destination_override text,
  client_note         text,
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now()
);
-- One configurable row per calendar day.
create unique index if not exists hike_days_date_key on public.hike_days(date);


-- ----------------------------------------------------------------------------
-- 2. bookings — one row per dog per hike day.
-- ----------------------------------------------------------------------------
create table if not exists public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  dog_id              uuid not null references public.dogs(id),
  owner_id            uuid not null references public.users(id),
  hike_day_id         uuid not null references public.hike_days(id),
  status              text not null default 'pending_payment'
                        check (status in ('pending_payment','confirmed','cancelled','no_show')),
  pickup_method       text check (pickup_method in ('curbside','home')),
  dropoff_method      text check (dropoff_method in ('curbside','home')),
  amount_charged      integer not null default 50000,
  discount_applied    integer not null default 0,
  credit_used         integer not null default 0,
  cancelled_at        timestamptz,
  cancellation_reason text,
  created_at          timestamptz not null default now()
);
create index if not exists bookings_owner_idx    on public.bookings(owner_id);
create index if not exists bookings_hike_day_idx on public.bookings(hike_day_id);


-- ----------------------------------------------------------------------------
-- 3. trail_pack_credits — prepaid hike credits (4-for-3 Trail Pack).
-- ----------------------------------------------------------------------------
create table if not exists public.trail_pack_credits (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.users(id),
  credits_remaining integer not null default 0,
  purchase_amount   integer not null default 0,   -- ₮ paid for the pack
  expires_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists trail_pack_credits_owner_idx on public.trail_pack_credits(owner_id);


-- ----------------------------------------------------------------------------
-- 4. Availability helper — clients can only read their OWN bookings (below),
--    so they can't count a day's total to know remaining capacity. This
--    SECURITY DEFINER function returns only per-day confirmed counts (no
--    individual booking data), which is safe to expose to all clients.
-- ----------------------------------------------------------------------------
create or replace function public.hike_day_booked_counts()
returns table (hike_day_id uuid, confirmed integer)
language sql security definer stable
set search_path = public
as $$
  select hike_day_id, count(*)::int
  from public.bookings
  where status = 'confirmed'
  group by hike_day_id;
$$;
revoke execute on function public.hike_day_booked_counts() from public, anon;
grant  execute on function public.hike_day_booked_counts() to authenticated;


-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------
alter table public.hike_days          enable row level security;
alter table public.bookings           enable row level security;
alter table public.trail_pack_credits enable row level security;

-- hike_days: clients read OPEN days; staff read all + insert + update.
drop policy if exists "read open hike_days"   on public.hike_days;
drop policy if exists "staff insert hike_days" on public.hike_days;
drop policy if exists "staff update hike_days" on public.hike_days;

create policy "read open hike_days" on public.hike_days
  for select to authenticated
  using ( status = 'open' or public.is_staff() );

create policy "staff insert hike_days" on public.hike_days
  for insert to authenticated
  with check ( public.is_staff() );

create policy "staff update hike_days" on public.hike_days
  for update to authenticated
  using ( public.is_staff() ) with check ( public.is_staff() );

-- bookings: clients read/insert/update their own; staff read + update all.
drop policy if exists "read own bookings"   on public.bookings;
drop policy if exists "insert own bookings" on public.bookings;
drop policy if exists "update own bookings" on public.bookings;

create policy "read own bookings" on public.bookings
  for select to authenticated
  using ( owner_id = auth.uid() or public.is_staff() );

create policy "insert own bookings" on public.bookings
  for insert to authenticated
  with check ( owner_id = auth.uid() );

create policy "update own bookings" on public.bookings
  for update to authenticated
  using ( owner_id = auth.uid() or public.is_staff() )
  with check ( owner_id = auth.uid() or public.is_staff() );

-- trail_pack_credits: clients read/insert/update their own; staff read all.
drop policy if exists "read own credits"   on public.trail_pack_credits;
drop policy if exists "insert own credits" on public.trail_pack_credits;
drop policy if exists "update own credits" on public.trail_pack_credits;

create policy "read own credits" on public.trail_pack_credits
  for select to authenticated
  using ( owner_id = auth.uid() or public.is_staff() );

create policy "insert own credits" on public.trail_pack_credits
  for insert to authenticated
  with check ( owner_id = auth.uid() );

create policy "update own credits" on public.trail_pack_credits
  for update to authenticated
  using ( owner_id = auth.uid() ) with check ( owner_id = auth.uid() );


-- ----------------------------------------------------------------------------
-- NOTE (MVP / placeholder payment): clients can write their own bookings and
-- credits directly, so amount_charged / credit_used / credits_remaining are
-- client-writable and day capacity is enforced in the app, not the DB. That's
-- fine while Storepay is a placeholder. When real payment lands, move the
-- money-affecting writes (confirm booking, deduct credit, enforce capacity)
-- into SECURITY DEFINER functions / an Edge Function and tighten these policies.
-- ----------------------------------------------------------------------------
