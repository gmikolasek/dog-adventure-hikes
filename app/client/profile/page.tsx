'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getUserState, landingRoute, type Dog } from '@/lib/userState'
import { uploadDogProfilePhoto } from '@/lib/photos'

export default function ClientProfile() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [dog, setDog] = useState<Dog | null>(null)
  const [userId, setUserId] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const state = await getUserState(session.user.id)
      if (landingRoute(state) !== '/client/home') { router.push(landingRoute(state)); return }

      setUserId(session.user.id)
      const primary = state.dogs[0] ?? null
      setDog(primary)
      setPhotoUrl(primary?.photo_url ?? null)
      setReady(true)
    }
    load()
  }, [router])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    handleUpload(file)
  }

  async function handleUpload(file: File) {
    if (!dog) return
    setUploading(true)
    setError('')
    setSuccess(false)

    const url = await uploadDogProfilePhoto(file, userId, dog.id)
    if (!url) {
      setError('Upload failed — please try again.')
      setUploading(false)
      return
    }

    const { error: dbErr } = await supabase
      .from('dogs')
      .update({ photo_url: url })
      .eq('id', dog.id)

    if (dbErr) {
      setError('Photo uploaded but could not save — please try again.')
    } else {
      setPhotoUrl(url)
      setPreview(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    }
    setUploading(false)
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  const displayed = preview ?? photoUrl

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/client/home')}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 text-lg leading-none"
          >
            ←
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Dog photo</h1>
        </div>

        {dog ? (
          <div className="text-center">
            <div className="relative inline-block mb-6">
              {displayed ? (
                <div
                  className="w-36 h-36 rounded-full bg-cover bg-center mx-auto"
                  style={{ backgroundImage: `url(${displayed})` }}
                  role="img"
                  aria-label={dog.name}
                />
              ) : (
                <div className="w-36 h-36 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <span className="text-6xl">🐕</span>
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <p className="text-white text-xs font-medium">Uploading…</p>
                </div>
              )}
            </div>

            <p className="text-lg font-semibold text-gray-900 mb-1">{dog.name}</p>
            {dog.breed && <p className="text-sm text-gray-500 mb-6">{dog.breed}</p>}

            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full bg-green-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : photoUrl ? 'Change photo' : 'Add photo'}
            </button>

            <p className="text-xs text-gray-400 mt-3">
              Choose from your camera roll or take a new photo.
            </p>

            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            {success && <p className="text-sm text-green-600 mt-3">Photo saved.</p>}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-500">No dog profile found.</p>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

      </div>
    </main>
  )
}
