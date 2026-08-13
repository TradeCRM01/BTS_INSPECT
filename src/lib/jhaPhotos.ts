import { compressImage } from './imageCompression';
import { nanoid } from './nanoid';
import { supabase } from './supabase';

export async function uploadJhaStepPhoto(
  jhaDocumentId: string,
  stepId: string,
  file: File,
): Promise<{ id: string; storagePath: string }> {
  const compressed = await compressImage(file, {
    maxWidth: 1200,
    maxHeight: 1600,
    quality: 0.7,
  });
  const id = nanoid();
  const storagePath = `jha/${jhaDocumentId}/${stepId}/${id}.jpg`;
  const { error } = await supabase.storage
    .from('photos')
    .upload(storagePath, compressed.blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });
  if (error) throw error;
  return { id, storagePath };
}

export async function removeJhaStepPhoto(storagePath: string): Promise<void> {
  await supabase.storage.from('photos').remove([storagePath]);
}

export async function signedPhotoUrl(storagePath: string, expiresSec = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from('photos').createSignedUrl(storagePath, expiresSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
