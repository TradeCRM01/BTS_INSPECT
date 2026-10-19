/**
 * @vitest-environment jsdom
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { getAllByRole } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { company_id: 'co-1', id: 'user-1', name: 'QA', role: 'admin' },
    company: { id: 'co-1', name: 'QA Co', default_tax_rate: 10, default_material_markup: 20 },
    session: { access_token: 'tok' },
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from() {
      const result = { data: [], error: null };
      const query: Record<string, unknown> = {};
      const self = () => query;
      for (const key of ['select', 'eq', 'neq', 'is', 'or', 'order', 'limit', 'maybeSingle', 'single', 'in']) {
        query[key] = self;
      }
      query.then = (onFulfilled: (value: unknown) => unknown) => Promise.resolve(result).then(onFulfilled);
      return query;
    },
    rpc() { return Promise.resolve({ data: [], error: null }); },
    storage: { from() { return { upload: () => Promise.resolve({ error: null }) }; } },
  },
}));

import { QuoteEditorModal } from './QuotesPage';
import { ToastProvider } from '../components/ui/Toast';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function quoteLinesTheadRule(css: string): string {
  const start = css.indexOf('.hub-quote-lines thead {');
  expect(start).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end + 1);
}

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

describe('quote editor Looplet document look', () => {
  it('paints the editor as a cream paper sheet with one 44px primary', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    const editor = quotes.split('function QuoteEditorModal')[1] ?? '';
    const css = src('src/index.css');

    expect(editor).toContain('hub-quote-editor');
    expect(editor).toContain('hub-quote-sheet');
    expect(editor).toContain('hub-quote-letterhead');
    expect(editor).toContain('hub-quote-kicker">To');
    expect(editor).toContain('hub-quote-totalbar');
    expect(editor).toContain('hub-quote-more');
    expect(editor).toContain("next.key === 'send'");
    expect(editor).toContain('className="btn-primary"');
    expect(editor).toContain('Mark accepted');
    expect(editor).toContain('Preview PDF');
    expect(editor).toContain('Copy link');
    expect(editor).toContain('data-quote-copy-link="1"');
    expect(editor).toContain('handleCopyLink');
    expect(editor).toContain('copyShareText');
    expect(editor).toContain('documentShareOrigin');
    expect(editor).toContain('prepareDocumentShareLink');
    expect(editor).toContain('Link copied');
    expect(editor).toContain('Edit quote');
    expect(css).toContain('.hub-quote-copy-confirm');
    expect(editor).not.toContain('ActionButton recommended');
    expect(editor).not.toContain('ops-doc-panel');
    expect(editor).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(editor).toContain('data-quote-lines="1"');
    expect(quoteLinesTheadRule(css)).not.toMatch(/display\s*:\s*none/);
    expect(css).toContain('.hub-quote-lines td:nth-child(2)::before { content: \'Qty\'; }');
    expect(css).toContain('.hub-quote-lines td:nth-child(3)::before { content: \'Unit\'; }');
    expect(css).toContain('.hub-quote-lines td:nth-child(4)::before { content: \'Total\'; }');
    expect(css).toContain('overflow: visible');
    expect(css).not.toContain('.hub-quote-table {\n      margin-left: 16px;\n      margin-right: 16px;\n      overflow-x: auto;');

    expect(css).toContain('.hub-quote-sheet');
    expect(css).toContain('.hub-quote-totalbar');
    expect(css).toContain('border-radius: 16px');
    expect(css).toContain('.hub-quote-display-total');
    expect(css).not.toMatch(/\.hub-quote-editor \.btn-primary[\s\S]{0,120}#111|#000\b/);
  });

  it('hides .hub-quote-lines thead at phone so the quote dialog has no clipped header', async () => {
    const css = src('src/index.css');
    const theadRule = quoteLinesTheadRule(css);
    expect(theadRule).not.toMatch(/display\s*:\s*none/);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    const style = document.createElement('style');
    style.textContent = theadRule;
    document.head.appendChild(style);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null,
          createElement(QueryClientProvider, { client },
            createElement(ToastProvider, null,
              createElement(QuoteEditorModal, {
                quote: {
                  id: 'q-sent',
                  company_id: 'co-1',
                  quote_number: 11,
                  client_id: 'cl-1',
                  job_id: null,
                  status: 'sent',
                  description: 'Switchboard',
                  scope_of_works: '',
                  line_items: [{ description: 'Labour', quantity: 1.5, unit_price: 87.35 }],
                  subtotal: 131.03,
                  tax_rate: 10,
                  tax_amount: 13.1,
                  total: 144.13,
                  validity_date: null,
                  notes: null,
                  inclusions: [],
                  exclusions: [],
                  scheduled_date: '2026-10-20',
                  assigned_team: ['user-1'],
                  created_by: 'user-1',
                  created_at: '2026-10-01T00:00:00.000Z',
                  updated_at: '2026-10-01T00:00:00.000Z',
                  invoice_id: null,
                },
                defaultTaxRate: 10,
                onClose: () => {},
                onSaved: () => {},
                onRequestSend: () => {},
              } as never),
            ),
          ),
        ),
      );
    });
    await act(async () => { await Promise.resolve(); });

    const thead = document.querySelector('.hub-quote-lines thead') as HTMLTableSectionElement;
    expect(thead).toBeTruthy();
    const computed = getComputedStyle(thead);
    expect(computed.display).not.toBe('none');
    expect(computed.position).toBe('absolute');

    const headers = getAllByRole(document.body, 'columnheader').map(el => (el.textContent || '').trim());
    expect(headers).toEqual(['Description', 'Qty', 'Unit', 'Total']);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it('keeps Send and Accept writes on the existing persist path', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    const editor = quotes.split('function QuoteEditorModal')[1] ?? '';
    expect(editor).toContain('startSend');
    expect(editor).toContain("persist('draft'");
    expect(editor).toContain("persist('accepted'");
    expect(editor).not.toContain('sendQuoteDeliver');
    expect(editor).not.toContain('Quote marked as sent');
  });

  it('adds date and crew on the existing Convert surface without restyling the portal or job sheet', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    const editor = quotes.split('function QuoteEditorModal')[1] ?? '';
    const portal = src('src/pages/ClientPortalPublicPage.tsx');
    const jobSheet = src('src/pages/JobDetailPage.tsx');
    expect(editor).toContain('Field label="Job date"');
    expect(editor).toContain('Field label="Crew"');
    expect(editor).toContain('className="form-input cursor-pointer"');
    expect(editor).toContain('No crew yet');
    expect(editor).toContain('hub-quote-convert');
    expect(editor).toContain('hub-quote-convert-miss');
    expect(editor).toContain('Date and crew on this tap.');
    expect(editor).not.toContain('Convert needs a date and crew on this tap. Accept copies these when set');
    expect(editor.indexOf('hub-quote-convert')).toBeGreaterThan(editor.indexOf('hub-quote-sheet'));
    expect(editor.indexOf('hub-quote-convert')).toBeLessThan(editor.indexOf('className="hub-quote-edit"'));
    expect(portal).toContain('className="portal-quote-accept"');
    expect(portal).not.toContain('assigned_team');
    expect(jobSheet).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
  });

  it('LOOK frames cover quote convert date/crew desktop, phone, and empty miss', () => {
    for (const rel of [
      'docs/look/quote-convert-date-crew-desktop.png',
      'docs/look/quote-convert-date-crew-phone.png',
      'docs/look/quote-convert-empty-miss-desktop.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });

  it('LOOK frames cover quote editor desktop and phone only', () => {
    for (const rel of [
      'docs/look/quote-editor-desktop.png',
      'docs/look/quote-editor-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
