import type { Edition, Line, RecordSummary } from './types';

export type LinkOptions = {
  baseUrl: string;
  /** Appended to in-paper links so the email works without a cookie. */
  token?: string;
};

export function masthead(edition: Edition): string {
  return edition.kind === 'morning' ? 'The Morning Paper' : 'The Evening Paper';
}

export function subject(edition: Edition): string {
  const lead = edition.kind === 'morning'
    ? edition.oneThing ? `One thing: ${edition.oneThing}` : 'No one thing set'
    : 'Did it get done?';
  return `${edition.heading} — ${lead}`;
}

export function resolveHref(href: string, opts: LinkOptions): string {
  if (!href.startsWith('/')) return href;
  const url = new URL(href, opts.baseUrl);
  if (opts.token) url.searchParams.set('t', opts.token);
  return url.toString();
}

export function recordLine(r: RecordSummary): string {
  if (r.answered === 0) return `No record yet. ${r.window} days start now.`;
  return `${r.done} of ${r.answered} answered days done, last ${r.window}.`;
}

export function recordMarks(r: RecordSummary): string {
  return r.marks.map(m => (m === 'done' ? '●' : m === 'missed' ? '○' : '·')).join('');
}

/* ---------- plain text ---------- */

export function renderText(edition: Edition, opts: LinkOptions): string {
  const out: string[] = [];
  out.push(masthead(edition).toUpperCase());
  out.push(edition.heading);
  out.push('');
  if (edition.kind === 'morning') {
    out.push(edition.oneThing ? `ONE THING: ${edition.oneThing}` : 'ONE THING: not set. Name it tonight.');
    out.push('');
  }
  for (const section of edition.sections) {
    out.push(section.title.toUpperCase());
    for (const line of section.lines) out.push(textLine(line, opts));
    out.push('');
  }
  out.push('THE RECORD');
  out.push(recordMarks(edition.record));
  out.push(recordLine(edition.record));
  out.push('');
  out.push(`Open the paper: ${resolveHref('/', opts)}`);
  return out.join('\n');
}

function textLine(line: Line, opts: LinkOptions): string {
  const age = line.ageDays ? `[Day ${line.ageDays}] ` : '';
  const detail = line.detail ? ` — ${line.detail}` : '';
  const link = line.href ? `  ${resolveHref(line.href, opts)}` : '';
  return `${age}${line.text}${detail}${link}`;
}

/* ---------- html ---------- */

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

const CSS = `
  :root { color-scheme: light; }
  body { margin: 0; background: #F4EFE4; color: #17191C; font: 17px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .sheet { max-width: 560px; margin: 0 auto; padding: 28px 22px 48px; background: #FFFDF7; min-height: 100vh; }
  .mast { font-family: Georgia, "Times New Roman", serif; font-weight: 700; font-size: 30px; letter-spacing: -0.01em; margin: 0; }
  .date { margin: 4px 0 0; color: #5A5F66; font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; }
  .rule { border: 0; border-top: 2px solid #17191C; margin: 18px 0 10px; }
  .thin { border: 0; border-top: 1px solid #D9D2C3; margin: 16px 0 12px; }
  .lead { font-family: Georgia, "Times New Roman", serif; font-size: 26px; line-height: 1.25; margin: 6px 0 0; }
  .lead.empty { color: #5A5F66; font-style: italic; }
  .k { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #5A5F66; margin: 0 0 6px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 8px; color: #17191C; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 7px 0; border-bottom: 1px solid #ECE6D8; display: flex; gap: 10px; align-items: baseline; }
  li:last-child { border-bottom: 0; }
  .age { flex: none; font-size: 12px; font-weight: 700; color: #B3261E; min-width: 46px; }
  .t { flex: 1; }
  .d { display: block; color: #5A5F66; font-size: 14px; }
  a { color: inherit; text-decoration: none; }
  a.btn { display: inline-block; background: #17191C; color: #FFFDF7; padding: 12px 18px; border-radius: 6px; font-weight: 600; margin: 6px 8px 6px 0; }
  a.btn.quiet { background: transparent; color: #17191C; border: 1px solid #17191C; }
  .marks { font-size: 22px; letter-spacing: 3px; line-height: 1; margin: 6px 0 4px; }
  .foot { color: #5A5F66; font-size: 14px; margin-top: 28px; }
  form input[type=text] { width: 100%; box-sizing: border-box; font: inherit; padding: 12px; border: 1px solid #17191C; border-radius: 6px; background: #fff; }
  form button { font: inherit; font-weight: 600; margin-top: 12px; padding: 12px 18px; border: 0; border-radius: 6px; background: #17191C; color: #FFFDF7; }
`;

