import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('SWEEP-AI console hide', () => {
  it('hides /ai-console for non-operators on the route and in nav', () => {
    const app = src('src/App.tsx');
    const page = src('src/pages/AiConsolePage.tsx');
    const shell = src('src/components/layout/AppShell.tsx');
    const settings = src('src/pages/AiSettingsPage.tsx');
    expect(app).toContain('<OperatorOnlyPage><AiConsolePage />');
    expect(page).toContain('if (profile && !isPlatformOperator)');
    expect(page).not.toContain('Can modify data');
    expect(page).not.toContain('query the database');
    expect(shell).toContain('isPlatformOperator && companyAiKey');
    expect(settings).not.toContain('adminToolsEnabled');
    expect(settings).not.toContain('query and modify');
    expect(settings).toContain('The assistant can look up this company');
  });
});
