export type PdfThemeTokens = {
  navy?: string;
  navyLight?: string;
  accent?: string;
  accentLight?: string;
};

export const defaultPdfColors = {
  navy: '#0A2540',
  navyLight: '#153558',
  accent: '#2E75B6',
  accentLight: '#D6E8F7',
  pass: '#166534',
  passBg: '#DCFCE7',
  fail: '#991B1B',
  failBg: '#FEE2E2',
  warning: '#92400E',
  warningBg: '#FEF3C7',
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  rule: '#E5E7EB',
  ruleLight: '#F3F4F6',
  zebra: '#F9FAFB',
  white: '#FFFFFF',
  naBlue: '#6B7280',
  incomplete: '#374151',
};

export type PdfColors = typeof defaultPdfColors;

/** Mutable default used by StyleSheets — prefer resolvePdfColors(theme) for themed docs. */
export const pdfColors: PdfColors = { ...defaultPdfColors };

export function resolvePdfColors(theme?: PdfThemeTokens | null): PdfColors {
  return {
    ...defaultPdfColors,
    navy: theme?.navy || defaultPdfColors.navy,
    navyLight: theme?.navyLight || defaultPdfColors.navyLight,
    accent: theme?.accent || defaultPdfColors.accent,
    accentLight: theme?.accentLight || defaultPdfColors.accentLight,
  };
}

export function parseReportTheme(raw: unknown): PdfThemeTokens {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: PdfThemeTokens = {};
  if (typeof o.navy === 'string' && o.navy) out.navy = o.navy;
  if (typeof o.navyLight === 'string' && o.navyLight) out.navyLight = o.navyLight;
  if (typeof o.accent === 'string' && o.accent) out.accent = o.accent;
  if (typeof o.accentLight === 'string' && o.accentLight) out.accentLight = o.accentLight;
  return out;
}

export const pdfFonts = {
  body: 'Roboto',
  mono: 'RobotoMono',
};
