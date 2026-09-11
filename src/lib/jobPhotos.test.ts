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
  jobPhotoInsert,
  jobPhotoStoragePath,
  jobPhotosQuery,
  photosForVisitNote,
  placeFromJobPhotoRow,
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
  created_at: '2026-09-10T09:30:00.000Z',
  taken_at: '2026-09-10T09:00:00.000Z',
  taken_at_source: 'exif',
  lat: -27.4698,
  lng: 153.0251,
  location_source: 'exif',
  location_accuracy_m: null,
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
  taken_at: '2026-09-09T08:00:00.000Z',
  taken_at_source: 'upload',
  lat: null,
  lng: null,
  location_source: null,
  location_accuracy_m: null,
};

const visitGallery: JobGalleryPhoto = {
  key: 'visit:ph-visit',
  source: 'visit',
  bucket: JOB_PHOTOS_BUCKET,
  storagePath: 'co-1/jobs/job-1/ph-visit.jpg',
  takenAt: '2026-09-10T09:00:00.000Z',
  takenAtSource: 'exif',
  place: { lat: -27.4698, lng: 153.0251, source: 'exif', accuracyM: null },
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
  takenAtSource: 'upload',
  place: null,
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
  takenAtSource: 'upload',
  place: null,
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
  takenAtSource: 'upload',
  place: null,
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

describe('jobPhotoInsert', () => {
  it('writes the photo clock and photo GPS onto the row', () => {
    expect(jobPhotoInsert({
      photoId: 'ph-1',
      companyId: 'co-1',
      jobId: 'job-1',
      visitNoteId: 'note-1',
      userId: 'p-alex',
      provenance: {
        takenAt: '2026-09-07T23:15:30.000Z',
        takenAtSource: 'exif',
        place: { lat: -27.4698, lng: 153.0251, source: 'exif', accuracyM: null },
      },
    })).toEqual({
      id: 'ph-1',
      company_id: 'co-1',
      job_id: 'job-1',
      visit_note_id: 'note-1',
      storage_path: 'co-1/jobs/job-1/ph-1.jpg',
      created_by: 'p-alex',
      taken_at: '2026-09-07T23:15:30.000Z',
      taken_at_source: 'exif',
      lat: -27.4698,
      lng: 153.0251,
      location_source: 'exif',
      location_accuracy_m: null,
    });
  });

  it('writes the upload clock and the device fix with its accuracy, or nulls with no fix', () => {
    const withDevice = jobPhotoInsert({
      photoId: 'ph-2',
      companyId: 'co-1',
      jobId: 'job-1',
      visitNoteId: null,
      userId: 'p-sam',
      provenance: {
        takenAt: '2026-09-11T01:02:03.000Z',
        takenAtSource: 'upload',
        place: { lat: -33.8688, lng: 151.2093, source: 'device', accuracyM: 12 },
      },
    });
    expect(withDevice).toMatchObject({
      visit_note_id: null,
      taken_at: '2026-09-11T01:02:03.000Z',
      taken_at_source: 'upload',
      lat: -33.8688,
      lng: 151.2093,
      location_source: 'device',
      location_accuracy_m: 12,
    });
    const noFix = jobPhotoInsert({
      photoId: 'ph-3',
      companyId: 'co-1',
      jobId: 'job-1',
      visitNoteId: null,
      userId: 'p-sam',
      provenance: { takenAt: '2026-09-11T01:02:03.000Z', takenAtSource: 'upload', place: null },
    });
    expect([noFix.lat, noFix.lng, noFix.location_source, noFix.location_accuracy_m]).toEqual([null, null, null, null]);
  });
});

describe('placeFromJobPhotoRow', () => {
  it('rebuilds the place from row columns and reads a half-written fix as none', () => {
    expect(placeFromJobPhotoRow(visitRow)).toEqual({ lat: -27.4698, lng: 153.0251, source: 'exif', accuracyM: null });
    expect(placeFromJobPhotoRow({ ...jobRow, lat: -27.4698, lng: 153.0251, location_source: 'device', location_accuracy_m: 20 }))
      .toEqual({ lat: -27.4698, lng: 153.0251, source: 'device', accuracyM: 20 });
    expect(placeFromJobPhotoRow({ ...jobRow, lat: -27.4698 })).toBe(null);
  });
});

describe('buildJobGallery', () => {
  it('orders job photos by the photo clock, not the upload clock', () => {
    const shotEarlierUploadedLater: JobPhotoRow = {
      ...jobRow,
      id: 'ph-late-upload',
      storage_path: 'co-1/jobs/job-1/ph-late-upload.jpg',
      created_at: '2026-09-12T08:00:00.000Z',
      taken_at: '2026-09-01T08:00:00.000Z',
      taken_at_source: 'exif',
    };
    expect(buildJobGallery({
      jobPhotos: [shotEarlierUploadedLater, jobRow],
      inspectionPhotos: [],
      jhaDocuments: [],
    }).map(photo => photo.key)).toEqual(['job:ph-job', 'job:ph-late-upload']);
  });

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
      columns: 'id, company_id, job_id, visit_note_id, storage_path, caption, created_by, created_at, taken_at, taken_at_source, lat, lng, location_source, location_accuracy_m',
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

  it('lets the live host ask for a device fix, and keeps photo provenance on the existing row', () => {
    for (const headers of [src('public/_headers'), src('netlify.toml')]) {
      expect(headers).toContain('geolocation=(self)');
      expect(headers).not.toContain('geolocation=()');
    }
    const mig = src('supabase/migrations/20260911070000_078_job_photo_provenance.sql');
    expect(mig).not.toContain('CREATE TABLE');
    expect(mig).not.toContain('FOR UPDATE');
    expect(mig).not.toContain('storage.buckets');
    expect(mig).not.toMatch(/Relovi|Littleloop/);
    expect(mig).not.toMatch(/\bute\b/i);
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
    expect(mig).toContain('AND j.company_id = job_photos.company_id');
    expect(mig).not.toContain('storage.buckets');
    expect(mig).not.toMatch(/Relovi|Littleloop/);
    expect(mig).not.toMatch(/\bute\b/i);
    expect(mig).toContain('GRANT SELECT, INSERT, DELETE ON public.job_photos TO authenticated');
    expect(db).toContain('job_photos: AnyTable');
  });
});
