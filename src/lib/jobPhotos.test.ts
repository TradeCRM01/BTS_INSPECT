import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JOB_PHOTOS_BUCKET,
  JOB_PHOTOS_TABLE,
  INSPECTION_PHOTOS_BUCKET,
  buildJobGallery,
  decideJobPhotoUpload,
  filterJobGallery,
  galleryFilterCounts,
  jobPhotoStoragePath,
  jobPhotosQuery,
  photosForVisitNote,
  type JobGalleryPhoto,
  type JobPhotoRow,
} from './jobPhotos';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const visitRow: JobPhotoRow = {
  id: 'ph-visit',
  company_id: 'co-1',
  job_id: 'job-1',
  visit_note_id: 'note-1',
  storage_path: 'co-1/jobs/job-1/ph-visit.jpg',
  caption: 'After the pull',
  created_by: 'p-alex',
  created_at: '2026-09-10T09:00:00.000Z',
};

const jobRow: JobPhotoRow = {
  id: 'ph-job',
  company_id: 'co-1',
  job_id: 'job-1',
  visit_note_id: null,
  storage_path: 'co-1/jobs/job-1/ph-job.jpg',
  caption: null,
  created_by: 'p-sam',
  created_at: '2026-09-09T08:00:00.000Z',
};

const visitGallery: JobGalleryPhoto = {
  key: 'visit:ph-visit',
  source: 'visit',
  bucket: JOB_PHOTOS_BUCKET,
  storagePath: 'co-1/jobs/job-1/ph-visit.jpg',
  takenAt: '2026-09-10T09:00:00.000Z',
  caption: 'After the pull',
  visitNoteId: 'note-1',
  inspectionId: null,
  jhaDocumentId: null,
};

const jobGallery: JobGalleryPhoto = {
  key: 'job:ph-job',
  source: 'job',
  bucket: JOB_PHOTOS_BUCKET,
  storagePath: 'co-1/jobs/job-1/ph-job.jpg',
  takenAt: '2026-09-09T08:00:00.000Z',
  caption: null,
  visitNoteId: null,
  inspectionId: null,
  jhaDocumentId: null,
};

const inspectionGallery: JobGalleryPhoto = {
  key: 'inspection:insp-1/shot.jpg',
  source: 'inspection',
  bucket: INSPECTION_PHOTOS_BUCKET,
  storagePath: 'insp-1/shot.jpg',
  takenAt: '2026-09-11T10:00:00.000Z',
  caption: 'Board face',
  visitNoteId: null,
  inspectionId: 'insp-1',
  jhaDocumentId: null,
};

const jhaGallery: JobGalleryPhoto = {
  key: 'jha:jha-1:step-photo-1',
  source: 'jha',
  bucket: INSPECTION_PHOTOS_BUCKET,
  storagePath: 'jha/jha-1/step-1/step-photo-1.jpg',
  takenAt: '2026-09-08T07:00:00.000Z',
  caption: 'Isolation point',
  visitNoteId: null,
  inspectionId: null,
  jhaDocumentId: 'jha-1',
};

describe('jobPhotoStoragePath', () => {
  it('writes uploaded-pdfs under company/jobs/job/photo.jpg', () => {
    expect(jobPhotoStoragePath({
      companyId: 'co-1',
      jobId: 'job-1',
      photoId: 'ph-1',
    })).toBe('co-1/jobs/job-1/ph-1.jpg');
  });
});

