import { describe, expect, it } from 'vitest';
import {
  assertJhaDocumentInsertColumns,
  jhaPersistStatus,
  planJhaDocumentWrite,
} from './jhaDocumentWrite';

const payload = {
  meta: { siteName: 'Plant A' },
  steps: [],
  ppe: [],
  sign_offs: [],
  status: 'draft' as const,
  client_id: null,
  job_id: null,
  doc_version: 1,
  amended_from_id: null,
  amendment_reason: null,
};

describe('jha document write plan', () => {
  it('inserts the first row with the client id and required columns', () => {
    const plan = planJhaDocumentWrite({
      persistedId: null,
      clientDraftId: '11111111-1111-4111-8111-111111111111',
      templateId: 'tmpl-1',
      templateName: 'Iso',
      schema: { meta: {} },
      companyId: 'co-1',
      createdBy: 'user-1',
      payload,
    });
    expect(plan.op).toBe('insert');
    expect(plan.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(plan.row.id).toBe(plan.id);
    expect(plan.row.template_id).toBe('tmpl-1');
    expect(plan.row.company_id).toBe('co-1');
    expect(plan.row.created_by).toBe('user-1');
    expect(() => assertJhaDocumentInsertColumns(plan.row)).not.toThrow();
  });

  it('updates an existing id without re-sending insert-only columns', () => {
    const plan = planJhaDocumentWrite({
      persistedId: '11111111-1111-4111-8111-111111111111',
      clientDraftId: '11111111-1111-4111-8111-111111111111',
      templateId: null,
      templateName: 'Iso',
      schema: { meta: {} },
      companyId: 'co-1',
      createdBy: 'user-1',
      payload: { ...payload, meta: { siteName: 'Plant B' }, status: 'draft' },
    });
    expect(plan.op).toBe('update');
    expect(plan.row.template_id).toBeUndefined();
    expect(plan.row.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(plan.row.meta).toEqual({ siteName: 'Plant B' });
  });

  it('keeps a completed document completed', () => {
    expect(jhaPersistStatus('draft', 'completed')).toBe('completed');
    expect(jhaPersistStatus('draft', 'published')).toBe('published');
    expect(jhaPersistStatus('draft', 'draft')).toBe('draft');
  });
});
