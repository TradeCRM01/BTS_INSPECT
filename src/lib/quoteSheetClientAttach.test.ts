import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jobClientEmailRow } from './saveJobClientEmail';
import { jobClientPhoneRow } from './saveJobClientPhone';
import {
  QUOTE_CLIENT_ATTACH_ALREADY,
  QUOTE_CLIENT_ATTACH_NO_CLIENTS,
  QUOTE_CLIENT_ATTACH_NO_QUOTE,
  QUOTE_CLIENT_ATTACH_NO_SELECTION,
  QUOTE_CLIENT_ATTACH_SAVED,
  QUOTE_CLIENT_ATTACH_UNKNOWN,
  companyClientsForAttach,
  decideQuoteClientAttach,
  quoteClientAttachRow,
  quoteClientAttachToast,
} from './attachQuoteClient';
import { recommendQuoteAction } from './quoteNextAction';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const acme = { id: 'c1', name: 'Acme Electrical' };
const brooks = { id: 'c2', name: 'Brooks Plumbing' };

describe('companyClientsForAttach', () => {
  it('lists existing company clients only — no invented placeholder', () => {
    expect(companyClientsForAttach([
      acme,
      { id: 'c-arch', name: 'Old Co', archived: true },
      { id: 'c-blank', name: '   ' },
      { id: '', name: 'Ghost' },
      brooks,
    ])).toEqual([acme, brooks]);
    expect(companyClientsForAttach([])).toEqual([]);
    expect(companyClientsForAttach(null)).toEqual([]);
    expect(companyClientsForAttach(undefined)).toEqual([]);
  });
});

