import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchClientPortal,
  fetchClientPortalWithRetry,
  portalErrorCard,
  PortalLoadError,
  shouldRetryPortalQuery,
} from './clientPortalFetch';

const GENERIC = 'Edge Function returned a non-2xx status code';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function httpError(status: number, body: unknown, message = GENERIC): {
  message: string;
  context: Response;
} {
  return {
    message,
    context: new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}

describe('client portal token errors', () => {
  it('reads Link expired from FunctionsHttpError.context instead of the generic non-2xx message', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: httpError(403, { error: 'Link expired' }),
    });
    await expect(fetchClientPortal(invoke, 'tok')).rejects.toMatchObject({
      name: 'PortalLoadError',
      message: 'Link expired',
      kind: 'expired',
      status: 403,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    const card = portalErrorCard(new PortalLoadError('Link expired', { status: 403, kind: 'expired' }));
    expect(card).toMatchObject({
      kind: 'expired',
      title: 'Link expired',
      retry: false,
    });
    expect(card.body).not.toContain(GENERIC);
  });

  it('shows revoked and invalid cards from the function error body', async () => {
    const revoked = vi.fn().mockResolvedValue({
      data: null,
      error: httpError(403, { error: 'Link revoked' }),
    });
    await expect(fetchClientPortal(revoked, 'tok')).rejects.toMatchObject({
      message: 'Link revoked',
      kind: 'revoked',
    });
    const invalid = vi.fn().mockResolvedValue({
      data: null,
      error: httpError(404, { error: 'Invalid link' }),
    });
    await expect(fetchClientPortal(invalid, 'tok')).rejects.toMatchObject({
      message: 'Invalid link',
      kind: 'invalid',
    });
    expect(portalErrorCard(new PortalLoadError('Link revoked', { status: 403, kind: 'revoked' })).title)
      .toBe('Link revoked');
    expect(portalErrorCard(new PortalLoadError('Invalid link', { status: 404, kind: 'invalid' })).title)
      .toBe('Invalid link');
  });

  it('does not retry a 4xx portal invoke, exactly one call', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: httpError(403, { error: 'Link expired' }),
    });
    await expect(fetchClientPortalWithRetry(invoke, 'tok')).rejects.toBeInstanceOf(PortalLoadError);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(shouldRetryPortalQuery(0, new PortalLoadError('Link expired', { status: 403, kind: 'expired' })))
      .toBe(false);
  });

  it('retries once for a 5xx portal invoke, not for a 4xx', async () => {
    const invoke5xx = vi.fn().mockResolvedValue({
      data: null,
      error: httpError(500, { error: 'Portal error' }),
    });
    await expect(fetchClientPortalWithRetry(invoke5xx, 'tok')).rejects.toMatchObject({ status: 500 });
    expect(invoke5xx).toHaveBeenCalledTimes(2);

    const invoke4xx = vi.fn().mockResolvedValue({
      data: null,
      error: httpError(403, { error: 'Link expired' }),
    });
    await expect(fetchClientPortalWithRetry(invoke4xx, 'tok')).rejects.toMatchObject({ kind: 'expired' });
    expect(invoke4xx).toHaveBeenCalledTimes(1);
  });

  it('wires the page to the error-body read and the 4xx-safe retry', () => {
    const page = src('src/pages/ClientPortalPublicPage.tsx');
    expect(page).toContain('fetchClientPortal');
    expect(page).toContain('shouldRetryPortalQuery');
    expect(page).toContain('portalErrorCard');
    expect(page).toContain('data-portal-error');
    expect(page).not.toMatch(/retry:\s*1/);
    expect(page).not.toContain("throw new Error(error.message || 'Could not load portal')");
  });
});
