-- Prevent duplicate confirmed bookings for the same dog on the same hike day.
-- A partial unique index covers only confirmed rows, so cancelled/no_show
-- bookings do not block re-booking the same dog on the same day.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query)
-- BEFORE deploying the booking-page UI changes.

CREATE UNIQUE INDEX IF NOT EXISTS bookings_dog_hike_day_unique
  ON public.bookings(dog_id, hike_day_id)
  WHERE status = 'confirmed';
