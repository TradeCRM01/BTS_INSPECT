export const THEME_STORAGE_KEY = 'grafter-theme';
export const ALLOW_DARK = false;
export const FOLLOW_SYSTEM = false;

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export type ThemeFlags = {
  allowDark: boolean;
  followSystem: boolean;
};

export const A0_THEME_FLAGS: ThemeFlags = {
  allowDark: ALLOW_DARK,
  followSystem: FOLLOW_SYSTEM,
};

export function isPortalPath(pathname: string): boolean {
  return /^\/p(\/|$)/.test(pathname);
}

export function storedThemeChoice(raw: string | null | undefined): ThemeChoice | null {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
}

export function resolveTheme(
  choice: ThemeChoice,
  prefersDark: boolean,
  flags: ThemeFlags = A0_THEME_FLAGS,
): ResolvedTheme {
  if (!flags.allowDark) return 'light';
  if (choice === 'light' || choice === 'dark') return choice;
  if (!flags.followSystem) return 'light';
  return prefersDark ? 'dark' : 'light';
}

export function applyResolvedTheme(
  choice: ThemeChoice,
  prefersDark: boolean,
  pathname: string,
  flags: ThemeFlags = A0_THEME_FLAGS,
): ResolvedTheme {
  if (isPortalPath(pathname)) return 'light';
  return resolveTheme(choice, prefersDark, flags);
}

export type ThemeInitCase = {
  stored: string | null;
  prefersDark: boolean;
  path: string;
  resolved: ResolvedTheme;
};

export function themeInitCases(flags: ThemeFlags = A0_THEME_FLAGS): ThemeInitCase[] {
  const storedValues = [null, 'light', 'dark', 'system', 'junk'] as const;
  const paths = ['/', '/jobs', '/p', '/p/token', '/portal'];
  const cases: ThemeInitCase[] = [];
  for (const stored of storedValues) {
    for (const prefersDark of [false, true]) {
      for (const path of paths) {
        const choice = storedThemeChoice(stored) ?? 'system';
        cases.push({
          stored,
          prefersDark,
          path,
          resolved: applyResolvedTheme(choice, prefersDark, path, flags),
        });
      }
    }
  }
  return cases;
}
