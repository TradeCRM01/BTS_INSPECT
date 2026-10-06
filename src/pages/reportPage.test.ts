import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('report PDF storage key', () => {
  it('uploads an ASCII-safe key and shows a visible error without issuing on fail', () => {
    const page = src('src/pages/ReportPage.tsx');
    expect(page).toContain('reportPdfStorageKey');
    expect(page).toContain('REPORT_PDF_UPLOAD_FAIL_MESSAGE');
    expect(page).toContain('if (upErr)');
    expect(page).toContain('setError(upErr.message');
    expect(page).toContain('if (insErr)');
    expect(page).toContain("status: 'issued'");
    expect(page.indexOf('if (upErr)')).toBeLessThan(page.indexOf("status: 'issued'"));
    expect(page).toContain('a.download = filename');
    expect(page).toContain('reportPdfFilename');
  });
});
