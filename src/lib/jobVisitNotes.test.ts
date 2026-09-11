import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JOB_VISIT_NOTE_COLUMNS,
  JOB_VISIT_NOTE_CREW,
  JOB_VISIT_NOTE_NO_JOB,
  JOB_VISIT_NOTE_NOT_SIGNED_IN,
  JOB_VISIT_NOTE_POSTED,
  JOB_VISIT_NOTE_TABLE,
  decideJobVisitNotePost,
  jobVisitNoteAuthor,
  jobVisitNotePostToast,
  jobVisitNotesQuery,
  sortJobVisitNotesNewestFirst,
} from './jobVisitNotes';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const older = {
  id: 'n-old',
  company_id: 'co-1',
  job_id: 'job-1',
  author_id: 'p-sam',
  author_name: 'Sam Cole',
  body: 'Pulled the old unit. Left the isolator tagged.',
  created_at: '2026-09-07T08:00:00.000Z',
};

const newer = {
  id: 'n-new',
  company_id: 'co-1',
  job_id: 'job-1',
  author_id: 'p-alex',
  author_name: 'Alex Reed',
  body: 'Fitted the new unit. Customer wants a quote for the upstairs run.',
  created_at: '2026-09-08T09:15:00.000Z',
};

const sameInstantEarlierId = {
  id: 'n-a',
  company_id: 'co-1',
  job_id: 'job-1',
  author_id: 'p-sam',
  author_name: 'Sam Cole',
  body: 'First of the pair.',
  created_at: '2026-09-08T10:00:00.000Z',
};

const sameInstantLaterId = {
  id: 'n-b',
  company_id: 'co-1',
  job_id: 'job-1',
  author_id: 'p-alex',
  author_name: 'Alex Reed',
  body: 'Second of the pair.',
  created_at: '2026-09-08T10:00:00.000Z',
};

describe('decideJobVisitNotePost', () => {
  it('posts free text stamped with the signed-in profile, and leaves created_at to the database clock', () => {
    expect(decideJobVisitNotePost({
      jobId: 'job-1',
      companyId: 'co-1',
      authorId: 'p-alex',
      authorName: 'Alex Reed',
      body: '  Ran the pipe, used 3m of 20mm. Left to do: pressure test. Customer wants a quote for the upstairs run.  ',
    })).toEqual({
      action: 'write',
      row: {
        company_id: 'co-1',
        job_id: 'job-1',
        author_id: 'p-alex',
        author_name: 'Alex Reed',
        body: 'Ran the pipe, used 3m of 20mm. Left to do: pressure test. Customer wants a quote for the upstairs run.',
      },
    });
  });

  it('refuses a blank body when no photos are attached', () => {
    expect(decideJobVisitNotePost({
      jobId: 'job-1',
      companyId: 'co-1',
      authorId: 'p-alex',
      authorName: 'Alex Reed',
      body: '   ',
      photoCount: 0,
    })).toEqual({
      action: 'miss',
      reason: 'empty',
      message: 'Write what was done.',
    });
    expect(decideJobVisitNotePost({
      jobId: 'job-1',
      companyId: 'co-1',
      authorId: 'p-alex',
      authorName: 'Alex Reed',
      body: '',
    })).toEqual({
      action: 'miss',
      reason: 'empty',
      message: 'Write what was done.',
    });
  });

  it('posts a blank body when photos are attached', () => {
    expect(decideJobVisitNotePost({
      jobId: 'job-1',
      companyId: 'co-1',
      authorId: 'p-alex',
      authorName: 'Alex Reed',
      body: '   ',
      photoCount: 2,
    })).toEqual({
      action: 'write',
      row: {
        company_id: 'co-1',
        job_id: 'job-1',
        author_id: 'p-alex',
        author_name: 'Alex Reed',
        body: '',
      },
    });
  });

  it('refuses a post with no signed-in profile', () => {
    expect(decideJobVisitNotePost({
      jobId: 'job-1',
      companyId: 'co-1',
      authorId: '',
      authorName: 'Alex Reed',
      body: 'On site.',
    })).toEqual({
      action: 'miss',
      reason: 'not_signed_in',
      message: JOB_VISIT_NOTE_NOT_SIGNED_IN,
    });
    expect(decideJobVisitNotePost({
      jobId: 'job-1',
      companyId: null,
      authorId: 'p-alex',
      authorName: 'Alex Reed',
      body: 'On site.',
    }).action).toBe('miss');
    expect(JOB_VISIT_NOTE_NOT_SIGNED_IN).toBe('Not signed in');
  });

  it('refuses a post with no job', () => {
    expect(decideJobVisitNotePost({
      jobId: '',
      companyId: 'co-1',
      authorId: 'p-alex',
      authorName: 'Alex Reed',
      body: 'On site.',
    })).toEqual({
      action: 'miss',
      reason: 'no_job',
      message: JOB_VISIT_NOTE_NO_JOB,
    });
  });

  it('stamps a blank profile name as Crew so the next person still sees who posted', () => {
    expect(jobVisitNoteAuthor('  ')).toBe(JOB_VISIT_NOTE_CREW);
    expect(jobVisitNoteAuthor(null)).toBe('Crew');
    expect(decideJobVisitNotePost({
      jobId: 'job-1',
      companyId: 'co-1',
      authorId: 'p-alex',
      authorName: '   ',
      body: 'On site.',
    })).toEqual({
      action: 'write',
      row: {
        company_id: 'co-1',
        job_id: 'job-1',
        author_id: 'p-alex',
        author_name: 'Crew',
        body: 'On site.',
      },
    });
  });
});

