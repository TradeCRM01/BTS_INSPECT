import { afterEach, describe, expect, it, vi } from 'vitest';
import { TICK_TIMEOUT_MS } from './edgeTick';

const SUPABASE_URL = 'https://example.supabase.co';
const SECRET = 'tick-secret-value-do-not-log';

type Scheduled = (controller: unknown, env: Record<string, string | undefined>) => Promise<void>;

function loggedText(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls
    .map((args) => args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
    .join('\n');
}

export function describeTickWorker(options: {
  title: string;
  scheduled: Scheduled;
  functionName: string;
  secretName: string;
}): void {
  describe(options.title, () => {
    const env = {
      SUPABASE_URL,
      [options.secretName]: SECRET,
    };

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    function spyError() {
      return vi.spyOn(console, 'error').mockImplementation(() => {});
    }

    function expectSecretHidden(spy: ReturnType<typeof spyError>) {
      const text = loggedText(spy);
      expect(text).not.toContain(SECRET);
      expect(text).not.toMatch(/authorization\s*[:=]/i);
      expect(text).not.toContain(`Bearer ${SECRET}`);
    }

    it('POSTs to the edge function and stays quiet on 2xx', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const errorSpy = spyError();

      await options.scheduled({}, env);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${SUPABASE_URL}/functions/v1/${options.functionName}`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ Authorization: `Bearer ${SECRET}` });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs status on 401 without the secret', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 401 })));
      const errorSpy = spyError();

      await options.scheduled({}, env);

      expect(errorSpy).toHaveBeenCalled();
      expect(loggedText(errorSpy)).toContain('401');
      expectSecretHidden(errorSpy);
    });

    it('logs status on 5xx without the secret', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('fail', { status: 500 })));
      const errorSpy = spyError();

      await options.scheduled({}, env);

      expect(errorSpy).toHaveBeenCalled();
      expect(loggedText(errorSpy)).toContain('500');
      expectSecretHidden(errorSpy);
    });

    it('logs a network error without the secret', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
      const errorSpy = spyError();

      await options.scheduled({}, env);

      expect(errorSpy).toHaveBeenCalled();
      expect(loggedText(errorSpy)).toMatch(/fetch failed/);
      expectSecretHidden(errorSpy);
    });

    it('aborts on timeout and logs without the secret', async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) {
              reject(new Error('missing abort signal'));
              return;
            }
            const fail = () => {
              const error = new Error('The operation was aborted.');
              error.name = 'AbortError';
              reject(error);
            };
            if (signal.aborted) fail();
            else signal.addEventListener('abort', fail, { once: true });
          });
        }),
      );
      const errorSpy = spyError();

      const pending = options.scheduled({}, env);
      await vi.advanceTimersByTimeAsync(TICK_TIMEOUT_MS);
      await pending;

      expect(errorSpy).toHaveBeenCalled();
      expect(loggedText(errorSpy)).toContain('AbortError');
      expectSecretHidden(errorSpy);
    });

    it('never logs the worker secret or Authorization header', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error(`Authorization: Bearer ${SECRET} leaked`)),
      );
      const errorSpy = spyError();

      await options.scheduled({}, env);

      expect(errorSpy).toHaveBeenCalled();
      expectSecretHidden(errorSpy);
      expect(loggedText(errorSpy)).not.toContain(SECRET);
    });
  });
}
