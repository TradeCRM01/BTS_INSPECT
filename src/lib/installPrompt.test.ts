import { describe, expect, it } from 'vitest';
import {
  canOfferInstallPrompt,
  dismissInstallPrompt,
  installPromptVisibleAfter,
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

describe('install prompt session — controlled event, dismiss, navigate, reload', () => {
  it('stays hidden until a controlled event is revealed, then never covers jobs or the field path', () => {
    const store = memoryStore();
    const event = new Event('beforeinstallprompt');
    expect(installPromptVisibleAfter('/', store, { event: null, iosSafari: false, revealed: false })).toBe(false);
    expect(installPromptVisibleAfter('/', store, { event, iosSafari: false, revealed: false })).toBe(false);
    expect(installPromptVisibleAfter('/', store, { event, iosSafari: false, revealed: true })).toBe(true);
    expect(installPromptVisibleAfter('/jobs', store, { event, iosSafari: false, revealed: true })).toBe(false);
    expect(installPromptVisibleAfter('/schedule', store, { event, iosSafari: false, revealed: true })).toBe(false);
    expect(installPromptVisibleAfter('/inspections', store, { event, iosSafari: false, revealed: true })).toBe(false);
    expect(installPromptVisibleAfter('/jobs/a7c8d630-e6bf-4222-b11d-7a05d9797e0f', store, {
      event,
      iosSafari: false,
      revealed: true,
    })).toBe(false);
  });

  it('does not come back after dismiss, navigation, or a reload that still has the event', () => {
    const store = memoryStore();
    const event = new Event('beforeinstallprompt');
    expect(installPromptVisibleAfter('/', store, { event, iosSafari: false, revealed: true })).toBe(true);
    dismissInstallPrompt(store);
    expect(installPromptVisibleAfter('/', store, { event, iosSafari: false, revealed: true })).toBe(false);
    expect(installPromptVisibleAfter('/jobs', store, { event, iosSafari: false, revealed: true })).toBe(false);
    expect(installPromptVisibleAfter('/', store, { event, iosSafari: false, revealed: true })).toBe(false);
  });
});
