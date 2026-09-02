import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderLegalMarkdown } from './renderLegalMarkdown';

function html(source: string, opts?: { skipFirstH1?: boolean }): string {
  return renderToStaticMarkup(
    createElement(Fragment, null, renderLegalMarkdown(source, opts)),
  );
}

describe('renderLegalMarkdown', () => {
  it('renders headings, tables, mailto, and links without rewriting copy', () => {
    const markup = html(`# Privacy Policy

**Effective 2 September 2026**

## 1. Who we are

Email privacy@grafter.com.au or see [grafter.com.au](https://grafter.com.au).

| Processor | Use |
| --- | --- |
| Supabase | Database |
| Cloudflare | Hosting |
`);
    expect(markup).toContain('<h1>Privacy Policy</h1>');
    expect(markup).toContain('<strong>Effective 2 September 2026</strong>');
    expect(markup).toContain('<h2>1. Who we are</h2>');
    expect(markup).toContain('href="mailto:privacy@grafter.com.au"');
    expect(markup).toContain('href="https://grafter.com.au"');
    expect(markup).toContain('<th>Processor</th>');
    expect(markup).toContain('<td>Supabase</td>');
    expect(markup).toContain('<td>Cloudflare</td>');
  });

  it('can skip the first H1 when LegalShell already prints the title', () => {
    const markup = html('# Terms of Use\n\nBody copy.\n', { skipFirstH1: true });
    expect(markup).not.toContain('<h1>');
    expect(markup).toContain('Body copy.');
  });
});
