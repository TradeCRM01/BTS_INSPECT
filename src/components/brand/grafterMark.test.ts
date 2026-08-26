import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GRAFTER_BAR_SLANT,
  GRAFTER_BLUE,
  GRAFTER_CREAM,
  GRAFTER_NAVY,
  grafterBarPath,
  grafterBars,
  grafterIconSvg,
} from './grafterMark';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function collapse(svg: string): string {
  return svg.replace(/\s+/g, ' ').trim();
}

const DOCUMENT_PDF_HELPERS = [
  'src/reports/generatePdf.ts',
  'src/reports/generateJhaPdf.ts',
  'src/reports/generateTake5Pdf.ts',
  'src/reports/commercial/CommercialDocumentPdf.tsx',
  'src/reports/take5/Renderer.tsx',
  'src/reports/jha/Renderer.tsx',
  'src/reports/electrical_3000/compose.ts',
  'src/reports/generic_inspection/compose.ts',
  'src/lib/sendInvoice.ts',
] as const;

function importsGrafterMark(body: string): boolean {
  return /from ['"][^'"]*components\/brand/.test(body)
    || /from ['"][^'"]*grafterMark['"]/.test(body)
    || /import\s*\{[^}]*\b(BtsMark|BrandLockup|grafterBars|grafterBarPath|grafterIconSvg)\b/.test(body);
}

describe('signed Grafter speed-bar mark', () => {
  it('has three left-aligned capsules: navy, longer blue, navy, with cut right ends', () => {
    const bars = grafterBars('light');
    expect(bars.map((bar) => bar.id)).toEqual(['top', 'middle', 'bottom']);
    expect(bars[0].fill).toBe(GRAFTER_NAVY);
    expect(bars[1].fill).toBe(GRAFTER_BLUE);
    expect(bars[2].fill).toBe(GRAFTER_NAVY);
    expect(GRAFTER_NAVY).toBe('#0A2540');
    expect(GRAFTER_BLUE).toBe('#2E75B6');

    expect(bars[0].x).toBe(bars[1].x);
    expect(bars[2].x).toBe(bars[1].x);
    expect(bars[1].width).toBeGreaterThan(bars[0].width);
    expect(bars[1].width).toBeGreaterThan(bars[2].width);
    expect(bars[0].width).toBe(bars[2].width);
    expect(bars[0].slant).toBe(GRAFTER_BAR_SLANT);
    expect(GRAFTER_BAR_SLANT).toBeGreaterThan(0);

    for (const bar of bars) {
      const rightTop = bar.x + bar.width - bar.slant;
      const rightBot = bar.x + bar.width;
      expect(rightTop).toBeLessThan(rightBot);
      const path = grafterBarPath(bar);
      expect(path).toContain(`L${rightTop} ${bar.y}`);
      expect(path).toContain(`L${rightBot} ${bar.y + bar.height}`);
      expect(path).toMatch(/A[\d.]+ [\d.]+ 0 0 1/);
    }
  });

  it('uses cream + blue bars on the navy icon surface', () => {
    const bars = grafterBars('icon');
    expect(bars[0].fill).toBe(GRAFTER_CREAM);
    expect(bars[1].fill).toBe(GRAFTER_BLUE);
    expect(bars[2].fill).toBe(GRAFTER_CREAM);
    expect(GRAFTER_CREAM).toBe('#F5F0E6');
    expect(bars[1].width).toBeGreaterThan(bars[0].width);
  });

  it('BtsMark and BrandLockup render the signed bars + condensed Grafter lockup', () => {
    const mark = src('src/components/brand/BtsMark.tsx');
    const lockup = src('src/components/brand/BrandLockup.tsx');
    const login = src('src/pages/LoginPage.tsx');
    const shell = src('src/components/layout/AppShell.tsx');

    expect(mark).toContain('grafterBars');
    expect(mark).toContain('grafterBarPath');
    expect(mark).toContain('data-grafter-bar');
    expect(mark).not.toContain('folded field document');
    expect(mark).not.toContain('M10 8.25');
    expect(mark).not.toContain('M13.1 17.15');

    expect(lockup).toContain('Grafter');
    expect(lockup).toContain('tracking-tighter');
    expect(lockup).toContain('bg-cream');
    expect(lockup).toContain('<BtsMark');
    expect(lockup).toContain('framed={false}');
    expect(lockup).not.toContain('BTS Inspect');

    expect(login).toContain('AuthShell');
    expect(login).not.toContain("size=\"auth\"");
    expect(src('src/components/auth/AuthShell.tsx')).toContain('BrandLockup');
    expect(src('src/components/auth/AuthShell.tsx')).toContain("size=\"marketing\"");
    expect(shell).toContain("size=\"header\"");
    expect(shell).toContain('aria-label="Grafter"');
    expect(shell).toContain('BrandLockup');

    const marketing = src('src/pages/MarketingPage.tsx');
    expect(lockup).toContain("size === 'marketing'");
    expect(lockup).toContain('data-grafter-lockup="marketing"');
    expect(marketing).toContain("size=\"marketing\"");
    expect(marketing).toContain('Create a workspace');
    expect(marketing).not.toContain('Relovi');
    expect(marketing).not.toContain('BTS Inspect');
  });

  it('PWA icons are cream + blue bars on a navy squircle', () => {
    const icon = src('public/icon.svg');
    const icon192 = src('public/icon-192.svg');
    const icon512 = src('public/icon-512.svg');

    expect(collapse(icon)).toBe(collapse(grafterIconSvg(192)));
    expect(collapse(icon192)).toBe(collapse(grafterIconSvg(192)));
    expect(collapse(icon512)).toBe(collapse(grafterIconSvg(512)));

    for (const body of [icon, icon192, icon512]) {
      expect(body).toContain(`fill="${GRAFTER_NAVY}"`);
      expect(body).toContain(`fill="${GRAFTER_CREAM}"`);
      expect(body).toContain(`fill="${GRAFTER_BLUE}"`);
      expect(body).toContain('rx="7"');
      expect(body).not.toContain('folded');
      expect(body).not.toContain('M66 62');
    }

    const manifest = src('vite.config.ts');
    expect(manifest).toContain("name: 'Grafter'");
    expect(manifest).toContain("short_name: 'Grafter'");
    expect(manifest).toContain('icon-192.svg');
    expect(manifest).toContain('icon-512.svg');

    expect(src('tailwind.config.js')).toContain("cream: '#F5F0E6'");
    expect(src('src/index.css')).toContain('--ops-cream: #F5F0E6');
  });

  it('LOOK frames cover login lockup, header mark, and PWA icon only', () => {
    for (const rel of [
      'docs/look/grafter-mark-login-desktop.png',
      'docs/look/grafter-mark-login-ute.png',
      'docs/look/grafter-mark-header-desktop.png',
      'docs/look/grafter-mark-header-ute.png',
      'docs/look/grafter-mark-icon.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});

describe('customer documents stay off the Grafter mark', () => {
  it('PDF helpers do not import or fall back to the Grafter mark', () => {
    for (const rel of DOCUMENT_PDF_HELPERS) {
      const body = src(rel);
      expect(importsGrafterMark(body)).toBe(false);
      expect(body).not.toContain('BtsMark');
      expect(body).not.toContain('BrandLockup');
      expect(body).not.toContain('grafterMark');
      expect(body).not.toContain('grafterBars');
      expect(body).not.toContain('grafterBarPath');
      expect(body).not.toContain('/icon.svg');
      expect(body).not.toContain('/icon-192.svg');
      expect(body).not.toContain('/icon-512.svg');
    }

    const logo = src('src/lib/companyLogo.ts');
    expect(importsGrafterMark(logo)).toBe(false);
    expect(logo).toContain('companyDocumentLogoUrl');
    expect(logo).toContain('logo_url');
    expect(logo).toContain('Never invents a Grafter G, BtsMark, or BrandLockup fallback');
    expect(logo).not.toMatch(/from ['"].*components\/brand/);
    expect(logo).not.toContain('/icon.svg');
  });
});
