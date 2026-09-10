import { compose } from './editor';
import { isDemo, noonHour, type Env } from './env';
import { sendMail } from './mail';
import { renderHtml, renderOneThingForm, renderText, shell, subject } from './render';
import { gatherSignals } from './sources';
import { answer, loadLatestEdition, loadState, prune, saveEdition, saveState, setOneThing } from './state';
import { dateKey, headingDate, localParts } from './time';
import type { Edition, EditionKind } from './types';

const COOKIE = 'paper';

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = new Date(event.scheduledTime);
    const kind = editionFor(now, env);
    ctx.waitUntil(runEdition(env, kind, now, { send: true }));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');

    const gate = authorise(request, url, env);
    if (gate) return gate;

    const now = new Date();
    const today = dateKey(now, env.PAPER_TZ);

    try {
      if (url.pathname === '/' && request.method === 'GET') {
        let edition = await loadLatestEdition(env.PAPER);
        if (!edition || edition.dateKey !== today) {
          edition = await runEdition(env, editionFor(now, env), now, { send: false });
        }
        return html(renderHtml(edition, { baseUrl: env.PAPER_URL }));
      }

      if (url.pathname === '/text' && request.method === 'GET') {
        const edition = (await loadLatestEdition(env.PAPER)) ?? (await runEdition(env, editionFor(now, env), now, { send: false }));
        return new Response(renderText(edition, { baseUrl: env.PAPER_URL }), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }

      if (url.pathname === '/answer' && request.method === 'GET') {
        const d = url.searchParams.get('d');
        const date = url.searchParams.get('date') ?? today;
        if ((d !== 'done' && d !== 'missed') || !isKey(date)) return new Response('Bad answer', { status: 400 });
        const state = answer(await loadState(env.PAPER), date, d);
        await saveState(env.PAPER, prune(state, today));
        await refreshEdition(env, now);
        return redirect('/');
      }

      if (url.pathname === '/one-thing' && request.method === 'GET') {
        const date = url.searchParams.get('date') ?? today;
        if (!isKey(date)) return new Response('Bad date', { status: 400 });
        const state = await loadState(env.PAPER);
        return html(renderOneThingForm(date, headingDate(date, env.PAPER_TZ), state.oneThing[date] ?? null));
      }

      if (url.pathname === '/one-thing' && request.method === 'POST') {
        const form = await request.formData();
        const date = String(form.get('date') ?? today);
        const text = String(form.get('text') ?? '');
        if (!isKey(date)) return new Response('Bad date', { status: 400 });
        const state = setOneThing(await loadState(env.PAPER), date, text);
        await saveState(env.PAPER, prune(state, today));
        await refreshEdition(env, now);
        return redirect('/');
      }

      if (url.pathname === '/run' && request.method === 'GET') {
        const kind = kindParam(url) ?? editionFor(now, env);
        const edition = await runEdition(env, kind, now, { send: true });
        return new Response(`${kind} edition composed for ${edition.dateKey}. ${mailNote(env)}`, { headers: { 'content-type': 'text/plain' } });
      }

      if (url.pathname === '/preview' && request.method === 'GET') {
        const kind = kindParam(url) ?? editionFor(now, env);
        const state = await loadState(env.PAPER);
        const signals = await gatherSignals(env, today);
        const { edition } = compose({ kind, now, tz: env.PAPER_TZ, signals, state });
        return html(renderHtml(edition, { baseUrl: env.PAPER_URL }));
      }

      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error(err);
      return new Response(`The paper fell over: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

/** Before local noon the paper is the morning edition, after it the evening one. */
export function editionFor(now: Date, env: Env): EditionKind {
  return localParts(now, env.PAPER_TZ).hour < noonHour(env) ? 'morning' : 'evening';
}

async function runEdition(env: Env, kind: EditionKind, now: Date, opts: { send: boolean }): Promise<Edition> {
  const today = dateKey(now, env.PAPER_TZ);
  const state = await loadState(env.PAPER);
  const signals = await gatherSignals(env, today);
  const out = compose({ kind, now, tz: env.PAPER_TZ, signals, state });
  await saveState(env.PAPER, prune(out.state, today));
  await saveEdition(env.PAPER, out.edition);
  if (opts.send) {
    const links = { baseUrl: env.PAPER_URL, token: env.PAPER_TOKEN };
    await sendMail(env, {
      subject: subject(out.edition),
      text: renderText(out.edition, links),
      html: renderHtml(out.edition, links),
    });
  }
  return out.edition;
}

/** After an answer or a new one thing, re-set the latest edition so the page reflects it. */
async function refreshEdition(env: Env, now: Date): Promise<void> {
  const latest = await loadLatestEdition(env.PAPER);
  const kind = latest?.dateKey === dateKey(now, env.PAPER_TZ) ? latest.kind : editionFor(now, env);
  await runEdition(env, kind, now, { send: false });
}

function mailNote(env: Env): string {
  return env.RESEND_API_KEY && env.MAIL_TO ? `Sent to ${env.MAIL_TO}.` : 'Mail is not configured, so nothing was sent.';
}

function kindParam(url: URL): EditionKind | null {
  const k = url.searchParams.get('edition');
  return k === 'morning' || k === 'evening' ? k : null;
}

function isKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
}

function redirect(to: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location: to, ...headers } });
}

/**
 * One reader, one token. `?t=` from the email sets a cookie and drops the token
 * from the address bar. With no token configured, only demo mode opens.
 */
function authorise(request: Request, url: URL, env: Env): Response | null {
  const token = env.PAPER_TOKEN;
  if (!token) {
    if (isDemo(env)) return null;
    return html(shell('The paper', '<h1 class="mast">Set PAPER_TOKEN</h1><p>The paper has one reader and needs a token before it opens.</p>'), 503);
  }
  const presented = url.searchParams.get('t');
  if (presented !== null) {
    if (!safeEqual(presented, token)) return closed();
    url.searchParams.delete('t');
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return redirect(url.pathname + url.search, {
      'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${secure}`,
    });
  }
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (match && safeEqual(decodeURIComponent(match[1] ?? ''), token)) return null;
  return closed();
}

function closed(): Response {
  return html(shell('The paper', '<h1 class="mast">This paper has one reader.</h1><p>Open it from the link in your email.</p>'), 401);
}

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.byteLength !== y.byteLength) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}