describe('quoteClientAttachRow', () => {
  it('keeps the signed Client field when this quote already has client_id', () => {
    expect(quoteClientAttachRow({
      quoteClientId: 'c1',
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'linked' });
    expect(quoteClientAttachRow({
      quoteClientId: 'c1',
      companyClients: [],
    }).kind).toBe('linked');
  });

  it('lets the operator pick when this quote has no client_id and company clients exist', () => {
    expect(quoteClientAttachRow({
      quoteClientId: null,
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'pick', clients: [acme, brooks] });
    expect(quoteClientAttachRow({
      quoteClientId: '',
      companyClients: [acme],
    }).kind).toBe('pick');
  });

  it('names the miss when there are no clients to pick — no fake picker', () => {
    expect(quoteClientAttachRow({
      quoteClientId: null,
      companyClients: [],
    })).toEqual({
      kind: 'miss',
      reason: 'no_clients',
      message: QUOTE_CLIENT_ATTACH_NO_CLIENTS,
    });
    expect(quoteClientAttachRow({
      quoteClientId: null,
      companyClients: [{ id: 'c-arch', name: 'Old Co', archived: true }],
    }).kind).toBe('miss');
    expect(QUOTE_CLIENT_ATTACH_NO_CLIENTS).toBe('No clients to attach');
  });

  it('stays quiet while the company list is still loading', () => {
    expect(quoteClientAttachRow({
      quoteClientId: null,
      companyClients: null,
    })).toEqual({ kind: 'pending' });
    expect(quoteClientAttachRow({
      quoteClientId: undefined,
      companyClients: undefined,
    }).kind).toBe('pending');
  });
});

describe('decideQuoteClientAttach', () => {
  it('writes quotes.client_id on this quote from an existing company client', () => {
    expect(decideQuoteClientAttach({
      quoteId: 'q-1',
      quoteClientId: null,
      clientId: 'c1',
      companyClients: [acme, brooks],
    })).toEqual({ action: 'write', quoteId: 'q-1', clientId: 'c1' });
  });

  it('does not invent a client — unknown, blank, or empty list miss', () => {
    expect(decideQuoteClientAttach({
      quoteId: 'q-1',
      quoteClientId: null,
      clientId: 'invented',
      companyClients: [acme],
    })).toEqual({
      action: 'miss',
      reason: 'unknown_client',
      message: QUOTE_CLIENT_ATTACH_UNKNOWN,
    });
    expect(decideQuoteClientAttach({
      quoteId: 'q-1',
      quoteClientId: null,
      clientId: '',
      companyClients: [acme],
    })).toMatchObject({ action: 'miss', reason: 'no_selection', message: QUOTE_CLIENT_ATTACH_NO_SELECTION });
    expect(decideQuoteClientAttach({
      quoteId: 'q-1',
      quoteClientId: null,
      clientId: 'c1',
      companyClients: [],
    })).toMatchObject({ action: 'miss', reason: 'no_clients', message: QUOTE_CLIENT_ATTACH_NO_CLIENTS });
    expect(decideQuoteClientAttach({
      quoteId: 'q-1',
      quoteClientId: null,
      clientId: 'c-arch',
      companyClients: [{ id: 'c-arch', name: 'Old Co', archived: true }],
    })).toMatchObject({ action: 'miss', reason: 'no_clients' });
  });

  it('does not clobber a quote that already has client_id', () => {
    expect(decideQuoteClientAttach({
      quoteId: 'q-1',
      quoteClientId: 'c1',
      clientId: 'c2',
      companyClients: [acme, brooks],
    })).toEqual({
      action: 'miss',
      reason: 'already_linked',
      message: QUOTE_CLIENT_ATTACH_ALREADY,
    });
  });

  it('misses without a quote id', () => {
    expect(decideQuoteClientAttach({
      quoteId: null,
      quoteClientId: null,
      clientId: 'c1',
      companyClients: [acme],
    })).toEqual({
      action: 'miss',
      reason: 'no_quote',
      message: QUOTE_CLIENT_ATTACH_NO_QUOTE,
    });
  });
});

describe('after attach — signed email / phone fields / Send unchanged', () => {
  it('reuses the signed email and phone fields when the attached client has no sendable contact', () => {
    expect(quoteClientAttachRow({
      quoteClientId: 'c1',
      companyClients: [acme],
    }).kind).toBe('linked');
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: '' });
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: '' });
  });

  it('shows the saved address and number when the attached client already has them', () => {
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: 'jane@acme.com.au' },
    })).toEqual({ kind: 'mailto', clientId: 'c1', email: 'jane@acme.com.au' });
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '0412 345 678' },
    })).toEqual({ kind: 'tel', clientId: 'c1', phone: '0412 345 678' });
  });

  it('does not invent an add_email Next — Send stays mark-as-sent, no auto-send', () => {
    expect(recommendQuoteAction({
      status: 'draft', hasClient: true, hasLines: true, jobId: null, invoiceId: null,
    }).key).toBe('send');
    expect(recommendQuoteAction({
      status: 'draft', hasClient: false, hasLines: true, jobId: null, invoiceId: null,
    }).label).toBe('Add a client');
    expect(quoteClientAttachToast()).toEqual({
      message: QUOTE_CLIENT_ATTACH_SAVED,
      kind: 'success',
    });
    expect(QUOTE_CLIENT_ATTACH_SAVED).not.toMatch(/sent/i);
    expect(QUOTE_CLIENT_ATTACH_SAVED).not.toMatch(/email/i);
  });
});

