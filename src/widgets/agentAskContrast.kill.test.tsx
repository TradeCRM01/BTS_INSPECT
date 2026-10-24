/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contrastRatio } from '../lib/contrastRatio';
import { AiAgentWidget } from './IntelligenceWidgets';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { access_token: 't' },
    isPlatformOperator: true,
  }),
}));
vi.mock('../lib/useCompanyAiKey', () => ({
  useCompanyAiKey: () => ({ ready: true, hasKey: true }),
}));

const productCss = `
:root { --g-ink: #0A0A0B; --g-ink-muted: #3F3F46; --g-surface: #FFFFFF; }
.agent-ask-input { color: var(--g-ink); background: var(--g-surface); }
.agent-ask-input::placeholder { color: var(--g-ink-muted); opacity: 1; }
`;

let container: HTMLDivElement;
let root: Root;
let style: HTMLStyleElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  style = document.createElement('style');
  style.textContent = productCss;
  document.head.appendChild(style);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  style.remove();
});

describe('Ask the agent placeholder', () => {
  it('kills a placeholder under 4.5:1', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <AiAgentWidget config={{}} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    const input = container.querySelector('input[placeholder="Ask the agent…"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.classList.contains('agent-ask-input')).toBe(true);
    const probe = document.createElement('span');
    probe.className = 'agent-ask-input';
    probe.textContent = 'Ask the agent…';
    document.body.appendChild(probe);
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--g-ink-muted').trim() || '#3F3F46';
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--g-surface').trim() || '#FFFFFF';
    probe.remove();
    expect(contrastRatio(fg, bg), `placeholder ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});
