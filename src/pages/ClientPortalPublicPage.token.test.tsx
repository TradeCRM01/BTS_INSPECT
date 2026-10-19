/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FunctionsClient } from '@supabase/functions-js';

const h = vi.hoisted(() => ({ impl: null as null | (() => Promise<Response>), calls: 0 }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: new FunctionsClient('https://example.supabase.co/functions/v1', {
      customFetch: async () => {
        h.calls += 1;
        return h.impl!();
      },
    }),
  },
}));

import { ClientPortalPublicPage } from './ClientPortalPublicPage';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  h.calls = 0;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const jsonRes = (status: number, body: unknown) => () =>
  Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));

async function renderWith(impl: () => Promise<Response>, waitMs: number) {
  h.impl = impl;
  const qc = new QueryClient({
    defaultOptions: { queries: { retryDelay: 1 } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/p?t=fake-token-not-real']}>
          <ClientPortalPublicPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, waitMs));
  });
  const card = container.querySelector('[data-portal-error]');
  return {
    kind: card?.getAttribute('data-portal-error') ?? null,
    title: container.querySelector('.portal-state-title')?.textContent ?? null,
    text: container.textContent ?? '',
    tryAgain: [...container.querySelectorAll('button')].some((b) => b.textContent === 'Try again'),
    calls: h.calls,
  };
}

describe('/p token error cards on the real page', () => {
  it('403 Link expired shows the expired card and makes exactly 1 edge call', async () => {
    const r = await renderWith(jsonRes(403, { error: 'Link expired' }), 800);
    expect(r).toMatchObject({ kind: 'expired', title: 'Link expired', tryAgain: false, calls: 1 });
    expect(r.text).not.toContain('non-2xx');
  });

  it('403 Link revoked shows the revoked card and makes exactly 1 edge call', async () => {
    const r = await renderWith(jsonRes(403, { error: 'Link revoked' }), 800);
    expect(r).toMatchObject({ kind: 'revoked', title: 'Link revoked', tryAgain: false, calls: 1 });
  });

  it('404 Invalid link shows the invalid card and makes exactly 1 edge call', async () => {
    const r = await renderWith(jsonRes(404, { error: 'Invalid link' }), 800);
    expect(r).toMatchObject({ kind: 'invalid', title: 'Invalid link', tryAgain: false, calls: 1 });
  });

  it('403 Invalid link shows the invalid card and makes exactly 1 edge call', async () => {
    const r = await renderWith(jsonRes(403, { error: 'Invalid link' }), 800);
    expect(r).toMatchObject({ kind: 'invalid', title: 'Invalid link', calls: 1 });
  });

  it('500 is retried once (2 calls) and shows Try again', async () => {
    const r = await renderWith(jsonRes(500, { error: 'Portal error' }), 800);
    expect(r).toMatchObject({ kind: 'error', title: 'Unable to open portal', tryAgain: true, calls: 2 });
  });

  it('network failure is retried once (2 calls) and shows Try again', async () => {
    const r = await renderWith(() => Promise.reject(new TypeError('Failed to fetch')), 800);
    expect(r).toMatchObject({ kind: 'error', title: 'Unable to open portal', tryAgain: true, calls: 2 });
  });

  it('400 token required is not retried (1 call)', async () => {
    const r = await renderWith(jsonRes(400, { error: 'token required' }), 800);
    expect(r).toMatchObject({ kind: 'error', tryAgain: false, calls: 1 });
  });
});