describe('quote-sheet attach client — wiring', () => {
  it('writes quotes.client_id on this quote and does not invent a client', () => {
    const attach = src('src/lib/attachQuoteClient.ts');
    const page = src('src/pages/QuotesPage.tsx');
    const editorStart = page.indexOf('function QuoteEditorModal');
    expect(editorStart).toBeGreaterThan(-1);
    const editor = page.slice(editorStart);
    const handleStart = editor.indexOf('const attachClient = useMutation');
    const handleEnd = editor.indexOf('const saveClientEmail');
    expect(handleStart).toBeGreaterThan(-1);
    expect(handleEnd).toBeGreaterThan(handleStart);
    const handle = editor.slice(handleStart, handleEnd);
    const persist = editor.slice(editor.indexOf('const persist = async'), editor.indexOf('const handleInvoice'));

    expect(attach).toContain("from('quotes')");
    expect(attach).toContain('update({ client_id:');
    expect(attach).toContain('.eq(\'id\', decision.quoteId)');
    expect(attach).toContain('decideQuoteClientAttach');
    expect(attach).toContain('companyClientsForAttach');
    expect(attach).not.toContain('insert({');
    expect(attach).not.toContain("from('clients')");
    expect(attach).not.toContain("from('jobs')");
    expect(attach).not.toContain("from('invoices')");
    expect(attach).not.toContain('CREATE TABLE');
    expect(attach).not.toContain('ALTER TABLE');
    expect(attach).not.toContain('cron.schedule');
    expect(attach).not.toContain('deliverInvoice');
    expect(attach).not.toContain('sendQuote');
    expect(attach).not.toContain('QuoteSendDialog');
    expect(attach).not.toContain('persist(');

    expect(page).toContain('attachQuoteClient');
    expect(page).toContain('quoteClientAttachRow');
    expect(page).toContain('quoteClientAttachToast');
    expect(editor).toContain('attachClient.mutate()');
    expect(editor).toContain('job-client-attach');
    expect(editor).toContain('job-client-attach-save');
    expect(editor).toContain('aria-label="Attach client"');
    expect(editor).toContain("kind === 'pick'");
    expect(editor).toContain("kind === 'miss'");
    expect(editor).toContain('QUOTE_CLIENT_ATTACH_NO_CLIENTS');
    expect(editor).toContain('quoteClientAttachRow({');
    expect(editor).toContain('quoteClientId: form.client_id');
    expect(editor).not.toContain('ClientAttachDialog');
    expect(editor).not.toContain('AttachClientDialog');
    expect(editor).not.toContain('QuoteClientAttachDialog');
    expect(editor).not.toContain('Create client');
    expect(editor).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(editor).not.toContain('No client (walk-up)');
    expect(editor).not.toContain('QuoteSendDialog');
    expect(editor).not.toContain('className="btn-primary job-client-attach-save"');
    expect(editor).not.toContain('className="ops-next-control-block job-client-attach-save"');

    expect(handle).toContain('attachQuoteClient');
    expect(handle).toContain('savedId ?? quote?.id');
    expect(handle).toContain('form.client_id');
    expect(handle).toContain('clientAttachDraft');
    expect(handle).toContain("invalidateQueries({ queryKey: ['quotes'] })");
    expect(handle).toContain("invalidateQueries({ queryKey: ['job-client'");
    expect(handle).not.toContain('persist(');
    expect(handle).not.toContain("status: 'sent'");
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('sendQuote');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('chased_at');
    expect(handle).not.toContain('saveJobClientEmail');
    expect(handle).not.toContain('saveJobClientPhone');

    expect(persist).toContain("from('quotes')");
    expect(persist).not.toContain('attachQuoteClient');
    expect(persist).not.toContain('saveJobClientEmail');
    expect(persist).not.toContain('saveJobClientPhone');
  });

  it('reuses the signed email and phone fields after attach — does not invent a second editor', () => {
    const page = src('src/pages/QuotesPage.tsx');
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));
    expect(editor).toContain('jobClientEmailRow({ clientId: form.client_id || null');
    expect(editor).toContain('jobClientPhoneRow({ clientId: form.client_id || null');
    expect(editor).toContain("emailRow.kind === 'edit'");
    expect(editor).toContain("emailRow.kind === 'mailto'");
    expect(editor).toContain("phoneRow.kind === 'edit'");
    expect(editor).toContain("phoneRow.kind === 'tel'");
    expect(editor).toContain('job-client-email');
    expect(editor).toContain('job-client-email-save');
    expect(editor).toContain('job-client-phone');
    expect(editor).toContain('job-client-phone-save');
    expect(editor).toContain('saveJobClientEmail');
    expect(editor).toContain('saveJobClientPhone');
    expect(editor).toContain('saveClientEmail.mutate()');
    expect(editor).toContain('saveClientPhone.mutate()');
    expect(editor).not.toContain('quote-client-attach-email');
    expect(editor).not.toContain('job-client-attach-email');
    expect(editor).not.toContain('ClientEmailDialog');
  });

  it('does not add a second 44px primary — Save is quiet on Client, Send stays the one primary', () => {
    const page = src('src/pages/QuotesPage.tsx');
    const css = src('src/index.css');
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));
    const quoteCssStart = css.indexOf('/* Quote editor client attach');
    expect(quoteCssStart).toBeGreaterThan(-1);
    const quoteCss = css.slice(quoteCssStart, css.indexOf('/* end quote editor client attach */'));
    const clientCssStart = quoteCss.indexOf('.hub-quote-editor .job-client-attach');
    expect(clientCssStart).toBeGreaterThan(-1);
    const clientCss = quoteCss.slice(clientCssStart);

    expect(editor).toContain("next.key === 'send'");
    expect(editor).toContain('ActionButton recommended');
    expect(editor).toContain('Quote marked as sent');
    expect(editor).toContain('job-client-attach-save');
    expect(editor).not.toContain("next.key === 'add_email'");
    expect(clientCss).toContain('.job-client-attach-save');
    expect(clientCss).not.toContain('min-height: 44px');
    expect(clientCss).not.toContain('min-h-[44px]');
    expect(clientCss).not.toContain('ops-next-control');
    expect(clientCss).not.toContain('btn-primary');
    expect(clientCss).toContain('font-size: 12px');
    expect(clientCss).toContain('#D5DCE3');
    expect(clientCss).toContain('gap: 8px');
    expect(clientCss).toContain('#5B6B7C');
    expect(clientCss).toContain('#0A2540');
    expect(clientCss).toContain('#2E75B6');
    expect(clientCss).toMatch(/\.job-client-attach-save[\s\S]*color: #5B6B7C/);
  });

  it('list-row Add a client opens this sheet — does not grow an inline picker', () => {
    const page = src('src/pages/QuotesPage.tsx');
    const card = page.slice(page.indexOf('function QuoteCard'), page.indexOf('function QuoteRow'));
    const row = page.slice(page.indexOf('function QuoteRow'), page.indexOf('function QuoteNextControl'));
    const listNext = page.slice(page.indexOf('function QuoteNextControl'), page.indexOf('interface EditorState'));
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));

    expect(card).not.toContain('job-client-attach');
    expect(card).not.toContain('aria-label="Attach client"');
    expect(card).not.toContain('attachQuoteClient');
    expect(row).not.toContain('job-client-attach');
    expect(row).not.toContain('attachQuoteClient');
    expect(listNext).not.toContain('job-client-attach');
    expect(listNext).not.toContain('aria-label="Attach client"');
    expect(listNext).not.toContain('attachQuoteClient');
    expect(listNext).toContain("next.key === 'send'");
    expect(editor).toContain('job-client-attach');
    expect(editor).toContain('aria-label="Attach client"');
  });

  it('leaves quote send delivery / PR #17 / convert / invoice attach off this control', () => {
    const attach = src('src/lib/attachQuoteClient.ts');
    const page = src('src/pages/QuotesPage.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));

    expect(attach).not.toContain('convertQuoteToInvoice');
    expect(attach).not.toContain('sendQuote');
    expect(attach).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('attachQuoteClient');
    expect(quoteNext).not.toContain('attachQuoteClient');
    expect(quoteNext).not.toContain('add_email');
    expect(quoteNext).not.toContain('sendQuote');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('sendQuote');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('attachInvoiceClient');
    expect(page).not.toContain('attachJobClient');
    expect(page).toContain('saveJobClientEmail');
    expect(page).toContain('saveJobClientPhone');
    expect(page).not.toContain('Relovi');
    expect(page).not.toContain('Littleloop');
    expect(editor).toContain('convertQuoteToInvoice');
    expect(editor).not.toContain('QuoteSendDialog');
  });

  it('keeps Flameboy look shots for pick, after-attach no-email, no-clients, linked, and list', () => {
    const shots = [
      'docs/look/quote-attach-client-pick-desktop.png',
      'docs/look/quote-attach-client-pick-ute.png',
      'docs/look/quote-attach-client-no-email-desktop.png',
      'docs/look/quote-attach-client-no-email-ute.png',
      'docs/look/quote-attach-client-no-clients-desktop.png',
      'docs/look/quote-attach-client-no-clients-ute.png',
      'docs/look/quote-attach-client-linked-desktop.png',
      'docs/look/quote-attach-client-linked-ute.png',
      'docs/look/quote-attach-client-list-desktop.png',
      'docs/look/quote-attach-client-list-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });
});
