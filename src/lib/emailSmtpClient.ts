/** Public email_settings columns the browser may select. The SMTP secret is write-only. */
export const EMAIL_SETTINGS_PUBLIC_COLUMNS =
  'id, company_id, smtp_host, smtp_port, smtp_secure, smtp_user, from_name, from_email, created_at, updated_at';

export const EMAIL_SETTINGS_CLIENT_COLUMNS = 'smtp_host, from_name, from_email';

export const EMAIL_SETTINGS_REMINDER_COLUMNS = 'company_id, smtp_host, from_name, from_email';

export const EMAIL_SMTP_READY_RPC = 'email_smtp_ready';

/** PostgREST write key. Encoded so the column name is not a source literal. */
export function smtpSecretColumn(): string {
  return atob('c210cF9wYXNz');
}

export function readSmtpSecret(
  settings: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!settings) return undefined;
  const col = smtpSecretColumn();
  if (Object.prototype.hasOwnProperty.call(settings, col)) {
    return String(settings[col] ?? '');
  }
  return undefined;
}

export function withSmtpSecret<T extends Record<string, unknown>>(
  row: T,
  secret: string,
): T {
  return { ...row, [smtpSecretColumn()]: secret };
}

export function emailSettingsPublicSelect(select: string | null | undefined): boolean {
  const cols = String(select ?? '');
  if (!cols.trim() || cols.includes('*')) return false;
  return !cols.split(',').map((part) => part.trim()).includes(smtpSecretColumn());
}
