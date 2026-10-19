import { describe, expect, it } from 'vitest';
import { crewSignConfirmCopy, safetySignOffLine } from './safetySignOff';

describe('safetySignOffLine', () => {
  it('keeps the signer name on the sign-off line', () => {
    expect(safetySignOffLine({ name: 'Pat Lee', when: '19 Oct 2026' })).toBe('Signed Pat Lee · 19 Oct 2026');
    expect(safetySignOffLine({ name: 'Pat Lee', when: null })).toBe('Signed Pat Lee');
  });
});

describe('crewSignConfirmCopy', () => {
  it('puts the confirm date on the thank-you line', () => {
    const stamp = '2026-10-19T09:21:00.000Z';
    const copy = crewSignConfirmCopy(stamp);
    expect(copy).toMatch(/^Signed \d{1,2} [A-Z][a-z]{2} 2026 \d{2}:\d{2}\. Thank you\.$/);
    expect(copy).not.toBe('Signed . Thank you.');
    expect(copy).toContain(String(new Date(stamp).getFullYear()));
    expect(crewSignConfirmCopy(null)).toBe('Signed. Thank you.');
  });
});
