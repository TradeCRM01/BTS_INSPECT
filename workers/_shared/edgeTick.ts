/** One-minute tick: POST the named Edge function. Never log secrets or Authorization. */

export const TICK_TIMEOUT_MS = 15_000;

export type EdgeTickEnv = {
  SUPABASE_URL?: string;
  [key: string]: string | undefined;
};

export type EdgeTickBindings = {
  tickName: string;
  functionName: string;
  secretName: string;
};

export function sanitizeTickLog(value: unknown, secret?: string): unknown {
  if (typeof value === 'string') {
    let out = value.replace(/authorization\s*[:=]?\s*(bearer\s+)?\S+/gi, '[redacted]');
    out = out.replace(/bearer\s+\S+/gi, '[redacted]');
    if (secret) {
      out = out.split(secret).join('[redacted]');
    }
    return out;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (/^authorization$/i.test(key) || /secret/i.test(key)) continue;
      next[key] = sanitizeTickLog(nested, secret);
    }
    return next;
  }
  return value;
}

function edgeUrl(supabaseUrl: string, functionName: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`;
}

export async function postEdgeTick(env: EdgeTickEnv, bindings: EdgeTickBindings): Promise<void> {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const secret = env[bindings.secretName]?.trim();
  if (!supabaseUrl) {
    console.error(
      `${bindings.tickName} missing SUPABASE_URL`,
      sanitizeTickLog({ functionName: bindings.functionName }),
    );
    return;
  }
  if (!secret) {
    console.error(
      `${bindings.tickName} missing secret`,
      sanitizeTickLog({ functionName: bindings.functionName, secretName: bindings.secretName }),
    );
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TICK_TIMEOUT_MS);

  try {
    const response = await fetch(edgeUrl(supabaseUrl, bindings.functionName), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(
        `${bindings.tickName} non-2xx`,
        sanitizeTickLog({ functionName: bindings.functionName, status: response.status }, secret),
      );
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    const message = error instanceof Error ? error.message : 'unknown';
    console.error(
      `${bindings.tickName} request failed`,
      sanitizeTickLog({ functionName: bindings.functionName, name, message }, secret),
    );
  } finally {
    clearTimeout(timer);
  }
}
