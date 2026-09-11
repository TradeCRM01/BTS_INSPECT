import { supabase } from './supabase';

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

export type VisitNoteSection = {
  key: 'done' | 'left' | 'parts_used' | 'parts_needed' | 'customer_wants';
  label: string;
  placeholder: string;
};

/** The guided composer's prompts, in the order they compose into one note body. */
export const VISIT_NOTE_SECTIONS: readonly VisitNoteSection[] = [
  { key: 'done', label: 'Done', placeholder: 'What was done on site' },
  { key: 'left', label: 'Left to do', placeholder: 'Works remaining' },
  { key: 'parts_used', label: 'Parts used', placeholder: 'Materials and quantities used' },
  { key: 'parts_needed', label: 'Parts needed next visit', placeholder: 'What to bring next time' },
  { key: 'customer_wants', label: 'Customer wants', placeholder: 'What the customer asked for' },
];

export type VisitNoteSectionKey = VisitNoteSection['key'];
export type VisitNoteSections = Record<VisitNoteSectionKey, string>;

export type VisitNoteBlock = {
  key: VisitNoteSectionKey | null;
  label: string | null;
  text: string;
};

export function emptyVisitNoteSections(): VisitNoteSections {
  return { done: '', left: '', parts_used: '', parts_needed: '', customer_wants: '' };
}

export function trimVisitNote(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

/** One body string with `Label:` headings, empty sections left out. All empty gives ''. */
export function composeVisitNoteBody(sections: Partial<VisitNoteSections>): string {
  return VISIT_NOTE_SECTIONS
    .map(section => ({ section, text: trimVisitNote(sections[section.key]) }))
    .filter(({ text }) => text)
    .map(({ section, text }) => `${section.label}:\n${text}`)
    .join('\n\n');
}

const SECTION_BY_HEADING = new Map(
  VISIT_NOTE_SECTIONS.map(section => [`${section.label}:`, section] as const),
);

/**
 * Splits a stored body back into labelled blocks. A body with no `Label:` line
 * comes back as one free-text block so older notes render as they always did.
 */
export function parseVisitNoteBody(body: string | null | undefined): VisitNoteBlock[] {
  const blocks: VisitNoteBlock[] = [];
  let current: VisitNoteSection | null = null;
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join('\n').trim();
    if (text) blocks.push({ key: current?.key ?? null, label: current?.label ?? null, text });
    lines = [];
  };
  for (const line of (body ?? '').split('\n')) {
    const heading = SECTION_BY_HEADING.get(line.trim());
    if (heading) {
      flush();
      current = heading;
    } else {
      lines.push(line);
    }
  }
  flush();
  return blocks;
}

export function jobVisitNoteAuthor(profileName: string | null | undefined): string {
  return trimVisitNote(profileName) || JOB_VISIT_NOTE_CREW;
}

export function decideJobVisitNotePost(input: {
  jobId: string | null | undefined;
  companyId: string | null | undefined;
  authorId: string | null | undefined;
  authorName: string | null | undefined;
  sections: Partial<VisitNoteSections>;
  photoCount?: number;
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
  const body = composeVisitNoteBody(input.sections);
  const photoCount = input.photoCount ?? 0;
  if (!body && photoCount <= 0) {
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
  sections: Partial<VisitNoteSections>;
  photoCount?: number;
}): Promise<string> {
  const decision = decideJobVisitNotePost(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { data, error } = await supabase
    .from(JOB_VISIT_NOTE_TABLE)
    .insert(decision.row)
    .select('id')
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error('Visit note was not saved.');
  return data.id as string;
}
