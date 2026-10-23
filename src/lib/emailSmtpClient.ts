/** Public email_settings columns the browser may select. The SMTP secret is write-only. */
export const EMAIL_SETTINGS_PUBLIC_COLUMNS =
  'id, company_id, smtp_host, smtp_port, smtp_secure, smtp_user, from_name, from_email, created_at, updated_at';

export const EMAIL_SETTINGS_CLIENT_COLUMNS = 'smtp_host, from_name, from_email';

export const EMAIL_SETTINGS_REMINDER_COLUMNS = 'company_id, smtp_host, from_name, from_email';

export const EMAIL_SMTP_READY_RPC = 'email_smtp_ready';

export const EMAIL_SMTP_SET_PASS_RPC = 'email_smtp_set_pass';

const PUBLIC_COL_SET = new Set(
  EMAIL_SETTINGS_PUBLIC_COLUMNS.split(',').map((part) => part.trim()),
);

export function emailSettingsPublicSelect(select: string | null | undefined): boolean {
  const cols = String(select ?? '');
  if (!cols.trim() || cols.includes('*')) return false;
  return cols.split(',').map((part) => part.trim()).every((col) => PUBLIC_COL_SET.has(col));
}

type SmtpClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => unknown;
  from: (table: string) => unknown;
};

function asRpc(client: { rpc: (fn: string, args?: Record<string, unknown>) => unknown }): (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{
  data: unknown;
  error: { message?: string; code?: string } | null;
}> {
  return (fn, args) => client.rpc(fn, args) as Promise<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
}

export async function fetchEmailSmtpReady(client: {
  rpc: (fn: string, args?: Record<string, unknown>) => unknown;
}): Promise<boolean> {
  const { data, error } = await asRpc(client)(EMAIL_SMTP_READY_RPC);
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
  client: SmtpClient,
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

export async function saveCompanyEmailSettings(
  client: SmtpClient,
  publicPayload: Record<string, unknown>,
  secretDraft?: string | null,
): Promise<Record<string, unknown> | null> {
  const payload = { ...publicPayload };
  const secret = String(secretDraft ?? '').trim();
  const query = client.from('email_settings') as {
    upsert: (row: Record<string, unknown>, opts: { onConflict: 'company_id' }) => {
      select: (columns: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
      };
    };
  };
  const { data, error } = await query
    .upsert(payload, { onConflict: 'company_id' })
    .select(EMAIL_SETTINGS_PUBLIC_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (secret) {
    const setRes = await asRpc(client)(EMAIL_SMTP_SET_PASS_RPC, { p_pass: secret });
    if (setRes.error) throw setRes.error;
  }
  return (data ?? null) as Record<string, unknown> | null;
}
