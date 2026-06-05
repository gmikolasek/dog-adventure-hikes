-- ============================================================================
-- Dog Adventure Hikes — Phase 7 (intraday run control)
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- ============================================================================

-- Add pickup/dropoff timestamps to bookings.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS picked_up_at  timestamptz,
  ADD COLUMN IF NOT EXISTS dropped_off_at timestamptz;

-- Staff need to update any booking's pick-up/drop-off timestamps.
-- The existing "update own bookings" policy already allows staff to update all
-- bookings (via is_staff()), so no new policy is needed for bookings.
-- Verify the existing policy covers staff updates if you encounter issues.
