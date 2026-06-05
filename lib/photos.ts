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
  // Timestamp suffix avoids conflicts without needing upsert.
  // Old files are orphaned in storage but dogs.photo_url always points to the latest.
  const path = `profiles/${userId}/${dogId}-${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('dog-photos')
    .upload(path, file, { contentType: file.type })

  if (error) {
    const { data: { session } } = await supabase.auth.getSession()
    console.error('Profile photo upload failed',
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
      { path, contentType: file.type, fileSize: file.size, authUid: session?.user?.id ?? '⚠️ NO SESSION' },
    )
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
    console.error('Hike photo upload failed',
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
      { path, contentType: file.type, fileSize: file.size, authUid: session?.user?.id ?? '⚠️ NO SESSION' },
    )
    return null
  }

  const { data } = supabase.storage.from('dog-photos').getPublicUrl(path)
  return { storagePath: path, publicUrl: data.publicUrl }
}
