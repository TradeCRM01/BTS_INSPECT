import termsMd from '../content/terms.md?raw';
import { LegalShell } from '../components/legal/LegalShell';
import { renderLegalMarkdown } from '../lib/renderLegalMarkdown';

export function TermsPage() {
  return (
    <LegalShell seoKey="terms" title="Terms of Use">
      {renderLegalMarkdown(termsMd, { skipFirstH1: true })}
    </LegalShell>
  );
}
