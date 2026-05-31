'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { getUserState, landingRoute, type Dog } from '@/lib/userState'

const PRICE_PER_DOG = 50000
const TRAIL_PACK_SAVING = 25000

// useSearchParams must sit inside a Suspense boundary for the production build.
export default function Payment() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    }>
      <PaymentInner />
    </Suspense>
  )
}

function PaymentInner() {
  const router = useRouter()
  const params = useSearchParams()

  const dateIso = params.get('date')
  const dogIds = (params.get('dogs') ?? '').split(',').filter(Boolean)
  const pickup = params.get('pickup')

  const [ready, setReady] = useState(false)
  const [dogs, setDogs] = useState<Dog[]>([])
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const state = await getUserState(session.user.id)
      if (landingRoute(state) !== '/client/home') { router.push(landingRoute(state)); return }

      // Need a valid selection to show a summary.
      if (!dateIso || dogIds.length === 0 || !pickup) { router.push('/client/book'); return }

      const selected = state.dogs.filter(d => dogIds.includes(d.id))
      if (selected.length === 0) { router.push('/client/book'); return }
      setDogs(selected)
      setReady(true)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  function confirm() {
    // Placeholder: QPay + bookings table aren't built yet, so we just show a
    // confirmation. No data is persisted.
    setConfirming(true)
    setConfirmed(true)
    setConfirming(false)
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  if (confirmed) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
            <span className="text-4xl">✓</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Booking requested</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            {formatDate(dateIso!)} · {dogs.length} dog{dogs.length > 1 ? 's' : ''}.
            Payment via QPay is coming soon — this is a placeholder confirmation.
          </p>
          <button
            onClick={() => router.push('/client/home')}
            className="w-full bg-green-600 text-white py-3.5 rounded-xl font-medium text-sm hover:bg-green-700 transition-colors"
          >
            Back to home
          </button>
        </div>
      </main>
    )
  }

  const total = dogs.length * PRICE_PER_DOG

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        <button
          onClick={() => router.push('/client/book')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Back
        </button>

        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Payment</h1>
        <p className="text-gray-500 text-sm mb-6">Review your booking</p>

        {/* Order summary */}
        <div className="rounded-2xl border border-gray-200 p-5 mb-4">
          <p className="text-xs text-gray-400 mb-3">Order summary</p>

          <div className="flex items-center justify-between text-sm mb-3 pb-3 border-b border-gray-100">
            <span className="text-gray-600">Hike day</span>
            <span className="font-medium text-gray-900">{formatDate(dateIso!)}</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-3 pb-3 border-b border-gray-100">
            <span className="text-gray-600">Pickup</span>
            <span className="font-medium text-gray-900 capitalize">{pickup}</span>
          </div>

          <div className="space-y-2 mb-3">
            {dogs.map(dog => (
              <div key={dog.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{dog.name}</span>
                <span className="text-gray-900">₮{PRICE_PER_DOG.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Total</span>
            <span className="text-lg font-semibold text-gray-900">₮{total.toLocaleString()}</span>
          </div>
        </div>

        {/* Trail Pack nudge */}
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-xl">🎒</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Save with a Trail Pack</p>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                Buy 4 hikes together and save ₮{TRAIL_PACK_SAVING.toLocaleString()}. Credits are
                added to your account immediately.
              </p>
            </div>
          </div>
        </div>

        {/* Payment method */}
        <p className="text-sm font-medium text-gray-700 mb-2">Payment method</p>
        <div className="rounded-2xl border-2 border-green-500 bg-green-50 p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-green-700">QPay</span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">QPay</p>
            <p className="text-xs text-gray-500">Scan to pay (coming soon)</p>
          </div>
        </div>

        {/* Cancellation reminder */}
        <div className="rounded-xl bg-gray-50 p-4 mb-6">
          <p className="text-xs font-medium text-gray-700 mb-1">Cancellation policy</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            More than 12 hours before the hike: fee held as credit. Within 12 hours or no-show:
            full fee forfeited. Service-cancelled hikes are fully credited.
          </p>
        </div>

        <button
          onClick={confirm}
          disabled={confirming}
          className="w-full bg-green-600 text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
        >
          {confirming ? 'Confirming…' : `Confirm & pay ₮${total.toLocaleString()}`}
        </button>
        <p className="text-xs text-gray-400 text-center mt-3">
          You won&apos;t be charged — payment is not yet enabled.
        </p>

      </div>
    </main>
  )
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}
