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
  VISIT_NOTE_SECTIONS,
  composeVisitNoteBody,
  decideJobVisitNotePost,
  emptyVisitNoteSections,
  emptyVisitUpdateDraft,
  jobVisitNoteAuthor,
  jobVisitNotePostToast,
  jobVisitNotesQuery,
  parseVisitNoteBody,
  sortJobVisitNotesNewestFirst,
  visitAuthorInitials,
  visitPhotoCountLabel,
  visitUpdateSections,
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

const fullSections = {
  done: 'Ran the pipe, 3 m of 20 mm.',
  left: 'Pressure test.',
  parts_used: '3 m of 20 mm pipe, 2 elbows.',
  parts_needed: 'One more elbow.',
  customer_wants: 'A quote for the upstairs run.',
};

const composedFull = [
  'Done:\nRan the pipe, 3 m of 20 mm.',
  'Left to do:\nPressure test.',
  'Parts used:\n3 m of 20 mm pipe, 2 elbows.',
  'Parts needed next visit:\nOne more elbow.',
  'Customer wants:\nA quote for the upstairs run.',
].join('\n\n');

describe('composeVisitNoteBody', () => {
  it('writes the five prompts as labelled sections in the fixed order', () => {
    expect(composeVisitNoteBody(fullSections)).toBe(composedFull);
    expect(VISIT_NOTE_SECTIONS.map(s => s.key)).toEqual(['done', 'left', 'parts_used', 'parts_needed', 'customer_wants']);
  });

  it('keeps the fixed order even when the draft object is keyed in another order', () => {
    expect(composeVisitNoteBody({ customer_wants: 'Quote please.', done: 'Fitted the unit.' }))
      .toBe('Done:\nFitted the unit.\n\nCustomer wants:\nQuote please.');
  });

  it('omits empty sections and trims each one', () => {
    expect(composeVisitNoteBody({
      done: '  Fitted the unit.  ',
      left: '   ',
      parts_used: '',
      parts_needed: '\n2 brackets\n',
      customer_wants: 'Call before the next visit.',
    })).toBe('Done:\nFitted the unit.\n\nParts needed next visit:\n2 brackets\n\nCustomer wants:\nCall before the next visit.');
  });

  it('composes an all-empty draft to an empty string', () => {
    expect(composeVisitNoteBody(emptyVisitNoteSections())).toBe('');
    expect(composeVisitNoteBody({ done: '  ', left: '\n' })).toBe('');
    expect(composeVisitNoteBody({})).toBe('');
  });
});

describe('visitUpdateSections', () => {
  const typed = {
    ...emptyVisitUpdateDraft(),
    done: 'Fitted the unit.',
    left: 'Label the board.',
    parts_used: '4 saddles.',
    parts_needed: 'Two brackets.',
    customer_wants: 'A quote for upstairs.',
  };

  it('writes All done into Left to do and drops any typed left text', () => {
    expect(visitUpdateSections({ ...typed, outcome: 'all_done' })).toEqual({
      done: 'Fitted the unit.',
      left: 'All done',
      parts_used: '4 saddles.',
      parts_needed: 'Two brackets.',
      customer_wants: 'A quote for upstairs.',
    });
  });

  it('keeps the typed left text under More to do', () => {
    expect(visitUpdateSections({ ...typed, outcome: 'more_to_do' }).left).toBe('Label the board.');
  });

  it('leaves Left to do empty when no outcome is chosen, even with left text typed', () => {
    expect(visitUpdateSections({ ...typed, outcome: null }).left).toBe('');
    expect(visitUpdateSections(emptyVisitUpdateDraft())).toEqual(emptyVisitNoteSections());
  });

  it('composes a done-plus-All-done update into the stored two-section body', () => {
    expect(composeVisitNoteBody(visitUpdateSections({
      ...emptyVisitUpdateDraft(),
      done: 'Fitted the unit.',
      outcome: 'all_done',
    }))).toBe('Done:\nFitted the unit.\n\nLeft to do:\nAll done');
  });
});

describe('visitPhotoCountLabel', () => {
  it('reads 0 photos, 1 photo, N photos', () => {
    expect(visitPhotoCountLabel(0)).toBe('0 photos');
    expect(visitPhotoCountLabel(1)).toBe('1 photo');
    expect(visitPhotoCountLabel(3)).toBe('3 photos');
  });
});

describe('visitAuthorInitials', () => {
  it('takes the first letter of the first two names', () => {
    expect(visitAuthorInitials('Alex Reed')).toBe('AR');
    expect(visitAuthorInitials('  sam  cole jones ')).toBe('SC');
    expect(visitAuthorInitials('Crew')).toBe('C');
  });

  it('falls back to Crew for a blank profile name', () => {
    expect(visitAuthorInitials('')).toBe('C');
    expect(visitAuthorInitials(null)).toBe('C');
    expect(visitAuthorInitials(undefined)).toBe('C');
  });
});

