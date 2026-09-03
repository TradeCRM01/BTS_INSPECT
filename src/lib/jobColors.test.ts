import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOB_COLORS, jobColorToStore, pickJobColor } from './jobColors';
import { weekBoardChipColor } from './scheduleBoard';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('jobColorToStore', () => {
  it('writes a hex onto jobs.color and clears inherit with blank', () => {
    expect(jobColorToStore('#F7931A')).toBe('#F7931A');
    expect(jobColorToStore('#7c3aed')).toBe('#7C3AED');
    expect(jobColorToStore('  #8B4513  ')).toBe('#8B4513');
    expect(jobColorToStore('#f80')).toBe('#FF8800');
    expect(jobColorToStore('')).toBeNull();
    expect(jobColorToStore('   ')).toBeNull();
    expect(jobColorToStore(null)).toBeNull();
    expect(jobColorToStore(undefined)).toBeNull();
    expect(jobColorToStore('not-a-color')).toBeNull();
  });
});

describe('job sheet colour — existing Details form writes jobs.color', () => {
  it('saves colour on the existing jobs.update / insert path — no new module, route, or board picker', () => {
    const modal = src('src/components/crm/JobFormModal.tsx');
    const colors = src('src/lib/jobColors.ts');
    const page = src('src/pages/JobDetailPage.tsx');
    const board = src('src/pages/SchedulePage.tsx');
    const saveStart = modal.indexOf('const handleSave');
    const saveEnd = modal.indexOf('const handleDelete');
    expect(saveStart).toBeGreaterThan(-1);
    expect(saveEnd).toBeGreaterThan(saveStart);
    const save = modal.slice(saveStart, saveEnd);

    expect(colors).toContain('export function jobColorToStore');
    expect(colors).toContain('JOB_COLORS');
    expect(JOB_COLORS).toContain('#F7931A');
    expect(JOB_COLORS).toContain('#7C3AED');
    expect(JOB_COLORS).toContain('#DB2777');

    expect(modal).toContain("from('../../lib/jobColors')");
    expect(modal).toContain('JOB_COLORS');
    expect(modal).toContain('jobColorToStore');
    expect(modal).toContain('color: job?.color ?? \'\'');
    expect(modal).toContain('ops-field-label">Colour');
    expect(modal).toContain('type="color"');
    expect(modal).toContain('Another colour');
    expect(modal).toContain('JOB_COLORS.map');
    expect(save).toContain('color: jobColorToStore(form.color)');
    expect(save).toContain("from('jobs').update");
    expect(save).toContain("from('jobs')");
    expect(save).toContain('.insert({');
    expect(save).toContain('...payload');
    expect(save).not.toContain('sendQuoteDeliver');
    expect(save).not.toContain('QuoteSendDialog');
    expect(save).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(save).not.toContain('createInvoiceFromJobBill');
    expect(save).not.toContain('due_date');
    expect(save).not.toContain('stripe');

    expect(page).toContain('JobFormModal');
    expect(page).toContain('fields="details"');
    expect(page).toContain('setShowEdit(true)');
    expect(page).toContain('>Details<');
    expect(page).toContain('className="btn-primary ops-next-control-block"');
    expect(page).not.toContain('jobColorToStore');
    expect(page).not.toContain('JOB_COLORS');
    expect(page).not.toContain('hub-week-chip');
    expect(page).not.toContain('MarketingPage');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');

    expect(board).not.toContain('jobColorToStore');
    expect(board).toContain('weekBoardChipColor');
    expect(board).not.toContain('ops-field-label">Colour');
    expect(src('src/App.tsx')).not.toContain('job-color');
    expect(src('src/App.tsx')).not.toContain('JobColor');
  });

  it('does not add a second 44px Next or new look chrome on the open sheet', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const modal = src('src/components/crm/JobFormModal.tsx');
    expect(page).toContain('className="btn-primary ops-next-control-block"');
    expect((page.match(/ops-next-control-block/g) ?? []).length).toBe(1);
    expect(page).not.toContain('hub-job-color');
    expect(page).not.toContain('job-color-picker');
    expect(modal).toContain('className="btn-primary min-h-[44px] disabled:opacity-50"');
    expect(modal).toContain('h-7 w-7 rounded-md border-2');
    expect(modal).not.toContain('className="btn-primary h-7');
    expect(modal).not.toContain('EmployeeColorSwatch');
    expect(modal).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(modal).not.toMatch(/electrical|switchboard/i);
  });

  it('leaves quotes send, landing, Accept/Convert, Relovi, Invoice Next, and Stripe off this hop', () => {
    const modal = src('src/components/crm/JobFormModal.tsx');
    const colors = src('src/lib/jobColors.ts');
    expect(modal).not.toContain('sendQuoteDeliver');
    expect(modal).not.toContain('QuoteSendDialog');
    expect(modal).not.toContain('MarketingPage');
    expect(modal).not.toContain('convertQuoteToJob');
    expect(modal).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(modal).not.toContain('createInvoiceFromJobBill');
    expect(modal).not.toContain('InvoiceSendDialog');
    expect(modal).not.toContain('due_date');
    expect(modal).not.toContain('stripe');
    expect(modal).not.toContain('Relovi');
    expect(modal).not.toContain('Littleloop');
    expect(colors).not.toContain('sendQuoteDeliver');
    expect(colors).not.toContain('convertQuoteToJob');
    expect(colors).not.toContain('createInvoiceFromJobBill');
    expect(src('src/lib/convertQuoteToJob.ts')).not.toContain('jobColorToStore');
    expect(src('src/lib/sendQuoteDeliver.ts')).not.toContain('jobColorToStore');
    expect(src('src/lib/createInvoiceFromJobBill.ts')).not.toContain('jobColorToStore');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('jobColorToStore');
  });
});

describe('same-quote children share jobs.color until that job is changed', () => {
  it('reads the written column — a child with no color inherits; a changed child keeps its own', () => {
    const family = [
      { id: 'parent', parent_job_id: null, color: '#F7931A', title: 'Switchboard' },
      { id: 'child-a', parent_job_id: 'parent', color: null, title: 'Testing' },
      { id: 'child-b', parent_job_id: 'parent', color: '#7C3AED', title: 'Fit off' },
    ];
    expect(weekBoardChipColor(family[0], family)).toBe('#F7931A');
    expect(weekBoardChipColor(family[1], family)).toBe('#F7931A');
    expect(weekBoardChipColor(family[2], family)).toBe('#7C3AED');
    expect(pickJobColor('parent', jobColorToStore('#F7931A'))).toBe('#F7931A');
    expect(pickJobColor('child-a', jobColorToStore(null))).toBe(pickJobColor('child-a'));
  });
});
