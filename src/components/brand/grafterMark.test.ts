import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MITRE_PATH, MITRE_VIEWBOX } from './grafterMark';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
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
    || /import\s*\{[^}]*\b(BtsMark|BrandLockup|MITRE_PATH|grafterBars|grafterBarPath|grafterIconSvg)\b/.test(body);
}

describe('Mitre mark geometry', () => {
  it('exports the 48 viewBox and currentColor path from the handoff mark', () => {
    expect(MITRE_VIEWBOX).toBe('0 0 48 48');
    expect(MITRE_PATH).toBe(
      'M3 3L45 3L45 12L12 12L12 36L3 45ZM18 36L36 36L36 30L24 30L24 21L45 21L45 45L9 45Z',
    );
    expect(src('src/components/brand/grafterMark.ts')).not.toContain('grafterBars');
    expect(src('src/components/brand/grafterMark.ts')).not.toContain('grafterBarPath');
    expect(src('src/components/brand/grafterMark.ts')).not.toContain('GRAFTER_BAR_SLANT');
  });

  it('BrandMark paints the Mitre path with currentColor and no word', () => {
    const mark = src('src/components/brand/BrandMark.tsx');
    expect(mark).toContain('MITRE_PATH');
    expect(mark).toContain('currentColor');
    expect(mark).toContain('data-grafter-mark="mitre"');
    expect(mark).not.toContain('BtsMark');
    expect(mark).not.toContain('BRAND_NAME');
    expect(mark).not.toContain("'Grafter'");
    expect(existsSync(resolve(process.cwd(), 'src/components/brand/BtsMark.tsx'))).toBe(false);
  });

  it('BrandLockup composes BrandMark plus Wordmark for header, auth, and marketing', () => {
    const lockup = src('src/components/brand/BrandLockup.tsx');
    const wordmark = src('src/components/brand/Wordmark.tsx');
    const shell = src('src/components/layout/AppShell.tsx');
    expect(lockup).toContain('<BrandMark');
    expect(lockup).toContain('<Wordmark');
    expect(lockup).toContain('tone="onDark"');
    expect(lockup).toContain('tone="ink"');
    expect(lockup).toContain('data-grafter-lockup="header"');
    expect(lockup).toContain('data-grafter-lockup="auth"');
    expect(lockup).toContain('data-grafter-lockup="marketing"');
    expect(wordmark).toContain('{BRAND_NAME}');
    expect(wordmark).toContain('uppercase');
    expect(wordmark).toContain('tracking-[0.16em]');
    expect(wordmark).toContain('aria-label={BRAND_NAME}');
    expect(wordmark).not.toContain("letterSpacing: '-0.02em'");
    expect(wordmark).toContain('fontWeight: 600');
    expect(wordmark).not.toContain("'Grafter'");
    expect(src('src/components/auth/AuthShell.tsx')).toContain("size=\"marketing\"");
    expect(shell).toContain("size=\"header\"");
    expect(shell).toContain('aria-label={BRAND_NAME}');
    expect(lockup).toContain('size={16}');
    expect(lockup).toContain('size={32}');
    expect(lockup).toContain('size={48}');
    expect(lockup).not.toContain('size={18}');
    expect(lockup).not.toContain('size={28}');
    expect(lockup).not.toContain('size={40}');
    expect(src('src/components/brand/BrandMark.tsx')).toContain('size ?? 24');
  });

  it('PWA icons are the Mitre PNGs plus a maskable tile', () => {
    expect(existsSync(resolve(process.cwd(), 'public/favicon.svg'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'public/icon-192.png'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'public/icon-512.png'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'public/icon-maskable-512.png'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'public/apple-touch-icon.png'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'public/icon-192.svg'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'public/icon-512.svg'))).toBe(false);

    const favicon = src('public/favicon.svg');
    expect(favicon).toContain(MITRE_PATH);
    expect(favicon).toContain('prefers-color-scheme');

    const manifest = src('vite.config.ts');
    expect(manifest).toContain('...brandManifestFields()');
    expect(src('src/lib/brand.ts')).toContain('short_name: name');
    expect(manifest).toContain('icon-192.png');
    expect(manifest).toContain('icon-maskable-512.png');
    expect(manifest).toContain("purpose: 'maskable'");
    expect(manifest).toContain("theme_color: '#0A0A0B'");
    expect(manifest).toContain("background_color: '#F5F5F7'");
    expect(manifest).not.toContain("'Grafter'");
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
