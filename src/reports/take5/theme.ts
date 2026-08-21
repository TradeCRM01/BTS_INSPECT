import {
  parseReportTheme,
  resolvePdfColors,
  type PdfColors,
  type PdfThemeTokens,
} from '../shared/styles';

/** Keys already saved on companies.report_theme — do not invent new ones. */
export const TAKE5_REPORT_THEME_KEYS = ['navy', 'accent', 'accentLight', 'navyLight'] as const;

export function take5ReportTheme(raw: unknown): PdfThemeTokens {
  return parseReportTheme(raw);
}

/** Existing Take 5 document colours, overlaid with the saved report_theme palette when set. */
export function take5DocumentColors(reportTheme: unknown): PdfColors {
  return resolvePdfColors(parseReportTheme(reportTheme));
}
