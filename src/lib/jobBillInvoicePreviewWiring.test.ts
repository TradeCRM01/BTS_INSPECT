import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const jobDetail = readFileSync(resolve(process.cwd(), 'src/pages/JobDetailPage.tsx'), 'utf8');
const costingPanel = readFileSync(resolve(process.cwd(), 'src/components/jobs/JobCostingPanel.tsx'), 'utf8');

describe('job bill invoice preview query wiring', () => {
  it('JobDetailPage uses shared preview key helper and staleTime 0', () => {
    expect(jobDetail).toContain('jobBillInvoicePreviewQueryKeyWithDims');
    expect(jobDetail).toMatch(/staleTime:\s*0/);
    expect(jobDetail).toContain('placeholderData: keepPreviousData');
    expect(jobDetail).not.toMatch(/queryKey:\s*\['job-bill-invoice-preview'/);
  });

  it('JobCostingPanel uses shared preview key helper and staleTime 0', () => {
    expect(costingPanel).toContain('jobBillInvoicePreviewQueryKeyWithDims');
    expect(costingPanel).toMatch(/staleTime:\s*0/);
    expect(costingPanel).not.toMatch(/queryKey:\s*\['job-bill-invoice-preview'/);
  });
});
