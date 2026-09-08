import { supabase } from './supabase';

/** Append-only visit notes on the existing job sheet. Not a Visit Wall module. */
export const JOB_VISIT_NOTE_TABLE = 'job_visit_notes';

export const JOB_VISIT_NOTE_COLUMNS =
  'id, company_id, job_id, author_id, author_name, body, created_at';

export const JOB_VISIT_NOTE_EMPTY = 'Write what was done.';
export const JOB_VISIT_NOTE_NO_JOB = 'This job is missing.';
export const JOB_VISIT_NOTE_NOT_SIGNED_IN = 'Not signed in';
export const JOB_VISIT_NOTE_POSTED = 'Visit note posted';
export const JOB_VISIT_NOTE_CREW = 'Crew';

export type JobVisitNote = {
  id: string;
  company_id: string;
  job_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

export type JobVisitNoteWrite = {
  company_id: string;
  job_id: string;
  author_id: string;
  author_name: string;
  body: string;
};

export type DecideJobVisitNote =
  | { action: 'miss'; reason: 'no_job' | 'not_signed_in' | 'empty'; message: string }
  | { action: 'write'; row: JobVisitNoteWrite };

export function trimVisitNote(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

/** Author is the signed-in profile name. Blank name still posts as Crew. */
export function jobVisitNoteAuthor(profileName: string | null | undefined): string {
  return trimVisitNote(profileName) || JOB_VISIT_NOTE_CREW;
}

export function decideJobVisitNotePost(input: {
  jobId: string | null | undefined;
  companyId: string | null | undefined;
  authorId: string | null | undefined;
  authorName: string | null | undefined;
  body: string | null | undefined;
}): DecideJobVisitNote {
  const jobId = trimVisitNote(input.jobId);
  if (!jobId) {
    return { action: 'miss', reason: 'no_job', message: JOB_VISIT_NOTE_NO_JOB };
  }
  const companyId = trimVisitNote(input.companyId);
  const authorId = trimVisitNote(input.authorId);
  if (!companyId || !authorId) {
    return { action: 'miss', reason: 'not_signed_in', message: JOB_VISIT_NOTE_NOT_SIGNED_IN };
  }
  const body = trimVisitNote(input.body);
  if (!body) {
    return { action: 'miss', reason: 'empty', message: JOB_VISIT_NOTE_EMPTY };
  }
  return {
    action: 'write',
    row: {
      company_id: companyId,
      job_id: jobId,
      author_id: authorId,
      author_name: jobVisitNoteAuthor(input.authorName),
      body,
    },
  };
}

/** Newest created_at first. Same-instant rows break on id, newest id first. */
export function sortJobVisitNotesNewestFirst(
  notes: JobVisitNote[] | null | undefined,
): JobVisitNote[] {
  return [...(notes ?? [])].sort((a, b) => {
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? 1 : -1;
    }
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}

export function jobVisitNotesQuery(args: {
  companyId: string;
  jobId: string;
}): { table: typeof JOB_VISIT_NOTE_TABLE; columns: string; eq: { company_id: string; job_id: string } } | null {
  const companyId = trimVisitNote(args.companyId);
  const jobId = trimVisitNote(args.jobId);
  if (!companyId || !jobId) return null;
  return {
    table: JOB_VISIT_NOTE_TABLE,
    columns: JOB_VISIT_NOTE_COLUMNS,
    eq: { company_id: companyId, job_id: jobId },
  };
}

export function jobVisitNotePostToast(): { message: string; kind: 'success' } {
  return { message: JOB_VISIT_NOTE_POSTED, kind: 'success' };
}

export async function postJobVisitNote(input: {
  jobId: string | null | undefined;
  companyId: string | null | undefined;
  authorId: string | null | undefined;
  authorName: string | null | undefined;
  body: string | null | undefined;
}): Promise<JobVisitNoteWrite> {
  const decision = decideJobVisitNotePost(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { error } = await supabase.from(JOB_VISIT_NOTE_TABLE).insert(decision.row);
  if (error) throw error;
  return decision.row;
}
