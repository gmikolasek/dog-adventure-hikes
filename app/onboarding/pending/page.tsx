'use client'

export default function Pending() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-yellow-100 mb-6">
          <span className="text-4xl">🐾</span>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-3">You're on the list</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-8">
          Your profile and dog details have been submitted. Our team will review your application and be in touch shortly.
        </p>
        <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs">✓</span>
            </div>
            <span className="text-sm text-gray-700">Account created</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs">✓</span>
            </div>
            <span className="text-sm text-gray-700">Dog profile submitted</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs">✓</span>
            </div>
            <span className="text-sm text-gray-700">Agreement accepted</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs">⏳</span>
            </div>
            <span className="text-sm text-gray-700">Awaiting team review</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
              <span className="text-gray-400 text-xs">5</span>
            </div>
            <span className="text-sm text-gray-400">Book your first hike</span>
          </div>
        </div>
      </div>
    </main>
  )
}