describe('decideJobPhotoUpload', () => {
  it('writes when the job, the signed-in profile, and files are present', () => {
    expect(decideJobPhotoUpload({
      companyId: 'co-1',
      jobId: 'job-1',
      userId: 'p-alex',
      fileCount: 2,
    })).toEqual({ action: 'write' });
  });

  it('refuses a missing job', () => {
    expect(decideJobPhotoUpload({
      companyId: 'co-1',
      jobId: '  ',
      userId: 'p-alex',
      fileCount: 1,
    })).toEqual({
      action: 'miss',
      reason: 'no_job',
      message: 'This job is missing.',
    });
  });

  it('refuses a post with no signed-in profile', () => {
    expect(decideJobPhotoUpload({
      companyId: '',
      jobId: 'job-1',
      userId: 'p-alex',
      fileCount: 1,
    })).toEqual({
      action: 'miss',
      reason: 'not_signed_in',
      message: 'Not signed in',
    });
    expect(decideJobPhotoUpload({
      companyId: 'co-1',
      jobId: 'job-1',
      userId: null,
      fileCount: 1,
    })).toEqual({
      action: 'miss',
      reason: 'not_signed_in',
      message: 'Not signed in',
    });
  });

  it('refuses when no files are chosen', () => {
    expect(decideJobPhotoUpload({
      companyId: 'co-1',
      jobId: 'job-1',
      userId: 'p-alex',
      fileCount: 0,
    })).toEqual({
      action: 'miss',
      reason: 'no_files',
      message: 'Choose photos to add.',
    });
  });
});

describe('buildJobGallery', () => {
  it('merges visit, job, inspection, and JHA photos newest first', () => {
    expect(buildJobGallery({
      jobPhotos: [visitRow, jobRow],
      inspectionPhotos: [{
        inspection_id: 'insp-1',
        storage_path: 'insp-1/shot.jpg',
        caption: 'Board face',
        uploaded_at: '2026-09-11T10:00:00.000Z',
      }],
      jhaDocuments: [{
        id: 'jha-1',
        updated_at: '2026-09-08T07:00:00.000Z',
        steps: [{
          photos: [{
            id: 'step-photo-1',
            storagePath: 'jha/jha-1/step-1/step-photo-1.jpg',
            caption: 'Isolation point',
          }],
        }],
      }],
    })).toEqual([inspectionGallery, visitGallery, jobGallery, jhaGallery]);
  });

  it('treats a job_photos row with visit_note_id as visit, and without as job', () => {
    expect(buildJobGallery({
      jobPhotos: [jobRow, visitRow],
      inspectionPhotos: [],
      jhaDocuments: [],
    }).map(photo => ({ key: photo.key, source: photo.source, visitNoteId: photo.visitNoteId }))).toEqual([
      { key: 'visit:ph-visit', source: 'visit', visitNoteId: 'note-1' },
      { key: 'job:ph-job', source: 'job', visitNoteId: null },
    ]);
  });

  it('dedupes inspection rows on storage_path and keeps the first', () => {
    expect(buildJobGallery({
      jobPhotos: [],
      inspectionPhotos: [
        {
          inspection_id: 'insp-1',
          storage_path: 'insp-1/shot.jpg',
          caption: 'Board face',
          uploaded_at: '2026-09-11T10:00:00.000Z',
        },
        {
          inspection_id: 'insp-2',
          storage_path: 'insp-1/shot.jpg',
          caption: 'Duplicate insert',
          uploaded_at: '2026-09-12T10:00:00.000Z',
        },
      ],
      jhaDocuments: [],
    })).toEqual([inspectionGallery]);
  });

  it('flattens JHA step photos and stamps takenAt from the document clock', () => {
    expect(buildJobGallery({
      jobPhotos: [],
      inspectionPhotos: [],
      jhaDocuments: [{
        id: 'jha-1',
        created_at: '2026-09-08T07:00:00.000Z',
        steps: [
          { photos: [] },
          {
            photos: [{
              id: 'step-photo-1',
              storagePath: 'jha/jha-1/step-1/step-photo-1.jpg',
              caption: 'Isolation point',
            }],
          },
        ],
      }],
    })).toEqual([jhaGallery]);
  });

  it('breaks a same-instant tie on key, A first', () => {
    const earlierKey: JobPhotoRow = {
      ...jobRow,
      id: 'ph-a',
      created_at: '2026-09-09T12:00:00.000Z',
      storage_path: 'co-1/jobs/job-1/ph-a.jpg',
    };
    const laterKey: JobPhotoRow = {
      ...jobRow,
      id: 'ph-b',
      created_at: '2026-09-09T12:00:00.000Z',
      storage_path: 'co-1/jobs/job-1/ph-b.jpg',
    };
    expect(buildJobGallery({
      jobPhotos: [laterKey, earlierKey],
      inspectionPhotos: [],
      jhaDocuments: [],
    }).map(photo => photo.key)).toEqual(['job:ph-a', 'job:ph-b']);
  });
});

