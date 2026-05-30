'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function StaffDashboard() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [activeClients, setActiveClients] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      // Only staff may view this area.
      const { data: profile } = await supabase
        .from('users')
        .select('name, role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (profile?.role !== 'staff') { router.push('/onboarding'); return }
      setStaffName(profile.name ?? '')

      const { count: pending } = await supabase
        .from('dogs')
        .select('id', { count: 'exact', head: true })
        .eq('approval_status', 'pending')
      setPendingCount(pending ?? 0)

      const { count: active } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'client')
        .not('approved_at', 'is', null)
      setActiveClients(active ?? 0)

      setReady(true)
    }
    load()
  }, [router])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
              <span className="text-2xl">🥾</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">
                {staffName ? `Hi, ${staffName}` : 'Staff'}
              </h1>
              <p className="text-gray-500 text-xs">Dog Adventure Hikes · Staff</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-3xl font-semibold text-gray-900">{pendingCount}</p>
            <p className="text-xs text-gray-500 mt-1">Pending approvals</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-3xl font-semibold text-gray-900">{activeClients}</p>
            <p className="text-xs text-gray-500 mt-1">Active clients</p>
          </div>
        </div>

        <button
          onClick={() => router.push('/staff/approvals')}
          className="w-full flex items-center justify-between rounded-xl border-2 border-green-500 bg-green-50 px-4 py-4 text-left hover:bg-green-100 transition-colors"
        >
          <span>
            <span className="block text-sm font-semibold text-gray-900">New dog approvals</span>
            <span className="block text-xs text-gray-500 mt-0.5">Review, approve and assign zones</span>
          </span>
          <span className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-green-600 text-white text-xs font-semibold">
                {pendingCount}
              </span>
            )}
            <span className="text-gray-400">→</span>
          </span>
        </button>

      </div>
    </main>
  )
}