describe('parseVisitNoteBody', () => {
  it('round-trips a composed body into labelled blocks in order', () => {
    expect(parseVisitNoteBody(composeVisitNoteBody(fullSections))).toEqual([
      { key: 'done', label: 'Done', text: 'Ran the pipe, 3 m of 20 mm.' },
      { key: 'left', label: 'Left to do', text: 'Pressure test.' },
      { key: 'parts_used', label: 'Parts used', text: '3 m of 20 mm pipe, 2 elbows.' },
      { key: 'parts_needed', label: 'Parts needed next visit', text: 'One more elbow.' },
      { key: 'customer_wants', label: 'Customer wants', text: 'A quote for the upstairs run.' },
    ]);
    expect(parseVisitNoteBody(composeVisitNoteBody({ done: 'Fitted the unit.', customer_wants: 'Quote please.' }))).toEqual([
      { key: 'done', label: 'Done', text: 'Fitted the unit.' },
      { key: 'customer_wants', label: 'Customer wants', text: 'Quote please.' },
    ]);
  });

  it('keeps line breaks inside one section', () => {
    expect(parseVisitNoteBody('Parts used:\n3 m pipe\n2 elbows\n\nLeft to do:\nTest.')).toEqual([
      { key: 'parts_used', label: 'Parts used', text: '3 m pipe\n2 elbows' },
      { key: 'left', label: 'Left to do', text: 'Test.' },
    ]);
  });

  it('returns a plain unlabelled body unchanged as one free-text block', () => {
    expect(parseVisitNoteBody('Pulled the old unit. Left the isolator tagged.')).toEqual([
      { key: null, label: null, text: 'Pulled the old unit. Left the isolator tagged.' },
    ]);
    expect(parseVisitNoteBody('Left to do: pressure test.\nCustomer wants a quote.')).toEqual([
      { key: null, label: null, text: 'Left to do: pressure test.\nCustomer wants a quote.' },
    ]);
    expect(parseVisitNoteBody('')).toEqual([]);
    expect(parseVisitNoteBody(null)).toEqual([]);
  });
});

describe('decideJobVisitNotePost', () => {
  it('posts the composed sections stamped with the signed-in profile, and leaves created_at to the database clock', () => {
    expect(decideJobVisitNotePost({
      jobId: 'job-1',
      companyId: 'co-1',
      authorId: 'p-alex',
      authorName: 'Alex Reed',
      sections: {
        done: '  Ran the pipe, used 3m of 20mm.  ',
        left: 'Pressure test.',
        customer_wants: 'A quote for the upstairs run.',
      },
    })).toEqual({
      action: 'write',
      row: {
        company_id: 'co-1',
        job_id: 'job-1',
        author_id: 'p-alex',
        author_name: 'Alex Reed',
        body: 'Done:\nRan the pipe, used 3m of 20mm.\n\nLeft to do:\nPressure test.\n\nCustomer wants:\nA quote for the upstairs run.',
      },
    });
  });

  it('refuses an all-empty draft when no photos are attached', () => {
    expect(decideJobVisitNotePost({
      jobId: 'job-1',
      companyId: 'co-1',
      authorId: 'p-alex',
      authorName: 'Alex Reed',
      sections: { done: '   ', left: '', parts_used: ' ', parts_needed: '', customer_wants: '\n' },
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
      sections: emptyVisitNoteSections(),
    })).toEqual({
      action: 'miss',
      reason: 'empty',
      message: 'Write what was done.',
    });
  });

  it('posts an empty body when photos are attached', () => {
    expect(decideJobVisitNotePost({
      jobId: 'job-1',
      companyId: 'co-1',
      authorId: 'p-alex',
      authorName: 'Alex Reed',
      sections: { done: '   ' },
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
      sections: { done: 'On site.' },
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
      sections: { done: 'On site.' },
    }).action).toBe('miss');
    expect(JOB_VISIT_NOTE_NOT_SIGNED_IN).toBe('Not signed in');
  });

  it('refuses a post with no job', () => {
    expect(decideJobVisitNotePost({
      jobId: '',
      companyId: 'co-1',
      authorId: 'p-alex',
      authorName: 'Alex Reed',
      sections: { done: 'On site.' },
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
      sections: { done: 'On site.' },
    })).toEqual({
      action: 'write',
      row: {
        company_id: 'co-1',
        job_id: 'job-1',
        author_id: 'p-alex',
        author_name: 'Crew',
        body: 'Done:\nOn site.',
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
    expect(page).toContain('Job notes & photos');
    expect(page).toContain('visitUpdateSections(visitDraft)');
    expect(page).toContain('data-visit-section="done"');
    expect(page).toContain('data-visit-section="left"');
    expect(page).toContain('data-visit-section="parts_used"');
    expect(page).toContain('data-visit-section="parts_needed"');
    expect(page).toContain('data-visit-section="customer_wants"');
    expect(page).toContain('parseVisitNoteBody(note.body)');
    expect(page).not.toContain('What was done, materials, left to do, customer wants');
    expect(page).toContain('Post update');
    expect(page).toContain('No updates on this job yet.');
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
