/** Keys already saved on companies.report_theme — same as documents. Do not invent new ones. */
export const APP_SHELL_REPORT_THEME_KEYS = ['navy', 'accent', 'accentLight', 'navyLight'] as const;

export type AppShellThemeTokens = {
  navy?: string;
  accent?: string;
  accentLight?: string;
  navyLight?: string;
};

/** Same defaults documents use when companies.report_theme is blank or unset. */
export const defaultAppShellColors = {
  navy: '#0A2540',
  accent: '#2E75B6',
  accentLight: '#D6E8F7',
  navyLight: '#153558',
};

export type AppShellColors = typeof defaultAppShellColors;

/** Keep only the existing report_theme keys. Extra keys (cream, etc.) are dropped. */
export function parseAppShellTheme(raw: unknown): AppShellThemeTokens {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: AppShellThemeTokens = {};
  if (typeof o.navy === 'string' && o.navy) out.navy = o.navy;
  if (typeof o.navyLight === 'string' && o.navyLight) out.navyLight = o.navyLight;
  if (typeof o.accent === 'string' && o.accent) out.accent = o.accent;
  if (typeof o.accentLight === 'string' && o.accentLight) out.accentLight = o.accentLight;
  return out;
}

/** Saved companies.report_theme palette, or the navy / blue document defaults. */
export function resolveAppShellColors(reportTheme: unknown): AppShellColors {
  const theme = parseAppShellTheme(reportTheme);
  return {
    navy: theme.navy || defaultAppShellColors.navy,
    accent: theme.accent || defaultAppShellColors.accent,
    accentLight: theme.accentLight || defaultAppShellColors.accentLight,
    navyLight: theme.navyLight || defaultAppShellColors.navyLight,
  };
}
