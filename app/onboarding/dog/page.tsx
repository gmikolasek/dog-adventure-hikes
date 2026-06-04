'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { uploadDogProfilePhoto } from '@/lib/photos'

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/')
    })
  }, [router])

  function ScoreSelector({ label, value, onChange }: {
    label: string
    value: number
    onChange: (v: number) => void
  }) {
    return (
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
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
          <span className="text-xs text-gray-400">Poor</span>
          <span className="text-xs text-gray-400">Excellent</span>
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
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
              value === true
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 text-gray-600'
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
              value === false
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 text-gray-600'
            }`}
          >
            No
          </button>
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
    if (!session) { router.push('/'); return }

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

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <span className="text-3xl">🐕</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Your dog</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {step === 1 ? 'Basic information' : step === 2 ? 'Behaviour and equipment' : 'Almost done'}
          </p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map(n => (
            <div
              key={n}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                n <= step ? 'bg-green-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Basic info */}
        {step === 1 && (
          <div>
            {/* Photo picker */}
            <div className="flex justify-center mb-6">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="relative"
              >
                {photoPreview ? (
                  <div
                    className="w-24 h-24 rounded-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${photoPreview})` }}
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center">
                    <span className="text-4xl">🐕</span>
                  </div>
                )}
                <div className="absolute bottom-0 right-0 w-7 h-7 bg-green-600 rounded-full flex items-center justify-center text-white text-xs shadow-md">
                  📷
                </div>
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Dog's name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Nokhoi"
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Breed</label>
              <input
                type="text"
                value={breed}
                onChange={e => setBreed(e.target.value)}
                placeholder="e.g. Bankhar, Mixed, Labrador"
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Age (years)</label>
                <input
                  type="number"
                  value={ageYears}
                  onChange={e => setAgeYears(e.target.value)}
                  placeholder="3"
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Weight (kg)</label>
                <input
                  type="number"
                  value={weightKg}
                  onChange={e => setWeightKg(e.target.value)}
                  placeholder="28"
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Sex</label>
              <div className="flex gap-3">
                {(['male', 'female'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSex(s)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium capitalize transition-colors ${
                      sex === s
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {s === 'male' ? '♂ Male' : '♀ Female'}
                  </button>
                ))}
              </div>
            </div>

            <YesNo
              label="Spayed / neutered?"
              value={neutered}
              onChange={setNeutered}
            />

            <button
              onClick={() => setStep(2)}
              disabled={!step1Valid}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2: Behaviour */}
        {step === 2 && (
          <div>
            <ScoreSelector
              label="Off-leash recall (1 = poor, 5 = excellent)"
              value={recallScore}
              onChange={setRecallScore}
            />
            <ScoreSelector
              label="Behaviour in car (1 = poor, 5 = excellent)"
              value={carScore}
              onChange={setCarScore}
            />
            <ScoreSelector
              label="Sociability with other dogs (1 = poor, 5 = excellent)"
              value={socialScore}
              onChange={setSocialScore}
            />

            <YesNo
              label="Any known aggression towards dogs or people?"
              value={knownAggression}
              onChange={setKnownAggression}
            />
            <YesNo
              label="Does your dog have an AirTag collar?"
              value={airtag}
              onChange={setAirtag}
            />
            <YesNo
              label="Does your dog have an e-collar?"
              value={ecollar}
              onChange={setEcollar}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-600"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Notes */}
        {step === 3 && (
          <div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Disposition and socialisation
              </label>
              <textarea
                value={dispositionNotes}
                onChange={e => setDispositionNotes(e.target.value)}
                placeholder="Describe your dog's personality, how they behave with unfamiliar dogs and people, energy level..."
                rows={4}
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Anything else we should know?
              </label>
              <textarea
                value={otherNotes}
                onChange={e => setOtherNotes(e.target.value)}
                placeholder="Allergies, fears, medical conditions, medications..."
                rows={3}
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>

            <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-200">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trainingInterest}
                  onChange={e => setTrainingInterest(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-green-600 rounded"
                />
                <span className="text-sm text-gray-700">
                  I'm interested in training sessions for my dog
                </span>
              </label>
            </div>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-600"
              >
                ← Back
              </button>
              <button
                onClick={saveDog}
                disabled={loading}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
              >
                {loading ? 'Saving...' : 'Save dog →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}