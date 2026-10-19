import { describe, expect, it } from 'vitest';
import {
  TAKE5_INSERT_REQUIRED_COLUMNS,
  TAKE5_NOT_NULL_COLUMNS,
  assertTake5InsertColumns,
  take5SaveRow,
} from './take5DocumentWrite';

const payload = {
  company_id: 'co-1',
  jha_document_id: 'jha-1',
  created_by: 'user-1',
  status: 'draft' as const,
  meta: { location: 'Board 4' },
  stop_think: 'Isolate',
  identify_hazards: 'Live',
  assess_risk: 'High',
  control_actions: 'Lock out',
  go_no_go: 'go' as const,
  signed_name: 'Jane Spark',
  signature: 'data:image/png;base64,take5sig',
  signed_at: null,
  updated_at: '2026-10-19T09:00:00.000Z',
};

describe('take5 save row', () => {
  it('sends the same keys on first save and second save', () => {
    const first = take5SaveRow('11111111-1111-4111-8111-111111111111', payload);
    const second = take5SaveRow('11111111-1111-4111-8111-111111111111', {
      ...payload,
      meta: { location: 'Board 4 face' },
      signature: 'data:image/png;base64,take5sig2',
    });
    expect(Object.keys(first)).toEqual(Object.keys(second));
    expect(first.company_id).toBe('co-1');
    expect(first.jha_document_id).toBe('jha-1');
    expect(second.meta).toEqual({ location: 'Board 4 face' });
    expect(() => assertTake5InsertColumns(second)).not.toThrow();
    expect(TAKE5_INSERT_REQUIRED_COLUMNS).toEqual(['company_id', 'jha_document_id']);
    expect(TAKE5_NOT_NULL_COLUMNS).toContain('company_id');
    expect(TAKE5_NOT_NULL_COLUMNS).toContain('jha_document_id');
  });
});
