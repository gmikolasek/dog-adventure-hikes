'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { uploadDogProfilePhoto } from '@/lib/photos'

const FONT = "'Noto Sans', system-ui, sans-serif"

const inputBase: React.CSSProperties = {
  width: '100%',
  borderRadius: 10,
  border: '1px solid #E8E2D9',
  padding: '12px',
  fontSize: 14,
  color: '#171717',
  backgroundColor: 'white',
  WebkitTextFillColor: '#171717',
  outline: 'none',
  fontFamily: FONT,
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 700,
  color: '#3B2A1F',
  marginBottom: 8,
  fontFamily: FONT,
}

export default function DogProfile() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Dog profile fields
  const [name, setName] = useState('')
  const [breed, setBreed] = useState('')
  const [ageYears, setAgeYears] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [sex, setSex] = useState<'male' | 'female' | ''>('')
  const [neutered, setNeutered] = useState<boolean | null>(null)
  const [dispositionNotes, setDispositionNotes] = useState('')
  const [otherNotes, setOtherNotes] = useState('')
  const [recallScore, setRecallScore] = useState(0)
  const [carScore, setCarScore] = useState(0)
  const [socialScore, setSocialScore] = useState(0)
  const [knownAggression, setKnownAggression] = useState<boolean | null>(null)
  const [airtag, setAirtag] = useState<boolean | null>(null)
  const [ecollar, setEcollar] = useState<boolean | null>(null)
  const [trainingInterest, setTrainingInterest] = useState(false)

  function ScoreSelector({ label, value, onChange }: {
    label: string
    value: number
    onChange: (v: number) => void
  }) {
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>{label}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              style={{
                width: 40, height: 40,
                borderRadius: '50%',
                fontSize: 14,
                fontWeight: 500,
                border: value === n ? 'none' : '1px solid #E8E2D9',
                backgroundColor: value === n ? '#26452B' : 'white',
                color: value === n ? 'white' : '#3B2A1F',
                cursor: 'pointer',
                fontFamily: FONT,
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT }}>Poor</span>
          <span style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT }}>Excellent</span>
        </div>
      </div>
    )
  }

  function YesNo({ label, value, onChange }: {
    label: string
    value: boolean | null
    onChange: (v: boolean) => void
  }) {
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>{label}</label>
        <div style={{ display: 'flex', gap: 12 }}>
          {([true, false] as const).map(v => (
            <button
              key={String(v)}
              type="button"
              onClick={() => onChange(v)}
              style={{
                flex: 1, padding: '10px',
                borderRadius: 10,
                border: value === v ? '2px solid #26452B' : '1px solid #E8E2D9',
                backgroundColor: value === v ? '#E8F0E5' : 'white',
                color: value === v ? '#26452B' : '#8A7E72',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: FONT,
              }}
            >
              {v ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </div>
    )
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function saveDog() {
    setLoading(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    // if (!session) { router.push('/'); return }
    if (!session) return

    const { data: inserted, error: insertError } = await supabase.from('dogs').insert({
      owner_id: session.user.id,
      name,
      breed,
      age_years: ageYears ? parseInt(ageYears) : null,
      weight_kg: weightKg ? parseFloat(weightKg) : null,
      sex: sex || null,
      neutered,
      disposition_notes: dispositionNotes,
      other_notes: otherNotes,
      recall_score: recallScore || null,
      car_score: carScore || null,
      social_score: socialScore || null,
      known_aggression: knownAggression ?? false,
      airtag_confirmed: airtag ?? false,
      ecollar: ecollar ?? false,
      approval_status: 'pending',
    }).select('id')

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    // Save training interest to user record
    await supabase
      .from('users')
      .update({ training_interest: trainingInterest })
      .eq('id', session.user.id)

    // Upload profile photo if one was chosen
    const dogId = inserted?.[0]?.id
    if (photoFile && dogId) {
      const photoUrl = await uploadDogProfilePhoto(photoFile, session.user.id, dogId)
      if (photoUrl) {
        await supabase.from('dogs').update({ photo_url: photoUrl }).eq('id', dogId)
      }
    }

    router.push('/onboarding/contract')
    setLoading(false)
  }

  const step1Valid = name.length >= 1 && breed.length >= 1 && sex !== ''
  const step2Valid = recallScore > 0 && carScore > 0 && socialScore > 0 && airtag !== null

  const btnBack: React.CSSProperties = {
    flex: 1, padding: '12px', borderRadius: 12,
    border: '1px solid #E8E2D9', fontSize: 14, fontWeight: 500,
    color: '#3B2A1F', backgroundColor: 'white', cursor: 'pointer', fontFamily: FONT,
  }
  const btnNext = (disabled: boolean): React.CSSProperties => ({
    flex: 1, backgroundColor: '#26452B', color: 'white',
    padding: '12px', borderRadius: 12, fontWeight: 600, fontSize: 14,
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, fontFamily: FONT,
  })

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, padding: '40px 24px' }}>
      <div style={{ width: '100%', maxWidth: 384, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', backgroundColor: '#E8F0E5', marginBottom: 16 }}>
            <span style={{ fontSize: 28 }}>🐕</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT }}>Your dog</h1>
          <p style={{ color: '#8A7E72', marginTop: 4, fontSize: 14, fontFamily: FONT }}>
            {step === 1 ? 'Basic information' : step === 2 ? 'Behaviour and equipment' : 'Almost done'}
          </p>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          {[1, 2, 3].map(n => (
            <div
              key={n}
              style={{ flex: 1, height: 6, borderRadius: 4, backgroundColor: n <= step ? '#26452B' : '#E8E2D9' }}
            />
          ))}
        </div>

        {/* Step 1: Basic info */}
        {step === 1 && (
          <div>
            {/* Photo picker */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                style={{ position: 'relative', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                {photoPreview ? (
                  <div style={{ width: 96, height: 96, borderRadius: '50%', backgroundImage: `url(${photoPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                ) : (
                  <div style={{ width: 96, height: 96, borderRadius: '50%', backgroundColor: '#E8F0E5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 36 }}>🐕</span>
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, backgroundColor: '#26452B', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                  📷
                </div>
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Dog&apos;s name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && step1Valid) setStep(2) }} placeholder="e.g. Nokhoi" style={inputBase} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Breed</label>
              <input type="text" value={breed} onChange={e => setBreed(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && step1Valid) setStep(2) }} placeholder="e.g. Bankhar, Mixed, Labrador" style={inputBase} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Age (years)</label>
                <input type="number" value={ageYears} onChange={e => setAgeYears(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && step1Valid) setStep(2) }} placeholder="3" style={inputBase} />
              </div>
              <div>
                <label style={labelStyle}>Weight (kg)</label>
                <input type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && step1Valid) setStep(2) }} placeholder="28" style={inputBase} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Sex</label>
              <div style={{ display: 'flex', gap: 12 }}>
                {(['male', 'female'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSex(s)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 10,
                      border: sex === s ? '2px solid #26452B' : '1px solid #E8E2D9',
                      backgroundColor: sex === s ? '#E8F0E5' : 'white',
                      color: sex === s ? '#26452B' : '#8A7E72',
                      fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: FONT,
                    }}
                  >
                    {s === 'male' ? '♂ Male' : '♀ Female'}
                  </button>
                ))}
              </div>
            </div>

            <YesNo label="Spayed / neutered?" value={neutered} onChange={setNeutered} />

            <button onClick={() => setStep(2)} disabled={!step1Valid} style={{ width: '100%', backgroundColor: '#26452B', color: 'white', padding: '14px', borderRadius: 12, fontWeight: 600, fontSize: 15, border: 'none', cursor: step1Valid ? 'pointer' : 'not-allowed', opacity: step1Valid ? 1 : 0.5, fontFamily: FONT }}>
              Continue →
            </button>
          </div>
        )}

        {/* Step 2: Behaviour */}
        {step === 2 && (
          <div>
            <ScoreSelector label="Off-leash recall (1 = poor, 5 = excellent)" value={recallScore} onChange={setRecallScore} />
            <ScoreSelector label="Behaviour in car (1 = poor, 5 = excellent)" value={carScore} onChange={setCarScore} />
            <ScoreSelector label="Sociability with other dogs (1 = poor, 5 = excellent)" value={socialScore} onChange={setSocialScore} />
            <YesNo label="Any known aggression towards dogs or people?" value={knownAggression} onChange={setKnownAggression} />
            <YesNo label="Does your dog have an AirTag collar?" value={airtag} onChange={setAirtag} />
            <YesNo label="Does your dog have an e-collar?" value={ecollar} onChange={setEcollar} />

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep(1)} style={btnBack}>← Back</button>
              <button onClick={() => setStep(3)} disabled={!step2Valid} style={btnNext(!step2Valid)}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 3: Notes */}
        {step === 3 && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Disposition and socialisation</label>
              <textarea
                value={dispositionNotes}
                onChange={e => setDispositionNotes(e.target.value)}
                placeholder="Describe your dog's personality, how they behave with unfamiliar dogs and people, energy level..."
                rows={4}
                style={{ ...inputBase, resize: 'none' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Anything else we should know?</label>
              <textarea
                value={otherNotes}
                onChange={e => setOtherNotes(e.target.value)}
                placeholder="Allergies, fears, medical conditions, medications..."
                rows={3}
                style={{ ...inputBase, resize: 'none' }}
              />
            </div>

            <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#E8F0E5', borderRadius: 12, border: '1px solid #C8DBBE' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={trainingInterest}
                  onChange={e => setTrainingInterest(e.target.checked)}
                  style={{ marginTop: 2, width: 16, height: 16, accentColor: '#26452B', flexShrink: 0 }}
                />
                <span style={{ fontSize: 14, color: '#3B2A1F', fontFamily: FONT }}>
                  I&apos;m interested in training sessions for my dog
                </span>
              </label>
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 16 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep(2)} style={btnBack}>← Back</button>
              <button onClick={saveDog} disabled={loading} style={btnNext(loading)}>
                {loading ? 'Saving...' : 'Save dog →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
