import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  persistGeneratedReportPdf,
  REPORT_PDF_UPLOAD_FAIL_MESSAGE,
  type ReportPdfStore,
} from '../lib/sendReport';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function store(over: Partial<ReportPdfStore> = {}): ReportPdfStore & {
  uploads: string[];
  inserts: unknown[];
  issued: string[];
  removed: string[];
  updated: Array<{ id: string; path: string }>;
} {
  const rec = {
    uploads: [] as string[],
    inserts: [] as unknown[],
    issued: [] as string[],
    removed: [] as string[],
    updated: [] as Array<{ id: string; path: string }>,
  };
  return Object.assign(rec, {
    upload: async (path: string) => {
      rec.uploads.push(path);
      return { error: null };
    },
    insertReport: async (row: unknown) => {
      rec.inserts.push(row);
      return { error: null };
    },
    updateReportPath: async (id: string, path: string) => {
      rec.updated.push({ id, path });
      return { error: null };
    },
    markIssued: async (inspectionId: string) => {
      rec.issued.push(inspectionId);
      return { error: null };
    },
    remove: async (path: string) => {
      rec.removed.push(path);
    },
    ...over,
  });
}

const blob = new Blob(['pdf'], { type: 'application/pdf' });
const base = {
  inspectionId: 'insp-1',
  companyId: 'co-1',
  reportNumber: 'BTS-260821-1234',
  siteName: 'Plant — A',
  blob,
};

describe('report PDF storage key', () => {
  it('uploads through persistGeneratedReportPdf and never surfaces raw storage text', () => {
    const page = src('src/pages/ReportPage.tsx');
    expect(page).toContain('persistGeneratedReportPdf');
    expect(page).toContain('existingPath: existingReport?.pdf_storage_path');
    expect(page).toContain('setError(saved.error)');
    expect(page).not.toContain('setError(upErr.message');
    expect(page).not.toContain('setError(insErr.message');
    expect(page).toContain('reportPdfFilename');
    expect(page).toContain('a.download = filename');
  });
});

describe('persistGeneratedReportPdf', () => {
  it('shows the fixed message and skips insert when upload fails', async () => {
    const log = { error: vi.fn() };
    const db = store({
      upload: async (path) => {
        db.uploads.push(path);
        return { error: { message: 'new row violates row-level security policy' } };
      },
    });
    const result = await persistGeneratedReportPdf(base, db, log);
    expect(result).toEqual({ ok: false, error: REPORT_PDF_UPLOAD_FAIL_MESSAGE });
    expect(db.inserts).toEqual([]);
    expect(db.issued).toEqual([]);
    expect(log.error).toHaveBeenCalledWith({ message: 'new row violates row-level security policy' });
    expect(db.uploads[0]).toBe('insp-1/Plant-A-BTS-260821-1234.pdf');
  });

  it('shows the fixed message, removes the object, and does not issue when insert fails', async () => {
    const log = { error: vi.fn() };
    const db = store({
      insertReport: async (row) => {
        db.inserts.push(row);
        return { error: { message: 'duplicate key value' } };
      },
    });
    const result = await persistGeneratedReportPdf(base, db, log);
    expect(result).toEqual({ ok: false, error: REPORT_PDF_UPLOAD_FAIL_MESSAGE });
    expect(db.issued).toEqual([]);
    expect(db.removed).toEqual(['insp-1/Plant-A-BTS-260821-1234.pdf']);
    expect(log.error).toHaveBeenCalled();
  });

  it('regenerates onto the existing storage path and does not write a new reports row', async () => {
    const db = store();
    const result = await persistGeneratedReportPdf({
      ...base,
      existingReportId: 'rep-1',
      existingPath: 'insp-1/Plant A - BTS-260821-1234.pdf',
      inspectionStatus: 'issued',
    }, db);
    expect(result).toEqual({
      ok: true,
      storagePath: 'insp-1/Plant A - BTS-260821-1234.pdf',
    });
    expect(db.uploads).toEqual(['insp-1/Plant A - BTS-260821-1234.pdf']);
    expect(db.inserts).toEqual([]);
    expect(db.updated).toEqual([]);
    expect(db.issued).toEqual([]);
  });

  it('retries issued when a report already exists and the inspection is not issued', async () => {
    const db = store();
    const result = await persistGeneratedReportPdf({
      ...base,
      existingReportId: 'rep-1',
      existingPath: 'insp-1/Plant A - BTS-260821-1234.pdf',
      inspectionStatus: 'completed',
    }, db);
    expect(result.ok).toBe(true);
    expect(db.inserts).toEqual([]);
    expect(db.issued).toEqual(['insp-1']);
  });
});
