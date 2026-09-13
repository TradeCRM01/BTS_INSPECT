import { describe, expect, it } from 'vitest';
import {
  canOfferInstallPrompt,
  dismissInstallPrompt,
  isInstallDismissed,
  shouldShowInstallBanner,
} from './installPrompt';

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => { data[key] = value; },
  };
}

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

describe('controlled beforeinstallprompt', () => {
  it('shows on the dashboard after a mock install event, then stays gone after dismiss', () => {
    const store = memoryStore();
    const event = new Event('beforeinstallprompt');
    expect(shouldShowInstallBanner('/', store, event, false)).toBe(true);
    expect(shouldShowInstallBanner('/jobs', store, event, false)).toBe(false);
    dismissInstallPrompt(store);
    expect(isInstallDismissed(store)).toBe(true);
    expect(shouldShowInstallBanner('/', store, event, false)).toBe(false);
  });

  it('does not show when the browser never fired a prompt and this is not iOS', () => {
    expect(shouldShowInstallBanner('/', memoryStore(), null, false)).toBe(false);
  });
});
