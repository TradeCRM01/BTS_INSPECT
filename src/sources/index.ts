import { isDemo, type Env } from '../env';
import { shiftKey } from '../time';
import type { DateKey, Signals, SourceResult } from '../types';
import { fetchCalendar } from './calendar';
import { demoSignals } from './demo';
import { fetchWaiting } from './gmail';
import { googleAccessToken } from './google';
import { fetchGrafterYesterday } from './grafter';

/**
 * Every source is wrapped so one failing cannot stop the paper.
 * The editor prints a one-line "did not answer" for it instead.
 */
export async function gatherSignals(env: Env, today: DateKey): Promise<Signals> {
  if (isDemo(env)) return demoSignals(today, env.PAPER_TZ);

  const google = lazyToken(env);
  const [calendar, mail, grafter] = await Promise.all([
    attempt(async () => fetchCalendar(await google(), today, env.PAPER_TZ)),
    attempt(async () => fetchWaiting(await google(), env.MAIL_ME ?? '')),
    attempt(async () => {
      if (!env.GRAFTER_SUPABASE_URL || !env.GRAFTER_SERVICE_KEY) throw new Error('Grafter credentials are not set.');
      return fetchGrafterYesterday(env.GRAFTER_SUPABASE_URL, env.GRAFTER_SERVICE_KEY, shiftKey(today, -1), env.PAPER_TZ);
    }),
  ]);
  return { calendar, mail, grafter };
}

function lazyToken(env: Env): () => Promise<string> {
  let pending: Promise<string> | null = null;
  return () => (pending ??= googleAccessToken(env));
}

export async function attempt<T>(fn: () => Promise<T>): Promise<SourceResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
