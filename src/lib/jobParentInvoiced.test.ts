import { describe, expect, it } from 'vitest';
import {
  JOB_PARENT_INVOICED_COLUMNS,
  JOB_PARENT_INVOICED_SELECT,
  jobParentInvoicedEnabled,
  jobParentInvoicedQueryKey,
  loadParentInvoiced,
} from './jobParentInvoiced';

describe('Q-J1 parent invoiced', () => {
  it('runs only for a completed child visit', () => {
    expect(jobParentInvoicedEnabled({ status: 'completed', parent_job_id: 'p1' })).toBe(true);
    expect(jobParentInvoicedEnabled({ status: 'scheduled', parent_job_id: 'p1' })).toBe(false);
    expect(jobParentInvoicedEnabled({ status: 'completed', parent_job_id: null })).toBe(false);
    expect(jobParentInvoicedQueryKey('p1')).toEqual(['job-parent-invoiced', 'p1']);
  });

  it('records company_id, parent job_id, and neq void', async () => {
    const filters: string[] = [];
    const client = {
      from(table: string) {
        expect(table).toBe('invoices');
        return {
          select(columns: string) {
            expect(columns).toBe(JOB_PARENT_INVOICED_SELECT);
            return {
              eq(column: string, value: string) {
                filters.push(`${column}=${value}`);
                return this;
              },
              neq(column: string, value: string) {
                filters.push(`${column}<>${value}`);
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      },
    };
    await loadParentInvoiced({ companyId: 'co-1', parentJobId: 'parent-9' }, client);
    expect(filters).toEqual(['company_id=co-1', 'job_id=parent-9', 'status<>void']);
    expect([...JOB_PARENT_INVOICED_COLUMNS]).toEqual(['id', 'job_id', 'status']);
    expect(JOB_PARENT_INVOICED_COLUMNS).not.toContain('paid_at');
  });
});