describe('sortJobVisitNotesNewestFirst', () => {
  it('returns the newest created_at first so the next person reads the latest visit', () => {
    expect(sortJobVisitNotesNewestFirst([older, newer]).map(n => n.id)).toEqual(['n-new', 'n-old']);
    expect(sortJobVisitNotesNewestFirst([newer, older]).map(n => n.body)).toEqual([
      'Fitted the new unit. Customer wants a quote for the upstairs run.',
      'Pulled the old unit. Left the isolator tagged.',
    ]);
  });

  it('breaks a same-instant tie on id, newest id first', () => {
    expect(sortJobVisitNotesNewestFirst([sameInstantEarlierId, sameInstantLaterId]).map(n => n.id))
      .toEqual(['n-b', 'n-a']);
  });
});

describe('jobVisitNotesQuery', () => {
  it('scopes the log to this company and this job', () => {
    expect(jobVisitNotesQuery({ companyId: 'co-1', jobId: 'job-1' })).toEqual({
      table: JOB_VISIT_NOTE_TABLE,
      columns: JOB_VISIT_NOTE_COLUMNS,
      eq: { company_id: 'co-1', job_id: 'job-1' },
    });
    expect(JOB_VISIT_NOTE_TABLE).toBe('job_visit_notes');
    expect(jobVisitNotesQuery({ companyId: '', jobId: 'job-1' })).toBe(null);
  });
});

describe('visit notes live on the existing job sheet', () => {
  it('posts from JobDetailPage /jobs/:id — no Visit Wall route or nav', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const app = src('src/App.tsx');
    expect(page).toContain('id="job-visit-notes"');
    expect(page).toContain('decideJobVisitNotePost');
    expect(page).toContain('postJobVisitNote');
    expect(page).toContain('sortJobVisitNotesNewestFirst');
    expect(page).toContain("order('created_at', { ascending: false })");
    expect(page).toContain('note.author_name');
    expect(page).toContain('note.created_at');
    expect(page).toContain('note.body');
    expect(page).toContain('profile?.name');
    expect(page).toContain('Visit notes');
    expect(page).toContain('What was done, materials, left to do, customer wants');
    expect(page).toContain('Post note');
    expect(page).toContain('No visit notes on this job yet.');
    expect(page).toContain('JOB_VISIT_NOTE_TABLE');
    expect(jobVisitNotePostToast()).toEqual({ message: JOB_VISIT_NOTE_POSTED, kind: 'success' });
    expect(app).toContain('<Route path="/jobs/:id"');
    expect(app).not.toContain('path="/visit-wall"');
    expect(app).not.toContain('path="/visits"');
    expect(app).not.toContain('VisitWall');
    expect(page).not.toContain('path="/visit-wall');
    expect(page).not.toMatch(/Relovi|Littleloop/);
    expect(page).not.toMatch(/electrician|electrical/i);
  });

  it('keeps the log in job-conduct order after time on this job', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const trays = page.slice(page.indexOf('hub-trays hub-jobs-more-trays'), page.indexOf('id="job-schedule"'));
    expect(trays.indexOf('title="Time on this job"')).toBeGreaterThan(-1);
    expect(trays.indexOf('id="job-visit-notes"')).toBeGreaterThan(trays.indexOf('title="Time on this job"'));
    expect(trays.indexOf('title="Inspections"')).toBeGreaterThan(trays.indexOf('id="job-visit-notes"'));
  });
});

describe('job_visit_notes schema', () => {
  it('locks a tiny company-scoped table with job_id FK and append-only RLS', () => {
    const mig = src('supabase/migrations/20260908090000_076_job_visit_notes.sql');
    const db = src('src/types/database.ts');
    expect(mig).toContain('CREATE TABLE IF NOT EXISTS public.job_visit_notes');
    expect(mig).toContain('job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE');
    expect(mig).toContain('author_name text NOT NULL');
    expect(mig).toContain('body text NOT NULL');
    expect(mig).toContain('created_at timestamptz NOT NULL DEFAULT now()');
    expect(mig).toContain('company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())');
    expect(mig).toContain('author_id = auth.uid()');
    expect(mig).toContain('FOR SELECT');
    expect(mig).toContain('FOR INSERT');
    expect(mig).not.toContain('FOR UPDATE');
    expect(mig).not.toContain('FOR DELETE');
    expect(mig).not.toContain('my_company_id');
    expect(mig).not.toMatch(/Relovi|Littleloop/);
    expect(mig).toContain('GRANT SELECT, INSERT ON public.job_visit_notes TO authenticated');
    expect(db).toContain('job_visit_notes: AnyTable');
  });
});
