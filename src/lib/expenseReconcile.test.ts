import { describe, expect, it } from 'vitest';
import { expenseNeedsJobReconcile } from './expenseReconcile';

describe('expenseNeedsJobReconcile', () => {
  it('flags recorded COGS on a job and ignores overhead or drafts', () => {
    expect(expenseNeedsJobReconcile({ cost_class: 'cogs', job_id: 'j1', status: 'recorded' })).toBe(true);
    expect(expenseNeedsJobReconcile({ cost_class: 'cogs', job_id: 'j1', status: 'draft' })).toBe(false);
    expect(expenseNeedsJobReconcile({ cost_class: 'overhead', job_id: 'j1', status: 'paid' })).toBe(false);
    expect(expenseNeedsJobReconcile({ cost_class: 'cogs', job_id: null, status: 'paid' })).toBe(false);
  });
});
