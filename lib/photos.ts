import { supabase } from './supabase'

export type HikePhoto = {
  id: string
  dogId: string | null
  storagePath: string
  caption: string | null
  takenAt: string | null
}

export function getPhotoUrl(storagePath: string): string {
  const { data } = supabase.storage.from('dog-photos').getPublicUrl(storagePath)
  return data.publicUrl
}

function extFromType(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  if (type === 'image/gif') return 'gif'
  return 'jpg'
}

export async function uploadDogProfilePhoto(
  file: File,
  userId: string,
  dogId: string,
): Promise<string | null> {
  const ext = extFromType(file.type)
  const path = `profiles/${userId}/${dogId}.${ext}`

  const { error } = await supabase.storage
    .from('dog-photos')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) {
    // Log enough to diagnose RLS vs auth vs network failures.
    const { data: { session } } = await supabase.auth.getSession()
    console.error('Profile photo upload failed', {
      message: error.message,
      // StorageError also carries status/statusCode depending on SDK version
      status: (error as unknown as Record<string, unknown>).status,
      statusCode: (error as unknown as Record<string, unknown>).statusCode,
      path,
      contentType: file.type,
      fileSize: file.size,
      authUid: session?.user?.id ?? '⚠️ NO SESSION',
      sessionExpiresAt: session?.expires_at,
    })
    return null
  }

  const { data } = supabase.storage.from('dog-photos').getPublicUrl(path)
  return data.publicUrl
}

export async function uploadHikePhoto(
  file: File,
  hikeDayId: string,
): Promise<{ storagePath: string; publicUrl: string } | null> {
  const ts = Date.now()
  const ext = extFromType(file.type)
  const path = `hikes/${hikeDayId}/${ts}.${ext}`

  const { error } = await supabase.storage
    .from('dog-photos')
    .upload(path, file, { contentType: file.type })

  if (error) {
    const { data: { session } } = await supabase.auth.getSession()
    console.error('Hike photo upload failed', {
      message: error.message,
      status: (error as unknown as Record<string, unknown>).status,
      statusCode: (error as unknown as Record<string, unknown>).statusCode,
      path,
      contentType: file.type,
      fileSize: file.size,
      authUid: session?.user?.id ?? '⚠️ NO SESSION',
    })
    return null
  }

  const { data } = supabase.storage.from('dog-photos').getPublicUrl(path)
  return { storagePath: path, publicUrl: data.publicUrl }
}