describe('filterJobGallery', () => {
  it('returns the visit slice and leaves all unchanged', () => {
    const photos = [inspectionGallery, visitGallery, jobGallery, jhaGallery];
    expect(filterJobGallery(photos, 'visit')).toEqual([visitGallery]);
    expect(filterJobGallery(photos, 'all')).toEqual(photos);
    expect(filterJobGallery(photos, 'jha')).toEqual([jhaGallery]);
  });
});

describe('photosForVisitNote', () => {
  it('returns the photos stamped on that note', () => {
    expect(photosForVisitNote(
      [inspectionGallery, visitGallery, jobGallery],
      'note-1',
    )).toEqual([visitGallery]);
    expect(photosForVisitNote([visitGallery], 'note-missing')).toEqual([]);
  });
});

describe('galleryFilterCounts', () => {
  it('counts all plus each source', () => {
    expect(galleryFilterCounts([
      inspectionGallery,
      visitGallery,
      jobGallery,
      jhaGallery,
    ])).toEqual({
      all: 4,
      visit: 1,
      job: 1,
      inspection: 1,
      jha: 1,
    });
  });
});

describe('jobPhotosQuery', () => {
  it('scopes the board to this company and this job', () => {
    expect(jobPhotosQuery({ companyId: 'co-1', jobId: 'job-1' })).toEqual({
      table: 'job_photos',
      columns: 'id, company_id, job_id, visit_note_id, storage_path, caption, created_by, created_at',
      eq: { company_id: 'co-1', job_id: 'job-1' },
    });
    expect(JOB_PHOTOS_TABLE).toBe('job_photos');
    expect(jobPhotosQuery({ companyId: '', jobId: 'job-1' })).toBe(null);
  });
});


describe('job photos live on the existing job sheet', () => {
  it('places Gallery after Inspections and before testing due, with no gallery route', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const app = src('src/App.tsx');
    const trays = page.slice(page.indexOf('hub-trays hub-jobs-more-trays'), page.indexOf('id="job-schedule"'));
    expect(trays.indexOf('id="job-insp"')).toBeGreaterThan(-1);
    expect(trays.indexOf('id="job-gallery"')).toBeGreaterThan(trays.indexOf('id="job-insp"'));
    expect(trays.indexOf('JOB_TESTING_DUE_TITLE')).toBeGreaterThan(trays.indexOf('id="job-gallery"'));
    expect(page).toContain('JOB_PHOTOS_TABLE');
    expect(page).toContain('uploadJobPhotos');
    expect(page).toContain('buildJobGallery');
    expect(page).toContain('No photos on this job yet.');
    expect(app).not.toContain('path="/gallery"');
    expect(page).not.toMatch(/\bute\b/i);
    expect(page).not.toMatch(/Relovi|Littleloop/);
  });
});

describe('job_photos schema', () => {
  it('locks a company-scoped table with job and visit-note FKs, and no storage change', () => {
    const mig = src('supabase/migrations/20260911050000_077_job_photos.sql');
    const db = src('src/types/database.ts');
    expect(mig).toContain('CREATE TABLE IF NOT EXISTS public.job_photos');
    expect(mig).toContain('job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE');
    expect(mig).toContain('visit_note_id uuid REFERENCES public.job_visit_notes(id) ON DELETE SET NULL');
    expect(mig).toContain('company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE');
    expect(mig).toContain('FOR SELECT');
    expect(mig).toContain('FOR INSERT');
    expect(mig).toContain('FOR DELETE');
    expect(mig).not.toContain('FOR UPDATE');
    expect(mig).not.toContain('my_company_id');
    expect(mig).not.toContain('storage.buckets');
    expect(mig).not.toMatch(/Relovi|Littleloop/);
    expect(mig).not.toMatch(/\bute\b/i);
    expect(mig).toContain('GRANT SELECT, INSERT, DELETE ON public.job_photos TO authenticated');
    expect(db).toContain('job_photos: AnyTable');
  });
});
