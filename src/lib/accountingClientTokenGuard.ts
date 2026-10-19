export function clientSourceSelectsAccountingTokens(source: string): boolean {
  if (/\.from\(\s*['"]accounting_credentials['"]\s*\)/.test(source)) return true;
  if (/\.select\(\s*['"`][^'"`]*\b(access_token|refresh_token)\b/.test(source)) return true;
  if (/\.from\(\s*['"]accounting_settings['"]\s*\)/.test(source)
    && /\.select\(\s*['"`][^'"`]*\b(settings|expires_at|access_token|refresh_token)\b/.test(source)) {
    return true;
  }
  return false;
}
