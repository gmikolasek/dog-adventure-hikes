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

export async function uploadDogProfilePhoto(
  file: File,
  userId: string,
  dogId: string,
): Promise<string | null> {
  const path = `profiles/${userId}/${dogId}.jpg`
  const { error } = await supabase.storage
    .from('dog-photos')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) {
    console.error('Profile photo upload error:', error.message)
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
  const path = `hikes/${hikeDayId}/${ts}.jpg`
  const { error } = await supabase.storage
    .from('dog-photos')
    .upload(path, file, { contentType: file.type })
  if (error) {
    console.error('Hike photo upload error:', error.message)
    return null
  }
  const { data } = supabase.storage.from('dog-photos').getPublicUrl(path)
  return { storagePath: path, publicUrl: data.publicUrl }
}
