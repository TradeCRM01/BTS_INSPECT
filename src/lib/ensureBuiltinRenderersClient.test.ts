import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../pages/TemplateEditorPage.tsx', import.meta.url), 'utf8');

describe('initializeBuiltInRenderers uses the seed RPC', () => {
  it('calls ensure_builtin_renderers and does not insert built_in true rows', () => {
    expect(page).toContain("rpc('ensure_builtin_renderers')");
    expect(page).not.toMatch(/insert\(\[[\s\S]*built_in:\s*true/);
  });
});
