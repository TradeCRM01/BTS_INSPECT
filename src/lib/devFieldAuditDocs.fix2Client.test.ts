import { describe, expect, it, vi } from 'vitest';

vi.mock('./devFieldAuditAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./devFieldAuditAuth')>();
  return {
    ...actual,
    isDevFieldAuditAuth: () => true,
  };
});

import {
  AUDIT_FIX2_CLIENT_ID,
  getAuditClientsForInvoiceEditor,
  getAuditFix2Client,
} from './devFieldAuditDocs';

describe('getAuditClientsForInvoiceEditor', () => {
  it('includes the fix2 Brisbane client for invoice TO lookup', () => {
    const list = getAuditClientsForInvoiceEditor();
    expect(list).not.toBeNull();
    const fix2 = list!.find(c => c.id === AUDIT_FIX2_CLIENT_ID);
    expect(fix2?.name).toBe(getAuditFix2Client().name);
    expect(fix2?.address).toContain('Brisbane');
  });
});
