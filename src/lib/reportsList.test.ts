import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reportIsSent, reportSiteName, reportTemplateName } from './sendReport';
import {
  REPORT_LIST_CLIENT_COLUMNS,
  REPORT_LIST_INSPECTION_COLUMNS,
  REPORT_LIST_JOB_COLUMNS,
  REPORT_LIST_REPORT_COLUMNS,
  fileItemMatchesSearch,
  filterReportsByStatus,
  filterReportsForSearch,
  folderOpenHref,
  formatReportListDate,
  inspectionDriveOpenHref,
  normalizeReportSearch,
  padReportJobNumber,
  parseReportsListOpenId,
  reportListMeta,
  reportListStatus,
  reportListStatusLabel,
  reportListTemplateName,
  reportListTitle,
  reportMatchesSearch,
  reportOpenHref,
  reportSearchHaystack,
  reportsListEmptyMessage,
  reportsListEmptyTitle,
  reportsListJobLine,
  reportsListOpenHref,
  reportsListOpened,
  sortReportsForList,
  uploadedPdfOpenHref,
} from './reportsList';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const workshop = {
  report_number: 'BTS-260827-4412',
  siteName: '12 Workshop Rd, Perth WA 6000',
  clientName: 'Northside Electrical',
  templateName: 'Electrical inspection',
  jobTitle: 'Switchboard upgrade',
  jobNumber: 42,
};

describe('open an existing report or PDF — no new route', () => {
  it('opens the existing inspection report page', () => {
    expect(reportOpenHref('insp-1')).toBe('/inspections/insp-1/report');
    expect(reportOpenHref('  ')).toBe('/drive');
  });

  it('opens the existing uploaded PDF viewer', () => {
    expect(uploadedPdfOpenHref('pdf-1')).toBe('/uploaded-pdfs/pdf-1');
    expect(uploadedPdfOpenHref('')).toBe('/drive');
  });

  it('opens a completed drive inspection on the existing report page', () => {
    expect(inspectionDriveOpenHref({ id: 'insp-2', status: 'completed' }))
      .toBe('/inspections/insp-2/report');
    expect(inspectionDriveOpenHref({ id: 'insp-2', status: 'issued' }))
      .toBe('/inspections/insp-2/report');
    expect(inspectionDriveOpenHref({ id: 'insp-2', status: 'draft' }))
      .toBe('/inspections/insp-2');
  });

  it('keeps folder links on the existing drive route', () => {
    expect(folderOpenHref('fold-1')).toBe('/drive/folder/fold-1');
    expect(folderOpenHref('')).toBe('/drive');
  });

  it('does not invent a new report record path or analytics path', () => {
    const helper = src('src/lib/reportsList.ts');
    expect(helper).not.toContain('/reports-advanced');
    expect(helper).toContain('/inspections/');
    expect(helper).toContain('/uploaded-pdfs/');
    expect(reportOpenHref('insp-1')).toBe('/inspections/insp-1/report');
    expect(reportOpenHref('insp-1').startsWith('/reports')).toBe(false);
    expect(uploadedPdfOpenHref('pdf-1').startsWith('/reports')).toBe(false);
  });

  it('keeps /drive?id= as the in-page open and leaves reportOpenHref on the existing report page', () => {
    expect(reportsListOpenHref('rep-1')).toBe('/drive?id=rep-1');
    expect(reportsListOpenHref('  ')).toBe('/drive');
    expect(parseReportsListOpenId('rep-1')).toBe('rep-1');
    expect(parseReportsListOpenId('')).toBeNull();
    expect(reportsListOpened([{ id: 'rep-1' }, { id: 'rep-2' }], 'rep-2')?.id).toBe('rep-2');
    expect(reportsListOpened([{ id: 'rep-1' }], 'missing')).toBeNull();
    expect(reportsListOpened([{ id: 'rep-1' }], null)).toBeNull();
    expect(reportOpenHref('insp-1')).toBe('/inspections/insp-1/report');
    expect(reportsListOpenHref('rep-1')).not.toContain('/inspections/');
    expect(reportsListJobLine({
      jobNumber: 42,
      jobTitle: 'Switchboard upgrade',
    })).toBe('#0042 Switchboard upgrade');
    expect(reportsListJobLine({
      clientName: 'Northside Electrical',
      templateName: 'Field audit inspection',
    })).toBe('Northside Electrical · Field audit inspection');
  });
});

