import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const CRAFT_FILES = [
  'docs/interface-craft/README.md',
  'docs/interface-craft/manual.md',
  'docs/interface-craft/grafter-overlay.md',
  '.cursor/skills/grafter-interface-craft/SKILL.md',
  '.cursor/rules/grafter-interface-craft.mdc',
] as const;

describe('Grafter Interface Craft Manual', () => {
  it('lands the standard files and names Grafter, not a second house', () => {
    for (const rel of CRAFT_FILES) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      const body = src(rel);
      expect(body).toContain('Grafter');
      const leftover = body
        .replace(/Never Relovi\.?/g, '')
        .replace(/Never Littleloop\.?/g, '')
        .replace(/Relovi or Littleloop anywhere\.?/g, '');
      expect(leftover).not.toMatch(/Relovi|Littleloop/);
    }

    const overlay = src('docs/interface-craft/grafter-overlay.md');
    expect(overlay).toContain('this file wins');
    expect(overlay).toContain('navy');
    expect(overlay).toContain('accent');
    expect(overlay).toContain('accentLight');
    expect(overlay).toContain('navyLight');
    expect(overlay).toContain('#0A2540');
    expect(overlay).toContain('#2E75B6');
    expect(overlay).toContain('#D6E8F7');
    expect(overlay).toContain('#153558');
    expect(overlay).toContain('--ops-cream');
    expect(overlay).toContain('#F5F0E6');
    expect(overlay).toContain('Inter');
    expect(overlay).toContain('JetBrains Mono');
    expect(overlay).toContain('.btn-primary');
    expect(overlay).toContain('.ops-next-control');
    expect(overlay).toContain('src/reports/shared/components.tsx');
    expect(overlay).toContain('PR #17');
    expect(overlay).toContain('Below 24');
    expect(overlay).toContain('Do not introduce a second accent');
    expect(overlay).toContain('Do not switch the product to Manrope');

    const manual = src('docs/interface-craft/manual.md');
    expect(manual).toContain('# Part VIII — The Grafter specification');
    expect(manual).toContain('# Part IX — Review rubric');
    expect(manual).toContain('Warm Technical');
    expect(manual).toContain('formatJobNumber');
    expect(manual).toContain('job-number chip');
    expect(manual).toContain('Inter');
    expect(manual).toContain('JetBrains Mono');
    expect(manual).not.toContain('#3E6FD1');

    const skill = src('.cursor/skills/grafter-interface-craft/SKILL.md');
    expect(skill).toContain('grafter-overlay.md');
    expect(skill).toContain('report_theme');
    expect(skill).toMatch(/[Oo]ne surface per PR/);

    const rule = src('.cursor/rules/grafter-interface-craft.mdc');
    expect(rule).toContain('alwaysApply: true');
    expect(rule).toContain('grafter-interface-craft/SKILL.md');
  });

  it('does not recast global buttons or add a theme editor from this standard', () => {
    const overlay = src('docs/interface-craft/grafter-overlay.md');
    expect(overlay).toContain('Do not recast `.btn-primary`');
    expect(overlay).toContain('Do not invent a theme editor');
    expect(overlay).toContain('Do not add `ReportThemePage`');

    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/JhaThemeSettingsPage.tsx'))).toBe(false);
  });
});