export function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><main class="sheet">${body}</main></body></html>`;
}

export function renderHtml(edition: Edition, opts: LinkOptions): string {
  const parts: string[] = [];
  parts.push(`<h1 class="mast">${esc(masthead(edition))}</h1>`);
  parts.push(`<p class="date">${esc(edition.heading)}</p>`);
  parts.push('<hr class="rule">');
  if (edition.kind === 'morning') {
    parts.push('<p class="k">One thing</p>');
    parts.push(
      edition.oneThing
        ? `<p class="lead">${esc(edition.oneThing)}</p>`
        : `<p class="lead empty">Not set. <a href="${esc(resolveHref(`/one-thing?date=${edition.dateKey}`, opts))}" style="text-decoration:underline">Name it.</a></p>`,
    );
  }
  for (const section of edition.sections) {
    parts.push('<hr class="thin">');
    parts.push(`<h2>${esc(section.title)}</h2>`);
    const buttons = section.lines.filter(l => l.href?.startsWith('/answer'));
    const rest = section.lines.filter(l => !l.href?.startsWith('/answer'));
    if (rest.length) parts.push(`<ul>${rest.map(l => htmlLine(l, opts)).join('')}</ul>`);
    if (buttons.length) {
      parts.push(
        buttons
          .map((l, i) => `<a class="btn${i > 0 ? ' quiet' : ''}" href="${esc(resolveHref(l.href!, opts))}">${esc(l.text)}</a>`)
          .join(''),
      );
    }
  }
  parts.push('<hr class="thin">');
  parts.push('<h2>The record</h2>');
  parts.push(`<div class="marks" aria-label="last ${edition.record.window} days">${recordMarks(edition.record)}</div>`);
  parts.push(`<p style="margin:0">${esc(recordLine(edition.record))}</p>`);
  parts.push(`<p class="foot">Eight lines, then the day. <a href="${esc(resolveHref('/', opts))}" style="text-decoration:underline">Open the paper</a>.</p>`);
  return shell(`${masthead(edition)} — ${edition.heading}`, parts.join(''));
}

function htmlLine(line: Line, opts: LinkOptions): string {
  const age = line.ageDays ? `<span class="age">Day ${line.ageDays}</span>` : '';
  const detail = line.detail ? `<span class="d">${esc(line.detail)}</span>` : '';
  const text = esc(line.text);
  const body = line.href ? `<a href="${esc(resolveHref(line.href, opts))}">${text}</a>` : text;
  return `<li>${age}<span class="t">${body}${detail}</span></li>`;
}

export function renderOneThingForm(dateKey: string, heading: string, current: string | null): string {
  const body = `
    <h1 class="mast">One thing</h1>
    <p class="date">${esc(heading)}</p>
    <hr class="rule">
    <p>One sentence. One verb. The thing that, if it is the only thing that happens, makes the day count.</p>
    <form method="post" action="/one-thing">
      <input type="hidden" name="date" value="${esc(dateKey)}">
      <input type="text" name="text" maxlength="160" autofocus required placeholder="Ship the invoice PDF" value="${esc(current ?? '')}">
      <button type="submit">Set it</button>
    </form>
    <p class="foot"><a href="/" style="text-decoration:underline">Back to the paper</a></p>`;
  return shell('One thing', body);
}