describe('see existing reports — title, status, meta', () => {
  it('names a report by the living job site, then the snapshot site, then the number', () => {
    expect(reportListTitle({
      meta: { siteName: 'Old snapshot site' },
      job: { address: '12 Workshop Rd, Perth WA 6000', title: 'Switchboard upgrade' },
      reportNumber: 'BTS-1',
    })).toBe('12 Workshop Rd, Perth WA 6000');
    expect(reportListTitle({
      meta: { siteName: 'Northside workshop' },
      job: null,
      reportNumber: 'BTS-1',
    })).toBe('Northside workshop');
    expect(reportListTitle({
      meta: {},
      job: null,
      reportNumber: 'BTS-260827-4412',
    })).toBe('BTS-260827-4412');
    expect(reportListTitle({ meta: {}, job: null })).toBe('Inspection report');
  });

  it('reuses reportSiteName so the list does not invent a second site rule', () => {
    const job = { address: '88 Smith St, Suburb NSW 2000', title: 'LED upgrade' };
    expect(reportListTitle({ meta: { siteName: 'Ignored' }, job }))
      .toBe(reportSiteName({ siteName: 'Ignored' }, job));
  });

  it('marks sent, ready, and missing PDF from existing sent_at and storage path', () => {
    expect(reportListStatus({ sent_at: '2026-08-21T05:00:00.000Z', pdf_storage_path: 'a.pdf' }))
      .toBe('sent');
    expect(reportListStatus({ sent_at: null, pdf_storage_path: 'a.pdf' })).toBe('ready');
    expect(reportListStatus({ sent_at: '  ', pdf_storage_path: '' })).toBe('no_pdf');
    expect(reportListStatusLabel('sent')).toBe('Sent');
    expect(reportListStatusLabel('ready')).toBe('Ready');
    expect(reportListStatusLabel('no_pdf')).toBe('No PDF');
    expect(reportIsSent('2026-08-21T05:00:00.000Z')).toBe(true);
  });

  it('builds a contractor row from number, date, template, client, and job number', () => {
    expect(reportListMeta({
      reportNumber: 'BTS-260827-4412',
      generatedAt: '2026-08-27T09:00:00.000Z',
      templateName: 'Electrical inspection',
      clientName: 'Northside Electrical',
      jobNumber: 42,
    })).toBe('BTS-260827-4412 · 27 Aug 2026 · Electrical inspection · Northside Electrical · #0042');
    expect(formatReportListDate('not-a-date')).toBeNull();
    expect(formatReportListDate(null)).toBeNull();
    expect(padReportJobNumber(42)).toBe('0042');
    expect(reportListTemplateName({ name: 'Electrical inspection' }))
      .toBe(reportTemplateName({ name: 'Electrical inspection' }));
    expect(reportListTemplateName(null)).toBe('Inspection');
  });

  it('sorts newest generated first', () => {
    const rows = sortReportsForList([
      { report_number: 'A', generated_at: '2026-08-01T00:00:00.000Z' },
      { report_number: 'C', generated_at: '2026-08-27T00:00:00.000Z' },
      { report_number: 'B', generated_at: '2026-08-27T00:00:00.000Z' },
    ]);
    expect(rows.map(r => r.report_number)).toEqual(['C', 'B', 'A']);
  });
});

