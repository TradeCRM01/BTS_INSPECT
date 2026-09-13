import { describe, expect, it } from 'vitest';
import { canOfferInstallPrompt } from './installPrompt';

describe('canOfferInstallPrompt', () => {
  it('is allowed only on the dashboard and only if not dismissed', () => {
    expect(canOfferInstallPrompt('/', false)).toBe(true);
    expect(canOfferInstallPrompt('/', true)).toBe(false);
  });

  it('never covers jobs, schedule or field pages', () => {
    expect(canOfferInstallPrompt('/jobs', false)).toBe(false);
    expect(canOfferInstallPrompt('/schedule', false)).toBe(false);
    expect(canOfferInstallPrompt('/inspections', false)).toBe(false);
    expect(canOfferInstallPrompt('/settings', false)).toBe(false);
  });
});
