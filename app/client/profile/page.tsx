'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getUserState, landingRoute } from '@/lib/userState'
import { uploadDogProfilePhoto } from '@/lib/photos'

// ─── Types ───────────────────────────────────────────────────────────────────

type DogFull = {
  id: string
  name: string
  breed: string | null
  age_years: number | null
  weight_kg: number | null
  sex: string | null
  recall_score: number | null
  car_score: number | null
  social_score: number | null
  known_aggression: boolean | null
  airtag_confirmed: boolean | null
  ecollar: boolean | null
  disposition_notes: string | null
  other_notes: string | null
  photo_url: string | null
  approval_status: string | null
  approval_conditions: string | null
}

type EditForm = {
  breed: string
  age_years: string
  weight_kg: string
  recall_score: number
  car_score: number
  social_score: number
  known_aggression: boolean | null
  airtag_confirmed: boolean | null
  ecollar: boolean | null
  disposition_notes: string
  other_notes: string
}

function initForm(dog: DogFull): EditForm {
  return {
    breed: dog.breed ?? '',
    age_years: dog.age_years != null ? String(dog.age_years) : '',
    weight_kg: dog.weight_kg != null ? String(dog.weight_kg) : '',
    recall_score: dog.recall_score ?? 0,
    car_score: dog.car_score ?? 0,
    social_score: dog.social_score ?? 0,
    known_aggression: dog.known_aggression,
    airtag_confirmed: dog.airtag_confirmed,
    ecollar: dog.ecollar,
    disposition_notes: dog.disposition_notes ?? '',
    other_notes: dog.other_notes ?? '',
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClientProfile() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [dogs, setDogs] = useState<DogFull[]>([])
  const [userId, setUserId] = useState('')

  // Photo upload — one hidden input, track which dog is pending
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingDogRef = useRef<string | null>(null)
  const [uploadingDogId, setUploadingDogId] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<{ dogId: string; url: string } | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState(false)

  // Profile editing
  const [editingDogId, setEditingDogId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const state = await getUserState(session.user.id)
      if (landingRoute(state) !== '/client/home') { router.push(landingRoute(state)); return }

      setUserId(session.user.id)

      const { data: dogRows } = await supabase
        .from('dogs')
        .select('id, name, breed, age_years, weight_kg, sex, recall_score, car_score, social_score, known_aggression, airtag_confirmed, ecollar, disposition_notes, other_notes, photo_url, approval_status, approval_conditions')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: true })

      setDogs((dogRows ?? []) as DogFull[])
      setReady(true)
    }
    load()
  }, [router])

  function handlePhotoClick(dogId: string) {
    pendingDogRef.current = dogId
    fileRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const dogId = pendingDogRef.current
    if (!file || !dogId) return
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview({ dogId, url: ev.target?.result as string })
    reader.readAsDataURL(file)
    handleUpload(file, dogId)
    e.target.value = '' // allow re-selecting same file
  }

  async function handleUpload(file: File, dogId: string) {
    setUploadingDogId(dogId)
    setUploadError('')
    setUploadSuccess(false)

    const url = await uploadDogProfilePhoto(file, userId, dogId)
    if (!url) {
      setUploadError('Upload failed — please try again.')
      setUploadingDogId(null)
      return
    }

    const { error: dbErr } = await supabase
      .from('dogs')
      .update({ photo_url: url })
      .eq('id', dogId)

    if (dbErr) {
      setUploadError('Photo uploaded but could not save.')
    } else {
      setDogs(prev => prev.map(d => d.id === dogId ? { ...d, photo_url: url } : d))
      setPhotoPreview(null)
      setUploadSuccess(true)
      setTimeout(() => setUploadSuccess(false), 2500)
    }
    setUploadingDogId(null)
  }

  function startEdit(dog: DogFull) {
    setEditingDogId(dog.id)
    setEditForm(initForm(dog))
    setSaveError('')
    setSaveSuccess(false)
  }

  function cancelEdit() {
    setEditingDogId(null)
    setEditForm(null)
  }

  function upd<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setEditForm(prev => prev ? { ...prev, [key]: value } : prev)
  }

  async function saveEdit(dogId: string) {
    if (!editForm) return
    setSaving(true)
    setSaveError('')

    const ageNum = editForm.age_years ? parseFloat(editForm.age_years) : null
    const weightNum = editForm.weight_kg ? parseFloat(editForm.weight_kg) : null

    const { error } = await supabase
      .from('dogs')
      .update({
        breed:             editForm.breed.trim() || null,
        age_years:         ageNum != null && !isNaN(ageNum) ? ageNum : null,
        weight_kg:         weightNum != null && !isNaN(weightNum) ? weightNum : null,
        recall_score:      editForm.recall_score || null,
        car_score:         editForm.car_score || null,
        social_score:      editForm.social_score || null,
        known_aggression:  editForm.known_aggression,
        airtag_confirmed:  editForm.airtag_confirmed,
        ecollar:           editForm.ecollar,
        disposition_notes: editForm.disposition_notes.trim() || null,
        other_notes:       editForm.other_notes.trim() || null,
      })
      .eq('id', dogId)

    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }

    setDogs(prev => prev.map(d => d.id !== dogId ? d : {
      ...d,
      breed:             editForm.breed.trim() || null,
      age_years:         ageNum != null && !isNaN(ageNum) ? ageNum : null,
      weight_kg:         weightNum != null && !isNaN(weightNum) ? weightNum : null,
      recall_score:      editForm.recall_score || null,
      car_score:         editForm.car_score || null,
      social_score:      editForm.social_score || null,
      known_aggression:  editForm.known_aggression,
      airtag_confirmed:  editForm.airtag_confirmed,
      ecollar:           editForm.ecollar,
      disposition_notes: editForm.disposition_notes.trim() || null,
      other_notes:       editForm.other_notes.trim() || null,
    }))

    setEditingDogId(null)
    setEditForm(null)
    setSaving(false)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
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

        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/client/home')}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 text-lg leading-none"
          >
            ←
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Dog profile</h1>
        </div>

        {dogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-500">No dog profile found.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {dogs.map(dog => {
              const isUploading = uploadingDogId === dog.id
              const preview = photoPreview?.dogId === dog.id ? photoPreview.url : null
              const displayed = preview ?? dog.photo_url
              const isEditing = editingDogId === dog.id

              return (
                <div key={dog.id} className="rounded-2xl border border-gray-200 overflow-hidden">
                  {/* Dog header row */}
                  <div className="flex items-center gap-4 p-4">
                    {/* Photo tap zone */}
                    <button
                      onClick={() => handlePhotoClick(dog.id)}
                      disabled={isUploading}
                      className="relative flex-shrink-0"
                      title="Change photo"
                    >
                      {displayed ? (
                        <div
                          className="w-16 h-16 rounded-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${displayed})` }}
                          role="img"
                          aria-label={dog.name}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                          <span className="text-3xl">🐕</span>
                        </div>
                      )}
                      {isUploading && (
                        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                          <p className="text-white text-[10px] font-medium">…</p>
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-green-600 border-2 border-white flex items-center justify-center">
                        <span className="text-white text-[9px] leading-none">✏</span>
                      </div>
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{dog.name}</p>
                      <p className="text-xs text-gray-500">
                        {[dog.breed, dog.sex, dog.age_years ? `${dog.age_years}y` : null, dog.weight_kg ? `${dog.weight_kg}kg` : null]
                          .filter(Boolean).join(' · ') || 'No details yet'}
                      </p>
                      {dog.approval_status === 'approved_with_conditions' && dog.approval_conditions && (
                        <p className="text-xs text-amber-600 mt-0.5 truncate">{dog.approval_conditions}</p>
                      )}
                    </div>

                    <button
                      onClick={() => isEditing ? cancelEdit() : startEdit(dog)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border flex-shrink-0 transition-colors ${
                        isEditing
                          ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          : 'border-green-200 text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {isEditing ? 'Cancel' : 'Edit'}
                    </button>
                  </div>

                  {/* Edit form */}
                  {isEditing && editForm && (
                    <div className="border-t border-gray-100 px-4 pb-4 pt-4 space-y-4">

                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Breed</label>
                        <input
                          type="text"
                          value={editForm.breed}
                          onChange={e => upd('breed', e.target.value)}
                          placeholder="e.g. Labrador Retriever"
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Age (years)</label>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="0.5"
                            value={editForm.age_years}
                            onChange={e => upd('age_years', e.target.value)}
                            placeholder="3"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Weight (kg)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={editForm.weight_kg}
                            onChange={e => upd('weight_kg', e.target.value)}
                            placeholder="15"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      </div>

                      <ScoreField label="Recall score" value={editForm.recall_score} onChange={v => upd('recall_score', v)} />
                      <ScoreField label="Car score"    value={editForm.car_score}    onChange={v => upd('car_score', v)} />
                      <ScoreField label="Social score" value={editForm.social_score} onChange={v => upd('social_score', v)} />

                      <YesNoField label="Known aggression" value={editForm.known_aggression} onChange={v => upd('known_aggression', v)} />
                      <YesNoField label="AirTag confirmed"  value={editForm.airtag_confirmed} onChange={v => upd('airtag_confirmed', v)} />
                      <YesNoField label="E-collar"         value={editForm.ecollar}          onChange={v => upd('ecollar', v)} />

                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Disposition notes</label>
                        <textarea
                          rows={3}
                          value={editForm.disposition_notes}
                          onChange={e => upd('disposition_notes', e.target.value)}
                          placeholder="Personality, triggers, things to know…"
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Other notes</label>
                        <textarea
                          rows={2}
                          value={editForm.other_notes}
                          onChange={e => upd('other_notes', e.target.value)}
                          placeholder="Vet contact, medication, anything else…"
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>

                      {saveError && <p className="text-xs text-red-500">{saveError}</p>}

                      <button
                        onClick={() => saveEdit(dog.id)}
                        disabled={saving}
                        className="w-full bg-green-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {uploadError  && <p className="text-sm text-red-500 mt-4 text-center">{uploadError}</p>}
        {uploadSuccess && <p className="text-sm text-green-600 mt-4 text-center">Photo saved.</p>}
        {saveSuccess   && <p className="text-sm text-green-600 mt-4 text-center">Profile saved.</p>}

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

// ─── Form field components ────────────────────────────────────────────────────

function ScoreField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-10 h-10 rounded-full text-sm font-medium border-2 transition-colors ${
              value === n
                ? 'bg-green-600 border-green-600 text-white'
                : 'border-gray-200 text-gray-500 hover:border-green-400'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-400">Poor</span>
        <span className="text-[10px] text-gray-400">Excellent</span>
      </div>
    </div>
  )
}

function YesNoField({ label, value, onChange }: {
  label: string
  value: boolean | null
  onChange: (v: boolean) => void
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <div className="flex gap-2">
        {([true, false] as const).map(b => (
          <button
            key={String(b)}
            type="button"
            onClick={() => onChange(b)}
            className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${
              value === b
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {b ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  )
}
