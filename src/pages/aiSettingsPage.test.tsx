/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSettingsPage } from './AiSettingsPage';

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

vi.mock('../components/admin/StorageAnalytics', () => ({
  StorageAnalytics: () => null,
}));

vi.mock('../lib/aiSettingsClient', () => ({
  fetchAiSettings: async () => ({ keySet: false, model: 'claude-opus-4-7' }),
  postAiSettings: async () => ({ ok: true }),
}));

const auth = vi.hoisted(() => ({
  isPlatformOperator: false,
  role: 'admin',
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { role: auth.role, name: 'User' },
    isPlatformOperator: auth.isPlatformOperator,
    session: null,
  }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  auth.isPlatformOperator = false;
  auth.role = 'admin';
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SWEEP-AI settings UI', () => {
  it('M45 customer admin sees Coming soon and no key entry', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AiSettingsPage />
        </MemoryRouter>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const text = container.textContent ?? '';
    expect(text).toContain('Coming soon');
    expect(text).not.toContain('Add key');
    expect(text).not.toContain('Replace');
    expect(text).not.toContain('sk-ant');
    expect(text).not.toContain('last4');
    expect(text).not.toContain('Admin Console Tools');
    expect(container.querySelector('[data-ai-settings="coming-soon"]')).not.toBeNull();
  });

  it('operator who is not a company admin can see key entry and never last-4', async () => {
    auth.isPlatformOperator = true;
    auth.role = 'inspector';
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AiSettingsPage />
        </MemoryRouter>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const text = container.textContent ?? '';
    expect(text).toContain('AI Settings');
    expect(text).toContain('Add key');
    expect(text).not.toContain('last4');
    expect(text).not.toContain('abcd');
  });
});
