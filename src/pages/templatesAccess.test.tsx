/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memberCanViewTemplates } from '../lib/fieldValidation';
import { TemplatesAccessGate } from '../lib/TemplatesAccessGate';

const harness = vi.hoisted(() => ({
  profile: {
    id: 'm1',
    role: 'member' as string,
    template_access: 'none' as string,
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: harness.profile }),
}));

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.profile = { id: 'm1', role: 'member', template_access: 'none' };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Templates no access', () => {
  it('renders as a no-access member and keeps templates hidden', async () => {
    expect(memberCanViewTemplates(harness.profile)).toBe(false);
    await act(async () => {
      root.render(
        <TemplatesAccessGate>
          <div>TEMPLATES OPEN</div>
        </TemplatesAccessGate>,
      );
    });
    expect(container.textContent).toContain('No template access');
    expect(container.textContent).not.toContain('TEMPLATES OPEN');
    expect(container.querySelector('a[href="/templates/new"]')).toBeNull();
  });
});
