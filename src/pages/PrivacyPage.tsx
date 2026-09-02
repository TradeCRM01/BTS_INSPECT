import privacyMd from '../content/privacy.md?raw';
import { LegalShell } from '../components/legal/LegalShell';
import { renderLegalMarkdown } from '../lib/renderLegalMarkdown';

export function PrivacyPage() {
  return (
    <LegalShell seoKey="privacy" title="Privacy Policy">
      {renderLegalMarkdown(privacyMd, { skipFirstH1: true })}
    </LegalShell>
  );
}
