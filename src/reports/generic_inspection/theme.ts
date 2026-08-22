import {
  parseReportTheme,
  resolvePdfColors,
  type PdfColors,
  type PdfThemeTokens,
} from '../shared/styles';

/** Keys already saved on companies.report_theme — do not invent new ones. */
export const INSPECTION_REPORT_THEME_KEYS = ['navy', 'accent', 'accentLight', 'navyLight'] as const;

export function inspectionReportTheme(raw: unknown): PdfThemeTokens {
  return parseReportTheme(raw);
}

/** Existing inspection-report colours, overlaid with the saved report_theme palette when set. */
export function inspectionDocumentColors(reportTheme: unknown): PdfColors {
  return resolvePdfColors(parseReportTheme(reportTheme));
}
