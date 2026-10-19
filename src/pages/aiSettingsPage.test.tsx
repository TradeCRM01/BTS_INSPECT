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

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { role: 'admin', name: 'Customer Admin' },
    isPlatformOperator: false,
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
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SWEEP-AI settings UI', () => {
  it('does not show a modify toggle to a customer admin', async () => {
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
    expect(text).toContain('The assistant can look up this company');
    expect(text).not.toContain('Admin Console Tools');
    expect(text).not.toContain('query and modify');
    expect(text).not.toContain('Can modify data');
    expect(text).not.toContain('admin_tools_enabled');
    expect(container.querySelector('[data-ai-settings="1"]')).not.toBeNull();
  });
});
