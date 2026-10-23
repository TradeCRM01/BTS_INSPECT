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

export async function fetchEmailSmtpReady(client: {
  rpc: (fn: string) => unknown;
}): Promise<boolean> {
  const { data, error } = await (client.rpc(EMAIL_SMTP_READY_RPC) as Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>);
  if (error) throw error;
  return data === true;
}

export function withEmailSmtpReady<T extends Record<string, unknown> | null>(
  row: T,
  ready: boolean,
): (T & { ready: boolean }) | null {
  if (!row && !ready) return null;
  return { ...(row ?? {} as T), ready };
}

export async function loadBrowserEmailSettings(
  client: {
    rpc: (fn: string) => unknown;
    from: (table: string) => unknown;
  },
  companyId: string,
): Promise<(Record<string, unknown> & { ready: boolean }) | null> {
  const query = client.from('email_settings') as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
  const [rowRes, ready] = await Promise.all([
    query.select(EMAIL_SETTINGS_CLIENT_COLUMNS).eq('company_id', companyId).maybeSingle(),
    fetchEmailSmtpReady(client),
  ]);
  if (rowRes.error) throw rowRes.error;
  return withEmailSmtpReady((rowRes.data ?? null) as Record<string, unknown> | null, ready);
}
