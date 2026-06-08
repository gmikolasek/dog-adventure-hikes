'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ClientRoot() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/client/home')
  }, [router])
  return null
}
