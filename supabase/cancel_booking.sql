-- ============================================================================
-- Dog Adventure Hikes — cancel_booking SECURITY DEFINER function
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
--
-- WHY: the client previously issued two separate calls (update bookings, insert
-- trail_pack_credits). Because the insert RLS allows any authenticated user to
-- insert their own credit rows, a logged-in user could bypass the cutoff check
-- and mint free credits by calling the insert directly.
--
-- This function runs as a trusted server-side caller, so:
--   - It verifies the booking belongs to auth.uid() and is still confirmed.
--   - It computes credit eligibility against server now() — the client cannot
--     manipulate this.
--   - It performs both the cancel update and the credit insert in a single
--     function body (Postgres wraps plpgsql functions in an implicit
--     subtransaction, so both succeed or both fail together).
-- ============================================================================

create or replace function public.cancel_booking(booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking  bookings%rowtype;
  v_hike_date date;
  v_cutoff   timestamptz;
  v_credit   boolean;
  v_expires  timestamptz;
begin
  -- 1. Load the booking and verify it belongs to the caller and is still open.
  select * into v_booking
  from public.bookings
  where id = booking_id
    and owner_id = auth.uid()
    and status   = 'confirmed';

  if not found then
    return jsonb_build_object('error', 'booking_not_found_or_not_eligible');
  end if;

  -- 2. Fetch the hike date from hike_days.
  select date into v_hike_date
  from public.hike_days
  where id = v_booking.hike_day_id;

  if not found then
    return jsonb_build_object('error', 'hike_day_not_found');
  end if;

  -- 3. Compute the cutoff: 5pm Ulaanbaatar (UTC+8) the day before the hike
  --    = 09:00 UTC the day before hike_date.
  v_cutoff := ((v_hike_date - 1)::timestamp + interval '9 hours') at time zone 'UTC';
  v_credit  := now() < v_cutoff;

  -- 4. Cancel the booking.
  update public.bookings
     set status              = 'cancelled',
         cancelled_at        = now(),
         cancellation_reason = 'Client cancelled'
   where id = booking_id;

  -- 5. Issue one credit if eligible.
  if v_credit then
    v_expires := now() + interval '60 days';
    insert into public.trail_pack_credits(owner_id, credits_remaining, purchase_amount, expires_at)
    values (auth.uid(), 1, 0, v_expires);
  end if;

  return jsonb_build_object('ok', true, 'credit_issued', v_credit);
end;
$$;

-- Revoke from public/anon; grant only to authenticated users.
revoke execute on function public.cancel_booking(uuid) from public, anon;
grant  execute on function public.cancel_booking(uuid) to authenticated;


-- ============================================================================
-- NOTE on trail_pack_credits INSERT policy
-- The existing "insert own credits" RLS policy is still required by the
-- addTrailPack() client flow (Trail Pack purchase). Until that purchase path
-- also moves to a SECURITY DEFINER function, leave the INSERT policy in place.
-- The cancel_booking function above is the primary mitigation — clients can no
-- longer use it to issue credits outside the cancellation path.
-- ============================================================================
