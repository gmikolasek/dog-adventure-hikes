-- ============================================================================
-- Dog Adventure Hikes — Phase 9 (client history access to booked hike days)
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- Safe to re-run: policy is DROPped before re-creation.
--
-- Problem: the "read open hike_days" policy only allows clients to read days
-- where status = 'open'. Past hike days with status 'full', 'cancelled', or
-- 'blocked' are invisible to clients — so /client/history can't fetch the date
-- and destination for completed bookings, causing the section to show empty.
--
-- Fix: extend the policy to also allow clients to read any hike_day where they
-- have at least one booking (regardless of the day's current status).
-- ============================================================================

drop policy if exists "read open hike_days" on public.hike_days;

create policy "read open hike_days" on public.hike_days
  for select to authenticated
  using (
    status = 'open'
    or public.is_staff()
    or exists (
      select 1 from public.bookings
      where bookings.hike_day_id = hike_days.id
        and bookings.owner_id    = auth.uid()
    )
  );
