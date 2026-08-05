import { supabase } from './supabase';
import { compressImage, type CompressedImage } from './imageCompression';
import { nanoid } from './nanoid';

export interface UploadPhotoResult {
  photoId: string;
  storagePath: string;
  publicUrl: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

export async function uploadInspectionPhoto(
  inspectionId: string,
  questionId: string,
  file: File,
  options?: { instanceId?: string; caption?: string }
): Promise<UploadPhotoResult> {
  const compressed = await compressImage(file, {
    maxWidth: 1200,
    maxHeight: 1600,
    quality: 0.7,
  });

  const storagePath = `${inspectionId}/${questionId}/${nanoid()}.jpg`;

  const { error: uploadError, data } = await supabase.storage
    .from('photos')
    .upload(storagePath, compressed.blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const publicUrl = supabase.storage
    .from('photos')
    .getPublicUrl(storagePath).data.publicUrl;

  const { data: photoRecord, error: dbError } = await supabase
    .from('photos')
    .insert({
      inspection_id: inspectionId,
      question_id: questionId,
      instance_id: options?.instanceId,
      storage_path: storagePath,
      caption: options?.caption,
      original_size: compressed.originalSize,
      compressed_size: compressed.compressedSize,
      storage_tier: 'active',
    })
    .select('id')
    .single();

  if (dbError) {
    await supabase.storage.from('photos').remove([storagePath]);
    throw dbError;
  }

  await recordPhotoMetadata(
    photoRecord.id,
    compressed,
    inspectionId
  ).catch(err => console.warn('Failed to record metadata:', err));

  return {
    photoId: photoRecord.id,
    storagePath,
    publicUrl,
    originalSize: compressed.originalSize,
    compressedSize: compressed.compressedSize,
    width: compressed.width,
    height: compressed.height,
  };
}

export async function deletePhoto(photoId: string, storagePath: string): Promise<void> {
  const { error: deleteDbError } = await supabase
    .from('photos')
    .delete()
    .eq('id', photoId);

  if (deleteDbError) throw deleteDbError;

  const { error: deleteStorageError } = await supabase.storage
    .from('photos')
    .remove([storagePath]);

  if (deleteStorageError) throw deleteStorageError;
}

export async function getStorageAnalytics(companyId: string) {
  const { data, error } = await supabase
    .rpc('get_company_storage_analytics', { company_id: companyId });

  if (error) throw error;
  return data;
}

async function recordPhotoMetadata(
  photoId: string,
  compressed: CompressedImage,
  inspectionId: string
): Promise<void> {
  const { data: inspection } = await supabase
    .from('inspections')
    .select('template_id')
    .eq('id', inspectionId)
    .single();

  if (!inspection) return;

  const { data: template } = await supabase
    .from('templates')
    .select('company_id')
    .eq('id', inspection.template_id)
    .single();

  if (!template) return;

  await supabase.from('photo_metadata').insert({
    photo_id: photoId,
    company_id: template.company_id,
    original_dimensions: `${compressed.width}x${compressed.height}`,
    compressed_dimensions: `${compressed.width}x${compressed.height}`,
    format: 'jpeg',
    compression_ratio: parseFloat((compressed.compressionRatio * 100).toFixed(2)),
  });
}

export async function bulkDeleteOldPhotos(
  companyId: string,
  daysOld: number = 90
): Promise<{ deleted: number; freedBytes: bigint }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const { data: photos, error: queryError } = await supabase
    .from('photos')
    .select('id, storage_path, compressed_size')
    .lt('uploaded_at', cutoffDate.toISOString())
    .eq('storage_tier', 'active');

  if (queryError) throw queryError;
  if (!photos || photos.length === 0) return { deleted: 0, freedBytes: BigInt(0) };

  let freedBytes = BigInt(0);
  const paths = [];

  for (const photo of photos) {
    paths.push(photo.storage_path);
    freedBytes += BigInt(photo.compressed_size || 0);
  }

  const { error: deleteStorageError } = await supabase.storage
    .from('photos')
    .remove(paths);

  if (deleteStorageError) throw deleteStorageError;

  const { error: deleteDbError } = await supabase
    .from('photos')
    .delete()
    .in('id', photos.map(p => p.id));

  if (deleteDbError) throw deleteDbError;

  return { deleted: photos.length, freedBytes };
}
