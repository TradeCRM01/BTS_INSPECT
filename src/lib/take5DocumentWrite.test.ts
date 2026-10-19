import { describe, expect, it } from 'vitest';
import { take5SaveRow, type Take5WritePayload } from './take5DocumentWrite';

const COMPANY = '00000000-0000-4000-8000-0000000000bb';
const JHA = '00000000-0000-4000-8000-0000000000dd';
const ROW = '00000000-0000-4000-8000-0000000000cc';

const payload: Take5WritePayload = {
  company_id: COMPANY,
  jha_document_id: JHA,
  created_by: '00000000-0000-4000-8000-0000000000aa',
  status: 'draft',
  meta: { location: 'Board 4' },
  stop_think: 'Isolate',
  identify_hazards: 'Live',
  assess_risk: 'High',
  control_actions: 'Lock out',
  go_no_go: 'go',
  signed_name: 'Jane Spark',
  signature: 'data:image/png;base64,take5sig',
  signed_at: null,
  updated_at: '2026-10-19T09:00:00.000Z',
};

describe('take5 save row', () => {
  it('keeps company_id and jha_document_id values on first, second, and list-opened saves', () => {
    const first = take5SaveRow(ROW, payload);
    expect(first.company_id).toBe(COMPANY);
    expect(first.jha_document_id).toBe(JHA);

    const second = take5SaveRow(ROW, {
      ...payload,
      meta: { location: 'Board 4 face' },
      signature: 'data:image/png;base64,take5sig2',
      updated_at: '2026-10-19T09:01:00.000Z',
    });
    expect(second.company_id).toBe(COMPANY);
    expect(second.jha_document_id).toBe(JHA);

    const listed = take5SaveRow(ROW, {
      ...payload,
      meta: { location: 'From list' },
      updated_at: '2026-10-19T09:02:00.000Z',
    });
    expect(listed.company_id).toBe(COMPANY);
    expect(listed.jha_document_id).toBe(JHA);
  });
});
