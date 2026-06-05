-- ============================================================================
-- Dog Adventure Hikes — Phase 8 (delete policies for hike photos)
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- Safe to re-run: policies are DROPped before re-creation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. hike_photos: staff DELETE policy
-- ----------------------------------------------------------------------------
drop policy if exists "staff delete hike_photos" on public.hike_photos;

create policy "staff delete hike_photos" on public.hike_photos
  for delete to authenticated
  using ( public.is_staff() );


-- ----------------------------------------------------------------------------
-- 2. storage.objects: staff can delete from the hikes/ path in dog-photos
-- ----------------------------------------------------------------------------
drop policy if exists "staff delete hike photos from storage" on storage.objects;

create policy "staff delete hike photos from storage"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'dog-photos'
    and (storage.foldername(name))[1] = 'hikes'
    and public.is_staff()
  );
