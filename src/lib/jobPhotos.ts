import { compressImage } from './imageCompression';
import { supabase } from './supabase';

export const JOB_PHOTOS_TABLE = 'job_photos';
export const JOB_PHOTOS_BUCKET = 'uploaded-pdfs';
export const INSPECTION_PHOTOS_BUCKET = 'photos';
export const JOB_PHOTOS_COLUMNS =
  'id, company_id, job_id, visit_note_id, storage_path, caption, created_by, created_at';

export const JOB_PHOTO_NO_JOB = 'This job is missing.';
export const JOB_PHOTO_NOT_SIGNED_IN = 'Not signed in';
export const JOB_PHOTO_NO_FILES = 'Choose photos to add.';
export const JOB_PHOTOS_ADDED = 'Photos added';

export type JobPhotoSource = 'visit' | 'job' | 'inspection' | 'jha';
export type JobGalleryFilter = JobPhotoSource | 'all';

export const JOB_PHOTO_SOURCE_LABEL: Record<JobPhotoSource, string> = {
  visit: 'Visit',
  job: 'Job',
  inspection: 'Inspection',
  jha: 'JHA',
};

export const JOB_GALLERY_FILTERS: JobGalleryFilter[] = [
  'all',
  'visit',
  'job',
  'inspection',
  'jha',
];

export interface JobPhotoRow {
  id: string;
  company_id: string;
  job_id: string;
  visit_note_id: string | null;
  storage_path: string;
  caption: string | null;
  created_by: string | null;
  created_at: string;
}

export interface JobGalleryPhoto {
  key: string;
  source: JobPhotoSource;
  bucket: typeof JOB_PHOTOS_BUCKET | typeof INSPECTION_PHOTOS_BUCKET;
  storagePath: string;
  takenAt: string;
  caption: string | null;
  visitNoteId: string | null;
  inspectionId: string | null;
  jhaDocumentId: string | null;
}

export type DecideJobPhotoUpload =
  | { action: 'miss'; reason: 'no_job' | 'not_signed_in' | 'no_files'; message: string }
  | { action: 'write' };

export type InspectionGalleryRow = {
  inspection_id: string;
  storage_path: string;
  caption: string | null;
  uploaded_at: string;
};

