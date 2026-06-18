'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { uploadDogProfilePhoto } from '@/lib/photos'

// ─── Types ───────────────────────────────────────────────────────────────────

type DogFull = {
  id: string
  name: string
  breed: string | null
  age_years: number | null
  weight_kg: number | null
  sex: string | null
  neutered: boolean | null
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
  decline_reason: string | null
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

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:         '#F5F0E8',
  forest:     '#26452B',
  moss:       '#4D6B46',
  orange:     '#E08A3E',
  brown:      '#3B2A1F',
  cardBorder: '#E8E2D9',
  divider:    '#F0EBE3',
  badgeBg:    '#EEE9E0',
  completeBg: '#E8F0E5',
  muted:      '#8A7E72',
} as const

const FONT = "'Noto Sans', system-ui, sans-serif"

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconPaw({ size = 16, color = T.moss }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <circle cx="5.5" cy="5.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <circle cx="3.5" cy="11" r="2" />
      <circle cx="20.5" cy="11" r="2" />
      <path d="M12 13c-2.5 0-6 2.5-6 6 0 1.5 1 2 2 2h8c1 0 2-.5 2-2 0-3.5-3.5-6-6-6z" />
    </svg>
  )
}

function IconCamera({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function IconPencil({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClientProfile() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [dogs, setDogs] = useState<DogFull[]>([])
  const [userId, setUserId] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)
  const pendingDogRef = useRef<string | null>(null)
  const [uploadingDogId, setUploadingDogId] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<{ dogId: string; url: string } | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState(false)

  const [editingDogId, setEditingDogId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      setUserId(session.user.id)

      const { data: dogRows } = await supabase
        .from('dogs')
        .select('id, name, breed, age_years, weight_kg, sex, neutered, recall_score, car_score, social_score, known_aggression, airtag_confirmed, ecollar, disposition_notes, other_notes, photo_url, approval_status, approval_conditions, decline_reason')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: true })

      const loaded = (dogRows ?? []) as DogFull[]
      setDogs(loaded)
      if (loaded.length === 1) {
        setEditingDogId(loaded[0].id)
        setEditForm(initForm(loaded[0]))
      }
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
    e.target.value = ''
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
      <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen flex items-center justify-center px-6">
        <p style={{ color: T.muted }} className="text-sm">Loading…</p>
      </main>
    )
  }

  return (
    <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen pb-0">
      <div className="w-full max-w-sm mx-auto px-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between pt-12 pb-6">
          <button
            onClick={() => router.push('/client/home')}
            style={{ backgroundColor: T.cardBorder, borderRadius: '50%', width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.forest} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <h1 style={{ color: T.brown, fontWeight: 700, fontFamily: FONT, fontSize: 18 }}>My Dogs</h1>
          {dogs.length === 1 ? (
            <button
              onClick={() => router.push('/onboarding/dog?new=1')}
              style={{ backgroundColor: '#EEE9E0', color: T.forest, borderRadius: 20, padding: '5px 12px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: FONT }}
            >
              + Add dog
            </button>
          ) : (
            <div style={{ width: 36 }} />
          )}
        </div>

        {/* ── Status messages ── */}
        {uploadError && <p style={{ color: '#C1562D', fontSize: 13, fontFamily: FONT, textAlign: 'center', marginBottom: 8 }}>{uploadError}</p>}
        {uploadSuccess && <p style={{ color: T.moss, fontSize: 13, fontFamily: FONT, textAlign: 'center', marginBottom: 8 }}>Photo saved.</p>}
        {saveSuccess && <p style={{ color: T.moss, fontSize: 13, fontFamily: FONT, textAlign: 'center', marginBottom: 8 }}>Profile saved.</p>}

        {/* ── Dog list ── */}
        {dogs.length === 0 ? (
          <p style={{ color: T.muted, fontSize: 14, fontFamily: FONT, textAlign: 'center', padding: '32px 0' }}>No dog profile yet.</p>
        ) : (
          <div style={dogs.length === 1 ? { marginBottom: 16 } : { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
            {dogs.map(dog => {
              const isUploading = uploadingDogId === dog.id
              const displayed = (photoPreview?.dogId === dog.id ? photoPreview.url : null) ?? dog.photo_url
              const isEditing = editingDogId === dog.id
              const metaChunks = [
                dog.breed,
                dog.sex ? (dog.sex.charAt(0).toUpperCase() + dog.sex.slice(1).toLowerCase()) + (dog.neutered ? ' · neutered' : '') : null,
                dog.age_years != null ? `${dog.age_years}y` : null,
                dog.weight_kg != null ? `${dog.weight_kg}kg` : null,
              ].filter(Boolean).join(' · ')

              return (
                <div key={dog.id} style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 16 }}>
                  {/* Dog card header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Photo */}
                    <button
                      onClick={() => handlePhotoClick(dog.id)}
                      disabled={isUploading}
                      style={{ position: 'relative', cursor: 'pointer', background: 'none', border: 'none', padding: 0, flexShrink: 0 }}
                      title="Change photo"
                    >
                      {displayed ? (
                        <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundImage: `url(${displayed})`, backgroundSize: 'cover', backgroundPosition: 'center top', border: `2px solid ${T.forest}` }} />
                      ) : (
                        <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: T.badgeBg, border: `2px solid ${T.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IconPaw size={22} color={T.moss} />
                        </div>
                      )}
                      {isUploading && (
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <p style={{ color: '#fff', fontSize: 9 }}>…</p>
                        </div>
                      )}
                      <div style={{ position: 'absolute', bottom: -1, right: -1, width: 20, height: 20, borderRadius: '50%', backgroundColor: T.forest, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid white', pointerEvents: 'none' }}>
                        <IconCamera size={10} color="#fff" />
                      </div>
                    </button>

                    {/* Name + badge + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 16, fontWeight: 700, color: T.brown, fontFamily: FONT, margin: '0 0 4px' }}>{dog.name}</p>
                      <ApprovalBadge status={dog.approval_status} />
                      {dog.approval_status === 'approved_with_conditions' && dog.approval_conditions && (
                        <p style={{ fontSize: 12, color: T.muted, fontFamily: FONT, marginTop: 4, lineHeight: 1.5 }}>{dog.approval_conditions}</p>
                      )}
                      {dog.approval_status === 'declined' && dog.decline_reason && (
                        <p style={{ fontSize: 12, color: T.muted, fontFamily: FONT, marginTop: 4, lineHeight: 1.5 }}>{dog.decline_reason}</p>
                      )}
                      {metaChunks && (
                        <p style={{ fontSize: 12, color: T.muted, fontFamily: FONT, marginTop: 4 }}>{metaChunks}</p>
                      )}
                    </div>

                    {/* Edit / Cancel button */}
                    <button
                      onClick={() => isEditing ? cancelEdit() : startEdit(dog)}
                      style={{
                        backgroundColor: isEditing ? T.cardBorder : T.forest,
                        color: isEditing ? T.brown : '#fff',
                        borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                        fontFamily: FONT, border: 'none', cursor: 'pointer', flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {isEditing ? 'Cancel' : <><IconPencil size={12} color="#fff" /> Edit</>}
                    </button>
                  </div>

                  {/* Edit form */}
                  {isEditing && editForm && (
                    <div style={{ borderTop: `1px solid ${T.cardBorder}`, marginTop: 16, paddingTop: 16 }}>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', color: T.muted, fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>Breed</label>
                        <input
                          type="text"
                          value={editForm.breed}
                          onChange={e => upd('breed', e.target.value)}
                          placeholder="e.g. Labrador Retriever"
                          style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.cardBorder}`, padding: '10px 12px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', outline: 'none', fontFamily: FONT, boxSizing: 'border-box' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div>
                          <label style={{ display: 'block', color: T.muted, fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>Age (years)</label>
                          <input
                            type="number" min="0" max="20" step="0.5"
                            value={editForm.age_years}
                            onChange={e => upd('age_years', e.target.value)}
                            placeholder="3"
                            style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.cardBorder}`, padding: '10px 12px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', outline: 'none', fontFamily: FONT, boxSizing: 'border-box' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', color: T.muted, fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>Weight (kg)</label>
                          <input
                            type="number" min="0" max="100" step="0.5"
                            value={editForm.weight_kg}
                            onChange={e => upd('weight_kg', e.target.value)}
                            placeholder="15"
                            style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.cardBorder}`, padding: '10px 12px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', outline: 'none', fontFamily: FONT, boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>

                      <ScoreField label="Recall score"  value={editForm.recall_score} onChange={v => upd('recall_score', v)} />
                      <ScoreField label="Car score"     value={editForm.car_score}    onChange={v => upd('car_score', v)} />
                      <ScoreField label="Social score"  value={editForm.social_score} onChange={v => upd('social_score', v)} />

                      <YesNoField label="Known aggression"  value={editForm.known_aggression}  onChange={v => upd('known_aggression', v)} />
                      <YesNoField label="AirTag confirmed"  value={editForm.airtag_confirmed}  onChange={v => upd('airtag_confirmed', v)} />
                      <YesNoField label="E-collar"          value={editForm.ecollar}           onChange={v => upd('ecollar', v)} />

                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', color: T.muted, fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>Disposition notes</label>
                        <textarea
                          rows={3}
                          value={editForm.disposition_notes}
                          onChange={e => upd('disposition_notes', e.target.value)}
                          placeholder="Personality, triggers, things to know…"
                          style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.cardBorder}`, padding: '10px 12px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', outline: 'none', fontFamily: FONT, boxSizing: 'border-box', resize: 'none' }}
                        />
                      </div>

                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', color: T.muted, fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>Other notes</label>
                        <textarea
                          rows={2}
                          value={editForm.other_notes}
                          onChange={e => upd('other_notes', e.target.value)}
                          placeholder="Vet contact, medication, anything else…"
                          style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.cardBorder}`, padding: '10px 12px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', outline: 'none', fontFamily: FONT, boxSizing: 'border-box', resize: 'none' }}
                        />
                      </div>

                      {saveError && <p style={{ color: '#C1562D', fontSize: 12, fontFamily: FONT, marginBottom: 12 }}>{saveError}</p>}

                      <button
                        onClick={() => saveEdit(dog.id)}
                        disabled={saving}
                        style={{ width: '100%', backgroundColor: T.forest, color: '#fff', borderRadius: 12, padding: '14px 0', fontFamily: FONT, fontWeight: 600, fontSize: 15, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
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

        {/* ── Add a dog (multi-dog only) ── */}
        {dogs.length !== 1 && (
          <button
            onClick={() => router.push('/onboarding/dog?new=1')}
            style={{ width: '100%', backgroundColor: 'white', border: `1px solid ${T.cardBorder}`, color: T.forest, borderRadius: 12, padding: '12px 16px', fontSize: 14, fontFamily: FONT, fontWeight: 600, cursor: 'pointer', marginBottom: 16 }}
          >
            + Add a dog
          </button>
        )}

      </div>

      <DecorativeFooter />

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </main>
  )
}

// ─── Decorative footer SVG ────────────────────────────────────────────────────

function DecorativeFooter() {
  const paws = [
    { x: 35,  y: 52, rot: -20 },
    { x: 95,  y: 72, rot:  15 },
    { x: 160, y: 46, rot: -10 },
    { x: 225, y: 74, rot:  30 },
    { x: 295, y: 50, rot: -25 },
    { x: 348, y: 68, rot:  10 },
  ]
  return (
    <div style={{ marginTop: 24, width: '100%', lineHeight: 0 }}>
      <svg viewBox="0 0 375 110" width="100%" height="110" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet">
        <path d="M0 30 C70 10,160 24,260 13 C312 7,348 19,375 15 L375 110 L0 110 Z" fill="#26452B" />
        {paws.map((p, i) => (
          <g key={i} transform={`translate(${p.x},${p.y}) rotate(${p.rot}) scale(0.833) translate(-12,-12)`}>
            <circle cx="5.5"  cy="5.5" r="2.5" fill="rgba(255,255,255,0.25)" />
            <circle cx="18.5" cy="5.5" r="2.5" fill="rgba(255,255,255,0.25)" />
            <circle cx="3.5"  cy="11"  r="2"   fill="rgba(255,255,255,0.25)" />
            <circle cx="20.5" cy="11"  r="2"   fill="rgba(255,255,255,0.25)" />
            <path d="M12 13c-2.5 0-6 2.5-6 6 0 1.5 1 2 2 2h8c1 0 2-.5 2-2 0-3.5-3.5-6-6-6z" fill="rgba(255,255,255,0.25)" />
          </g>
        ))}
      </svg>
    </div>
  )
}

// ─── Approval badge ───────────────────────────────────────────────────────────

function ApprovalBadge({ status }: { status: string | null }) {
  if (!status) return null
  let bg: string, color: string, label: string
  if (status === 'approved') {
    bg = '#E8F0E5'; color = '#26452B'; label = 'Approved'
  } else if (status === 'approved_with_conditions') {
    bg = '#FEF3C7'; color = '#B45309'; label = 'Approved with conditions'
  } else if (status === 'pending') {
    bg = '#EEE9E0'; color = '#8A7E72'; label = 'Pending review'
  } else {
    bg = '#FEE2E2'; color = '#B91C1C'; label = 'Declined'
  }
  return (
    <span style={{ backgroundColor: bg, color, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontFamily: FONT, fontWeight: 600 }}>
      {label}
    </span>
  )
}

// ─── Form field components ────────────────────────────────────────────────────

function ScoreField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', color: '#8A7E72', fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            style={{
              width: 40, height: 40, borderRadius: '50%', fontSize: 14, fontWeight: 500,
              border: value === n ? 'none' : '1px solid #E8E2D9',
              backgroundColor: value === n ? '#26452B' : 'white',
              color: value === n ? 'white' : '#3B2A1F',
              cursor: 'pointer', fontFamily: FONT,
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: '#8A7E72', fontFamily: FONT }}>Poor</span>
        <span style={{ fontSize: 10, color: '#8A7E72', fontFamily: FONT }}>Excellent</span>
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
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', color: '#8A7E72', fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {([true, false] as const).map(b => (
          <button
            key={String(b)}
            type="button"
            onClick={() => onChange(b)}
            style={{
              flex: 1, padding: '8px', borderRadius: 10, fontSize: 14, fontWeight: 500,
              border: value === b ? '2px solid #26452B' : '1px solid #E8E2D9',
              backgroundColor: value === b ? '#E8F0E5' : 'white',
              color: value === b ? '#26452B' : '#8A7E72',
              cursor: 'pointer', fontFamily: FONT,
            }}
          >
            {b ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  )
}
