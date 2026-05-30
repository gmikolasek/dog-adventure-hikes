-- ============================================================================
-- Dog Adventure Hikes — Phase 2 (staff side) RLS policies
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- Safe to re-run: every policy is dropped first, then recreated.
--
-- These are ADDITIVE. Postgres combines permissive policies with OR, so adding
-- staff policies does NOT remove clients' existing access to their own rows.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Make sure RLS is actually on (it already is, but this is idempotent).
-- ----------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.dogs  enable row level security;
alter table public.zones enable row level security;


-- ----------------------------------------------------------------------------
-- 1. Helper: is the *current* user a staff member?
--
-- SECURITY DEFINER runs the function as its owner and bypasses RLS, so the
-- policy on `users` that calls this does NOT recurse into the users table's
-- own SELECT policy (which would otherwise be an infinite loop).
-- STABLE lets Postgres cache it within a single statement.
-- ----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'staff'
  );
$$;

-- Only logged-in users should be able to call it.
revoke execute on function public.is_staff() from public, anon;
grant  execute on function public.is_staff() to authenticated;


-- ----------------------------------------------------------------------------
-- 2. users — staff can read and update every client row
--    (clients keep their own existing self-access policies untouched).
-- ----------------------------------------------------------------------------
drop policy if exists "staff read all users"   on public.users;
drop policy if exists "staff update all users" on public.users;

create policy "staff read all users"
  on public.users
  for select
  to authenticated
  using ( public.is_staff() );

create policy "staff update all users"
  on public.users
  for update
  to authenticated
  using      ( public.is_staff() )   -- which rows staff may target
  with check ( public.is_staff() );  -- staff may write any values to them


-- ----------------------------------------------------------------------------
-- 3. dogs — staff can read every dog and update approval fields
--    (approval_status, approval_conditions, decline_reason, approved_at, approved_by).
-- ----------------------------------------------------------------------------
drop policy if exists "staff read all dogs"   on public.dogs;
drop policy if exists "staff update all dogs" on public.dogs;

create policy "staff read all dogs"
  on public.dogs
  for select
  to authenticated
  using ( public.is_staff() );

create policy "staff update all dogs"
  on public.dogs
  for update
  to authenticated
  using      ( public.is_staff() )
  with check ( public.is_staff() );


-- ----------------------------------------------------------------------------
-- 4. zones — any logged-in user may read the zone list.
--    (The zone-assignment screen is staff-only in the app, and zone names
--     aren't sensitive. To restrict to staff only, swap `true` for
--     `public.is_staff()`.)
-- ----------------------------------------------------------------------------
drop policy if exists "authenticated read zones" on public.zones;

create policy "authenticated read zones"
  on public.zones
  for select
  to authenticated
  using ( true );


-- ----------------------------------------------------------------------------
-- 5. Promote your staff member. Replace the phone with Zoloo's real number
--    (E.164, e.g. +97688001234). Run this once.
-- ----------------------------------------------------------------------------
-- update public.users set role = 'staff' where phone = '+976XXXXXXXX';
