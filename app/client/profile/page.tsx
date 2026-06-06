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
  sand:       '#E6C89A',
  brown:      '#3B2A1F',
  cardBorder: '#E8E2D9',
  divider:    '#F0EBE3',
  badgeBg:    '#EEE9E0',
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

function IconCalendar({ size = 16, color = T.moss }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function IconScale({ size = 16, color = T.moss }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <line x1="12" y1="3" x2="12" y2="21" />
      <path d="M5 9l7-6 7 6" />
      <path d="M3 15h6a3 3 0 0 0 6 0h6" />
    </svg>
  )
}

function IconPerson({ size = 16, color = T.moss }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconNotepad({ size = 16, color = T.moss }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  )
}

function IconMountain({ size = 16, color = T.moss }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polygon points="3 20 21 20 12 4 3 20" />
      <polyline points="3 20 9 10 12 14 15 10 21 20" />
    </svg>
  )
}

function IconPencil({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
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

      const state = await getUserState(session.user.id)
      if (landingRoute(state) !== '/client/home') { router.push(landingRoute(state)); return }

      setUserId(session.user.id)

      const { data: dogRows } = await supabase
        .from('dogs')
        .select('id, name, breed, age_years, weight_kg, sex, neutered, recall_score, car_score, social_score, known_aggression, airtag_confirmed, ecollar, disposition_notes, other_notes, photo_url, approval_status, approval_conditions')
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

  const dog = dogs[0] as DogFull | undefined

  if (!dog) {
    return (
      <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen flex items-center justify-center px-5">
        <p style={{ color: T.muted, fontSize: 14 }}>No dog profile found.</p>
      </main>
    )
  }

  const isUploading = uploadingDogId === dog.id
  const displayed = (photoPreview?.dogId === dog.id ? photoPreview.url : null) ?? dog.photo_url
  const isEditing = editingDogId === dog.id

  // Sex label helper
  const sexLabel = (() => {
    if (!dog.sex) return null
    const base = dog.sex.charAt(0).toUpperCase() + dog.sex.slice(1).toLowerCase()
    return dog.neutered ? `${base} · neutered` : base
  })()

  // Info rows (only show rows with a value)
  const infoRows: { icon: React.ReactNode; label: string; value: string }[] = [
    dog.age_years != null && { icon: <IconCalendar size={16} />, label: 'Age', value: `${dog.age_years} year${dog.age_years !== 1 ? 's' : ''}` },
    dog.breed && { icon: <IconPaw size={16} />, label: 'Breed', value: dog.breed },
    dog.weight_kg != null && { icon: <IconScale size={16} />, label: 'Weight', value: `${dog.weight_kg} kg` },
    sexLabel && { icon: <IconPerson size={16} />, label: 'Sex', value: sexLabel },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; value: string }[]

  // Trail readiness scores
  const scores = [
    { label: 'Recall', value: dog.recall_score },
    { label: 'Car comfort', value: dog.car_score },
    { label: 'Social', value: dog.social_score },
  ].filter(s => s.value != null) as { label: string; value: number }[]

  const pills = [
    dog.airtag_confirmed === true && { label: 'AirTag ✓', bg: '#E8F0E5', color: T.forest },
    dog.ecollar === true && { label: 'E-Collar', bg: T.badgeBg, color: T.moss },
    dog.known_aggression === true && { label: 'Aggression noted', bg: '#FBE9E3', color: '#C1562D' },
  ].filter(Boolean) as { label: string; bg: string; color: string }[]

  const hasTrailReadiness = scores.length > 0 || pills.length > 0
  const hasNotes = !!(dog.disposition_notes || dog.other_notes)

  return (
    <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen pb-0">
      <div className="w-full max-w-sm mx-auto px-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between pt-12 pb-6">
          <button
            onClick={() => router.push('/client/home')}
            style={{ backgroundColor: T.cardBorder, color: T.forest, borderRadius: '50%', width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
          >
            ←
          </button>
          <h1 style={{ color: T.brown, fontWeight: 700, fontFamily: FONT }} className="text-lg">My Pup</h1>
          <div style={{ width: 36 }} />
        </div>

        {/* ── Hero section ── */}
        <div className="flex flex-col items-center mb-6">
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <button
              onClick={() => handlePhotoClick(dog.id)}
              disabled={isUploading}
              style={{ display: 'block', cursor: 'pointer' }}
              title="Change photo"
            >
              {displayed ? (
                <div
                  style={{
                    width: 120, height: 120, borderRadius: '50%',
                    backgroundImage: `url(${displayed})`,
                    backgroundSize: 'cover', backgroundPosition: 'center top',
                    border: `3px solid ${T.forest}`,
                    flexShrink: 0,
                  }}
                  role="img"
                  aria-label={dog.name}
                />
              ) : (
                <div
                  style={{
                    width: 120, height: 120, borderRadius: '50%',
                    backgroundColor: T.forest,
                    border: `3px solid ${T.forest}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <IconPaw size={44} color="rgba(255,255,255,0.45)" />
                </div>
              )}
              {isUploading && (
                <div
                  style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <p style={{ color: '#fff', fontSize: 11 }}>Saving…</p>
                </div>
              )}
              {/* Camera button */}
              <div
                style={{
                  position: 'absolute', bottom: 3, right: 3,
                  width: 32, height: 32, borderRadius: '50%',
                  backgroundColor: T.forest,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid white',
                  pointerEvents: 'none',
                }}
              >
                <IconCamera size={14} color="#fff" />
              </div>
            </button>
          </div>

          {/* Name + paw */}
          <div className="flex items-center gap-2 mb-1">
            <h2 style={{ color: T.brown, fontWeight: 700, fontSize: 24, fontFamily: FONT, lineHeight: 1.2 }}>
              {dog.name}
            </h2>
            <IconPaw size={20} color={T.orange} />
          </div>

          {dog.breed && (
            <p style={{ color: T.muted, fontSize: 15, fontFamily: FONT, marginBottom: 10 }}>
              {dog.breed}
            </p>
          )}

          <ApprovalBadge status={dog.approval_status} />

          {dog.approval_status === 'approved_with_conditions' && dog.approval_conditions && (
            <p style={{ color: T.muted, fontSize: 12, fontFamily: FONT, textAlign: 'center', marginTop: 8, lineHeight: 1.5, maxWidth: 280 }}>
              {dog.approval_conditions}
            </p>
          )}
        </div>

        {/* ── Info rows card ── */}
        {infoRows.length > 0 && (
          <div
            style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: '8px 16px', marginBottom: 12 }}
          >
            {infoRows.map((row, i) => (
              <div
                key={row.label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
                  borderTop: i > 0 ? `1px solid ${T.divider}` : 'none',
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: T.badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {row.icon}
                </div>
                <p style={{ color: T.brown, fontWeight: 700, fontFamily: FONT, fontSize: 14, flex: 1 }}>
                  {row.label}
                </p>
                <p style={{ color: T.muted, fontFamily: FONT, fontSize: 14 }}>
                  {row.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Notes card ── */}
        {hasNotes && (
          <div
            style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 16, marginBottom: 12 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: T.badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconNotepad size={16} />
              </div>
              <p style={{ color: T.brown, fontWeight: 700, fontFamily: FONT, fontSize: 14 }}>Notes</p>
            </div>
            {dog.disposition_notes && (
              <div style={{ marginBottom: dog.other_notes ? 12 : 0 }}>
                <p style={{ color: T.muted, fontSize: 12, fontFamily: FONT, fontStyle: 'italic', marginBottom: 4 }}>Disposition</p>
                <p style={{ color: T.brown, fontSize: 14, fontFamily: FONT, lineHeight: 1.5 }}>{dog.disposition_notes}</p>
              </div>
            )}
            {dog.other_notes && (
              <div>
                <p style={{ color: T.muted, fontSize: 12, fontFamily: FONT, fontStyle: 'italic', marginBottom: 4 }}>Other</p>
                <p style={{ color: T.brown, fontSize: 14, fontFamily: FONT, lineHeight: 1.5 }}>{dog.other_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Trail readiness card ── */}
        {hasTrailReadiness && (
          <div
            style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 16, marginBottom: 12 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: T.badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconMountain size={16} />
              </div>
              <p style={{ color: T.brown, fontWeight: 700, fontFamily: FONT, fontSize: 14 }}>Trail Readiness</p>
            </div>

            {scores.length > 0 && (
              <div className="space-y-3 mb-4">
                {scores.map(s => (
                  <div key={s.label} className="flex items-center justify-between">
                    <p style={{ color: T.brown, fontSize: 14, fontFamily: FONT }}>{s.label}</p>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <div
                          key={i}
                          style={{
                            width: 10, height: 10, borderRadius: '50%',
                            backgroundColor: i < s.value ? T.forest : T.cardBorder,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pills.map(p => (
                  <span
                    key={p.label}
                    style={{ backgroundColor: p.bg, color: p.color, borderRadius: 20, padding: '4px 10px', fontSize: 12, fontFamily: FONT, fontWeight: 500 }}
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Status messages ── */}
        {uploadError && <p style={{ color: '#C1562D', fontSize: 13, fontFamily: FONT, textAlign: 'center', marginBottom: 8 }}>{uploadError}</p>}
        {uploadSuccess && <p style={{ color: T.moss, fontSize: 13, fontFamily: FONT, textAlign: 'center', marginBottom: 8 }}>Photo saved.</p>}
        {saveSuccess && <p style={{ color: T.moss, fontSize: 13, fontFamily: FONT, textAlign: 'center', marginBottom: 8 }}>Profile saved.</p>}

        {/* ── Edit Profile button ── */}
        <button
          onClick={() => isEditing ? cancelEdit() : startEdit(dog)}
          style={{
            width: '100%', backgroundColor: isEditing ? T.cardBorder : T.forest,
            color: isEditing ? T.brown : '#fff',
            borderRadius: 12, padding: '14px 0', fontFamily: FONT, fontWeight: 600, fontSize: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 16, cursor: 'pointer', border: 'none',
          }}
        >
          {!isEditing && <IconPencil size={16} color="#fff" />}
          {isEditing ? 'Cancel editing' : 'Edit Profile'}
        </button>

        {/* ── Edit form (when editing) ── */}
        {isEditing && editForm && (
          <div
            style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 20, marginBottom: 16 }}
            className="space-y-4"
          >
            <div>
              <label style={{ display: 'block', color: T.muted, fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>Breed</label>
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
                <label style={{ display: 'block', color: T.muted, fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>Age (years)</label>
                <input
                  type="number" min="0" max="20" step="0.5"
                  value={editForm.age_years}
                  onChange={e => upd('age_years', e.target.value)}
                  placeholder="3"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label style={{ display: 'block', color: T.muted, fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>Weight (kg)</label>
                <input
                  type="number" min="0" max="100" step="0.5"
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
            <YesNoField label="E-collar"          value={editForm.ecollar}          onChange={v => upd('ecollar', v)} />

            <div>
              <label style={{ display: 'block', color: T.muted, fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>Disposition notes</label>
              <textarea
                rows={3}
                value={editForm.disposition_notes}
                onChange={e => upd('disposition_notes', e.target.value)}
                placeholder="Personality, triggers, things to know…"
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label style={{ display: 'block', color: T.muted, fontSize: 12, fontFamily: FONT, marginBottom: 6 }}>Other notes</label>
              <textarea
                rows={2}
                value={editForm.other_notes}
                onChange={e => upd('other_notes', e.target.value)}
                placeholder="Vet contact, medication, anything else…"
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {saveError && <p style={{ color: '#C1562D', fontSize: 12, fontFamily: FONT }}>{saveError}</p>}

            <button
              onClick={() => saveEdit(dog.id)}
              disabled={saving}
              style={{
                width: '100%', backgroundColor: T.forest, color: '#fff',
                borderRadius: 12, padding: '14px 0', fontFamily: FONT, fontWeight: 600, fontSize: 15,
                border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}

      </div>

      {/* ── Decorative footer ── */}
      {!isEditing && <DecorativeFooter />}

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
  return (
    <div style={{ marginTop: 24, width: '100%', lineHeight: 0 }}>
      <svg
        viewBox="0 0 375 120"
        width="100%"
        height="120"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMax slice"
      >
        {/* Background hills */}
        <path
          d="M0 78 C60 50,130 62,190 56 C250 50,310 38,375 52 L375 120 L0 120 Z"
          fill="#8FA882"
          fillOpacity="0.6"
        />
        {/* Mid layer */}
        <path
          d="M0 90 C50 74,110 84,170 79 C230 74,300 63,375 72 L375 120 L0 120 Z"
          fill="#6B8A5E"
          fillOpacity="0.8"
        />
        {/* Foreground terrain */}
        <path
          d="M0 107 C25 101,55 105,85 101 C115 95,145 100,168 95 C192 91,218 95,242 92 C270 89,315 95,375 98 L375 120 L0 120 Z"
          fill="#4D6B46"
        />

        {/* Leash lines */}
        <line x1="182" y1="80" x2="158" y2="89" stroke="#26452B" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="188" y1="80" x2="215" y2="89" stroke="#26452B" strokeWidth="1.5" strokeLinecap="round" />

        {/* Person — head */}
        <circle cx="185" cy="69" r="5.5" fill="#26452B" />
        {/* Person — body */}
        <rect x="182" y="75" width="6" height="13" rx="2" fill="#26452B" />
        {/* Person — legs */}
        <line x1="183" y1="88" x2="180" y2="98" stroke="#26452B" strokeWidth="3" strokeLinecap="round" />
        <line x1="187" y1="88" x2="190" y2="98" stroke="#26452B" strokeWidth="3" strokeLinecap="round" />

        {/* Left dog — body */}
        <ellipse cx="152" cy="91" rx="10" ry="5.5" fill="#26452B" />
        {/* Left dog — head */}
        <ellipse cx="144" cy="88" rx="6" ry="5" fill="#26452B" />
        {/* Left dog — ear */}
        <path d="M142 84 L139 79" stroke="#26452B" strokeWidth="2" strokeLinecap="round" />
        {/* Left dog — legs */}
        <line x1="147" y1="96" x2="145" y2="103" stroke="#26452B" strokeWidth="2" strokeLinecap="round" />
        <line x1="151" y1="96" x2="150" y2="103" stroke="#26452B" strokeWidth="2" strokeLinecap="round" />
        <line x1="156" y1="96" x2="157" y2="103" stroke="#26452B" strokeWidth="2" strokeLinecap="round" />
        <line x1="160" y1="96" x2="162" y2="103" stroke="#26452B" strokeWidth="2" strokeLinecap="round" />
        {/* Left dog — tail */}
        <path d="M162 89 C167 84,170 87,167 91" stroke="#26452B" strokeWidth="2" strokeLinecap="round" fill="none" />

        {/* Right dog — body */}
        <ellipse cx="220" cy="90" rx="10" ry="5.5" fill="#26452B" />
        {/* Right dog — head */}
        <ellipse cx="228" cy="87" rx="6" ry="5" fill="#26452B" />
        {/* Right dog — ear */}
        <path d="M230 83 L233 78" stroke="#26452B" strokeWidth="2" strokeLinecap="round" />
        {/* Right dog — legs */}
        <line x1="215" y1="95" x2="213" y2="102" stroke="#26452B" strokeWidth="2" strokeLinecap="round" />
        <line x1="219" y1="95" x2="218" y2="102" stroke="#26452B" strokeWidth="2" strokeLinecap="round" />
        <line x1="223" y1="95" x2="224" y2="102" stroke="#26452B" strokeWidth="2" strokeLinecap="round" />
        <line x1="227" y1="95" x2="229" y2="102" stroke="#26452B" strokeWidth="2" strokeLinecap="round" />
        {/* Right dog — tail */}
        <path d="M211 88 C206 83,203 86,206 90" stroke="#26452B" strokeWidth="2" strokeLinecap="round" fill="none" />
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
    bg = '#E8F0E5'; color = '#26452B'; label = 'Approved'
  } else if (status === 'pending') {
    bg = '#FEF3E2'; color = '#E08A3E'; label = 'Pending review'
  } else {
    bg = '#FBE9E3'; color = '#C1562D'; label = 'Declined'
  }
  return (
    <span style={{ backgroundColor: bg, color, borderRadius: 20, padding: '4px 12px', fontSize: 13, fontFamily: FONT, fontWeight: 600 }}>
      {label}
    </span>
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