describe('find a report on /reports', () => {
  it('strips a leading hash so #0042 matches the job number', () => {
    expect(normalizeReportSearch('#0042')).toBe('0042');
    expect(normalizeReportSearch('  Workshop  ')).toBe('workshop');
    expect(reportMatchesSearch(workshop, '#42')).toBe(true);
    expect(reportMatchesSearch(workshop, '0042')).toBe(true);
  });

  it('matches site, report number, client, template, and job title', () => {
    expect(reportMatchesSearch(workshop, 'workshop')).toBe(true);
    expect(reportMatchesSearch(workshop, 'bts-260827')).toBe(true);
    expect(reportMatchesSearch(workshop, 'northside')).toBe(true);
    expect(reportMatchesSearch(workshop, 'electrical inspection')).toBe(true);
    expect(reportMatchesSearch(workshop, 'switchboard')).toBe(true);
    expect(reportMatchesSearch(workshop, 'zzz')).toBe(false);
  });

  it('returns the full list when the box is empty or only a hash', () => {
    const rows = [workshop, { report_number: 'BTS-2', siteName: 'Other site' }];
    expect(filterReportsForSearch(rows, '')).toEqual(rows);
    expect(filterReportsForSearch(rows, '   ')).toEqual(rows);
    expect(filterReportsForSearch(rows, '#')).toEqual(rows);
    expect(filterReportsForSearch(rows, 'other')).toEqual([rows[1]]);
  });

  it('filters Ready and Sent without inventing a new status field', () => {
    const rows = [
      { report_number: 'A', listStatus: 'ready' as const },
      { report_number: 'B', listStatus: 'sent' as const },
      { report_number: 'C', listStatus: 'no_pdf' as const },
    ];
    expect(filterReportsByStatus(rows, 'all')).toEqual(rows);
    expect(filterReportsByStatus(rows, 'ready').map(r => r.report_number)).toEqual(['A']);
    expect(filterReportsByStatus(rows, 'sent').map(r => r.report_number)).toEqual(['B']);
  });

  it('keeps uploaded PDF titles searchable on the same floor', () => {
    expect(fileItemMatchesSearch({
      name: 'Warehouse roof quote',
      subtitle: 'warehouse-roof-quote.pdf',
      query: 'roof',
    })).toBe(true);
    expect(fileItemMatchesSearch({ name: 'Other', query: 'roof' })).toBe(false);
    expect(fileItemMatchesSearch({ name: 'Other', query: '' })).toBe(true);
  });

  it('writes an honest empty vs search vs filter title', () => {
    expect(reportsListEmptyTitle({ error: true, count: 0 })).toBe('Could not load reports');
    expect(reportsListEmptyTitle({ search: 'smith', count: 0 })).toBe('No reports match your search');
    expect(reportsListEmptyTitle({ filter: 'sent', count: 0 })).toBe('No sent reports');
    expect(reportsListEmptyTitle({ filter: 'ready', count: 0 })).toBe('No reports ready');
    expect(reportsListEmptyTitle({ count: 0 })).toBe('No reports yet');
    expect(reportsListEmptyMessage({ count: 0 }))
      .toBe('Generate a PDF on an inspection and it will show here.');
    expect(reportSearchHaystack(workshop)).toContain('#0042');
  });
});

describe('list stays on existing report fields', () => {
  it('selects sent_at and the living job site columns already on the report', () => {
    expect(REPORT_LIST_REPORT_COLUMNS).toContain('sent_at');
    expect(REPORT_LIST_REPORT_COLUMNS).toContain('report_number');
    expect(REPORT_LIST_REPORT_COLUMNS).toContain('pdf_storage_path');
    expect(REPORT_LIST_INSPECTION_COLUMNS).toContain('meta');
    expect(REPORT_LIST_INSPECTION_COLUMNS).toContain('crm_job_id');
    expect(REPORT_LIST_JOB_COLUMNS).toContain('address');
    expect(REPORT_LIST_CLIENT_COLUMNS).toBe('id, name');
  });
});
