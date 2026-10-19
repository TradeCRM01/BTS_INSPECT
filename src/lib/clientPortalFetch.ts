export type PortalTokenKind = 'expired' | 'revoked' | 'invalid';
export type PortalLoadKind = PortalTokenKind | 'http' | 'network';

export class PortalLoadError extends Error {
  readonly status: number | null;
  readonly kind: PortalLoadKind;

  constructor(message: string, opts: { status: number | null; kind: PortalLoadKind }) {
    super(message);
    this.name = 'PortalLoadError';
    this.status = opts.status;
    this.kind = opts.kind;
  }
}

export type PortalInvokeError = {
  message?: string;
  context?: unknown;
};

export type PortalInvoke = (
  name: string,
  init: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: PortalInvokeError | null }>;

export async function readPortalFunctionError(
  error: PortalInvokeError,
): Promise<{ status: number | null; bodyError: string | null }> {
  const ctx = error.context;
  let status: number | null = null;
  let bodyError: string | null = null;
  if (ctx && typeof ctx === 'object') {
    if ('status' in ctx && typeof (ctx as { status: unknown }).status === 'number') {
      status = (ctx as { status: number }).status;
    }
    if ('json' in ctx && typeof (ctx as { json?: unknown }).json === 'function') {
      try {
        const body = await (ctx as Response).json() as { error?: unknown };
        if (typeof body?.error === 'string' && body.error.trim()) {
          bodyError = body.error.trim();
        }
      } catch {
        bodyError = null;
      }
    }
  }
  return { status, bodyError };
}

export function portalTokenKindFromBody(bodyError: string | null): PortalTokenKind | null {
  if (bodyError === 'Link expired') return 'expired';
  if (bodyError === 'Link revoked') return 'revoked';
  if (bodyError === 'Invalid link') return 'invalid';
  return null;
}

export function classifyPortalLoadError(
  status: number | null,
  bodyError: string | null,
  fallbackMessage: string,
): PortalLoadError {
  const tokenKind = portalTokenKindFromBody(bodyError);
  const message = bodyError || fallbackMessage || 'Could not load portal';
  if (tokenKind) return new PortalLoadError(message, { status, kind: tokenKind });
  if (status == null) return new PortalLoadError(message, { status, kind: 'network' });
  return new PortalLoadError(message, { status, kind: 'http' });
}

export function shouldRetryPortalQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (!(error instanceof PortalLoadError)) return true;
  if (error.kind === 'network') return true;
  if (error.status != null && error.status >= 500) return true;
  return false;
}

export async function fetchClientPortal<T>(invoke: PortalInvoke, token: string): Promise<T> {
  const { data, error } = await invoke('client-portal', { body: { token } });
  if (error) {
    const read = await readPortalFunctionError(error);
    throw classifyPortalLoadError(
      read.status,
      read.bodyError,
      error.message || 'Could not load portal',
    );
  }
  if (data && typeof data === 'object' && 'error' in data) {
    const bodyError = String((data as { error?: unknown }).error ?? '').trim();
    if (bodyError) {
      throw classifyPortalLoadError(200, bodyError, bodyError);
    }
  }
  return data as T;
}

export type PortalErrorCard = {
  kind: PortalTokenKind | 'error';
  title: string;
  body: string;
  retry: boolean;
};

export function portalErrorCard(error: unknown): PortalErrorCard {
  if (error instanceof PortalLoadError) {
    if (error.kind === 'expired') {
      return {
        kind: 'expired',
        title: 'Link expired',
        body: 'This portal link has expired. Ask the contractor for a new one.',
        retry: false,
      };
    }
    if (error.kind === 'revoked') {
      return {
        kind: 'revoked',
        title: 'Link revoked',
        body: 'This portal link is no longer active. Ask the contractor for a new one.',
        retry: false,
      };
    }
    if (error.kind === 'invalid') {
      return {
        kind: 'invalid',
        title: 'Invalid link',
        body: 'This portal link is not valid. Check you opened the full link you were sent.',
        retry: false,
      };
    }
    return {
      kind: 'error',
      title: 'Unable to open portal',
      body: error.message || 'Could not load portal',
      retry: shouldRetryPortalQuery(0, error),
    };
  }
  return {
    kind: 'error',
    title: 'Unable to open portal',
    body: error instanceof Error ? error.message : 'Invalid or expired link',
    retry: true,
  };
}

export async function fetchClientPortalWithRetry<T>(
  invoke: PortalInvoke,
  token: string,
): Promise<T> {
  let failureCount = 0;
  for (;;) {
    try {
      return await fetchClientPortal<T>(invoke, token);
    } catch (error) {
      if (!shouldRetryPortalQuery(failureCount, error)) throw error;
      failureCount += 1;
    }
  }
}
