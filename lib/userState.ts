import { supabase } from './supabase'

// One row per dog as we need it across the client pages.
export type Dog = {
  id: string
  owner_id: string
  name: string
  breed: string | null
  photo_url: string | null
  approval_status: string | null
  approval_conditions: string | null
}

export type Profile = {
  id: string
  name: string | null
  role: string | null
  language: string | null
  address: string | null
  zone_id: string | null
  contract_accepted_at: string | null
}

export type UserState = {
  profile: Profile | null
  dogs: Dog[]
}

// Fetch everything we need to decide where a logged-in user belongs.
export async function getUserState(userId: string): Promise<UserState> {
  const { data: profile } = await supabase
    .from('users')
    .select('id, name, role, language, address, zone_id, contract_accepted_at')
    .eq('id', userId)
    .maybeSingle()

  const { data: dogs } = await supabase
    .from('dogs')
    .select('id, owner_id, name, breed, photo_url, approval_status, approval_conditions')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })

  return { profile: (profile as Profile) ?? null, dogs: (dogs as Dog[]) ?? [] }
}

// The single source of truth for where a user should land based on their state.
export function landingRoute(state: UserState): string {
  const { profile, dogs } = state

  // No profile row yet → start onboarding (step 1: name/language/address).
  if (!profile) return '/onboarding'

  // Staff always go to the staff dashboard.
  if (profile.role === 'staff') return '/staff'

  // Profile exists but no dog submitted yet → dog step.
  if (dogs.length === 0) return '/onboarding/dog'

  // Dog submitted but contract not accepted → contract step.
  if (!profile.contract_accepted_at) return '/onboarding/contract'

  // Contract accepted; check dog approval status.
  const hasApprovedDog = dogs.some(
    d => d.approval_status === 'approved' || d.approval_status === 'approved_with_conditions'
  )
  if (hasApprovedDog) return '/client'

  // Dogs exist, contract signed, but no dog approved yet → waiting screen.
  return '/onboarding/pending'
}