export type JhaGalleryDocument = {
  id: string;
  steps?: Array<{
    photos?: Array<{ id: string; storagePath: string; caption?: string }>;
  }> | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type BuildJobGalleryInput = {
  jobPhotos: JobPhotoRow[];
  inspectionPhotos: InspectionGalleryRow[];
  jhaDocuments: JhaGalleryDocument[];
};

type GalleryLoader = (input: BuildJobGalleryInput) => JobGalleryPhoto[];

function trimPhotoField(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

export function jobPhotoStoragePath(args: {
  companyId: string;
  jobId: string;
  photoId: string;
}): string {
  return `${args.companyId}/jobs/${args.jobId}/${args.photoId}.jpg`;
}

export function decideJobPhotoUpload(input: {
  companyId: string | null | undefined;
  jobId: string | null | undefined;
  userId: string | null | undefined;
  fileCount: number;
}): DecideJobPhotoUpload {
  if (!trimPhotoField(input.jobId)) {
    return { action: 'miss', reason: 'no_job', message: JOB_PHOTO_NO_JOB };
  }
  if (!trimPhotoField(input.companyId) || !trimPhotoField(input.userId)) {
    return { action: 'miss', reason: 'not_signed_in', message: JOB_PHOTO_NOT_SIGNED_IN };
  }
  if (input.fileCount <= 0) {
    return { action: 'miss', reason: 'no_files', message: JOB_PHOTO_NO_FILES };
  }
  return { action: 'write' };
}

function fromJobPhotoRow(
  row: JobPhotoRow,
  source: 'visit' | 'job',
): JobGalleryPhoto {
  return {
    key: `${source}:${row.id}`,
    source,
    bucket: JOB_PHOTOS_BUCKET,
    storagePath: row.storage_path,
    takenAt: row.created_at,
    caption: row.caption,
    visitNoteId: row.visit_note_id,
    inspectionId: null,
    jhaDocumentId: null,
  };
}

function loadVisitPhotos(input: BuildJobGalleryInput): JobGalleryPhoto[] {
  return input.jobPhotos
    .filter(row => row.visit_note_id)
    .map(row => fromJobPhotoRow(row, 'visit'));
}

function loadJobSheetPhotos(input: BuildJobGalleryInput): JobGalleryPhoto[] {
  return input.jobPhotos
    .filter(row => !row.visit_note_id)
    .map(row => fromJobPhotoRow(row, 'job'));
}

function loadInspectionPhotos(input: BuildJobGalleryInput): JobGalleryPhoto[] {
  const seen = new Set<string>();
  const photos: JobGalleryPhoto[] = [];
  for (const row of input.inspectionPhotos) {
    if (seen.has(row.storage_path)) continue;
    seen.add(row.storage_path);
    photos.push({
      key: `inspection:${row.storage_path}`,
      source: 'inspection',
      bucket: INSPECTION_PHOTOS_BUCKET,
      storagePath: row.storage_path,
      takenAt: row.uploaded_at,
      caption: row.caption,
      visitNoteId: null,
      inspectionId: row.inspection_id,
      jhaDocumentId: null,
    });
  }
  return photos;
}

function loadJhaPhotos(input: BuildJobGalleryInput): JobGalleryPhoto[] {
  const photos: JobGalleryPhoto[] = [];
  for (const doc of input.jhaDocuments) {
    const takenAt = doc.updated_at || doc.created_at || '';
    for (const step of doc.steps ?? []) {
      for (const photo of step.photos ?? []) {
        photos.push({
          key: `jha:${doc.id}:${photo.id}`,
          source: 'jha',
          bucket: INSPECTION_PHOTOS_BUCKET,
          storagePath: photo.storagePath,
          takenAt,
          caption: photo.caption ?? null,
          visitNoteId: null,
          inspectionId: null,
          jhaDocumentId: doc.id,
        });
      }
    }
  }
  return photos;
}

const JOB_GALLERY_LOADERS: GalleryLoader[] = [
  loadVisitPhotos,
  loadJobSheetPhotos,
  loadInspectionPhotos,
  loadJhaPhotos,
];

export function buildJobGallery(input: BuildJobGalleryInput): JobGalleryPhoto[] {
  return JOB_GALLERY_LOADERS.flatMap(load => load(input)).sort((a, b) => {
    if (a.takenAt !== b.takenAt) return a.takenAt < b.takenAt ? 1 : -1;
    if (a.key === b.key) return 0;
    return a.key < b.key ? -1 : 1;
  });
}

export function filterJobGallery(
  photos: JobGalleryPhoto[],
  filter: JobGalleryFilter,
): JobGalleryPhoto[] {
  if (filter === 'all') return photos;
  return photos.filter(photo => photo.source === filter);
}

export function photosForVisitNote(
  photos: JobGalleryPhoto[],
  noteId: string,
): JobGalleryPhoto[] {
  return photos.filter(photo => photo.visitNoteId === noteId);
}

export function galleryFilterCounts(
  photos: JobGalleryPhoto[],
): Record<JobGalleryFilter, number> {
  const counts: Record<JobGalleryFilter, number> = {
    all: photos.length,
    visit: 0,
    job: 0,
    inspection: 0,
    jha: 0,
  };
  for (const photo of photos) {
    counts[photo.source] += 1;
  }
  return counts;
}

export function jobPhotosQuery(args: {
  companyId: string;
  jobId: string;
}): { table: typeof JOB_PHOTOS_TABLE; columns: string; eq: { company_id: string; job_id: string } } | null {
  const companyId = trimPhotoField(args.companyId);
  const jobId = trimPhotoField(args.jobId);
  if (!companyId || !jobId) return null;
  return {
    table: JOB_PHOTOS_TABLE,
    columns: JOB_PHOTOS_COLUMNS,
    eq: { company_id: companyId, job_id: jobId },
  };
}

export function jobPhotosAddedToast(): { message: string; kind: 'success' } {
  return { message: JOB_PHOTOS_ADDED, kind: 'success' };
}

export async function uploadJobPhotos(input: {
  companyId: string;
  jobId: string;
  userId: string;
  visitNoteId: string | null;
  files: File[];
}): Promise<{ uploaded: JobPhotoRow[]; failed: number }> {
  const uploaded: JobPhotoRow[] = [];
  let failed = 0;
  for (const file of input.files) {
    try {
      const photoId = crypto.randomUUID();
      const storagePath = jobPhotoStoragePath({
        companyId: input.companyId,
        jobId: input.jobId,
        photoId,
      });
      const compressed = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1600,
        quality: 0.7,
      });
      const { error: uploadError } = await supabase.storage
        .from(JOB_PHOTOS_BUCKET)
        .upload(storagePath, compressed.blob, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { data, error } = await supabase
        .from(JOB_PHOTOS_TABLE)
        .insert({
          id: photoId,
          company_id: input.companyId,
          job_id: input.jobId,
          visit_note_id: input.visitNoteId,
          storage_path: storagePath,
          created_by: input.userId,
        })
        .select(JOB_PHOTOS_COLUMNS)
        .single();
      if (error || !data) throw error ?? new Error('Photo row was not saved.');
      uploaded.push(data as JobPhotoRow);
    } catch {
      failed += 1;
    }
  }
  return { uploaded, failed };
}

export async function signJobGalleryUrls(
  photos: JobGalleryPhoto[],
  ttlSeconds = 3600,
): Promise<Record<string, string>> {
  const byBucket = new Map<string, string[]>();
  for (const photo of photos) {
    const paths = byBucket.get(photo.bucket) ?? [];
    paths.push(photo.storagePath);
    byBucket.set(photo.bucket, paths);
  }
  const signed = new Map<string, string>();
  for (const [bucket, paths] of byBucket) {
    const unique = [...new Set(paths)];
    if (unique.length === 0) continue;
    const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, ttlSeconds);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) signed.set(`${bucket}:${row.path}`, row.signedUrl);
    }
  }
  const urls: Record<string, string> = {};
  for (const photo of photos) {
    const url = signed.get(`${photo.bucket}:${photo.storagePath}`);
    if (url) urls[photo.key] = url;
  }
  return urls;
}
