export const TWILIO_STOP_WORDS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
]);

export type TwilioInboundRecord = {
  providerAccountSid: string;
  providerMessageSid: string;
  fromPhoneE164: string;
  toPhoneE164: string;
  body: string;
  isStop: boolean;
};

export type TwilioIngestResult = {
  stored: boolean;
  reason?: string;
  replay?: boolean;
  company_id?: string;
  message_id?: string;
  opted_out?: boolean;
};

export type TwilioWebhookDependencies = {
  authToken: string;
  publicUrl: string;
  ingest: (record: TwilioInboundRecord) => Promise<TwilioIngestResult>;
};

const E164 = /^\+[1-9][0-9]{7,14}$/;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(left: string, right: string): boolean {
  const max = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < max; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

/**
 * Twilio signs form webhooks as HMAC-SHA1(public URL + sorted name/value pairs).
 * The configured public URL is intentional: req.url may contain a proxy URL that
 * differs from the URL Twilio signed.
 */
export async function twilioSignature(
  authToken: string,
  publicUrl: string,
  params: URLSearchParams,
): Promise<string> {
  const grouped = new Map<string, Set<string>>();
  for (const [name, value] of params) {
    const values = grouped.get(name) ?? new Set<string>();
    values.add(value);
    grouped.set(name, values);
  }
  const payload = publicUrl + [...grouped.keys()]
    .sort()
    .flatMap((name) => [...(grouped.get(name) ?? [])].sort().map((value) => `${name}${value}`))
    .join('');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return bytesToBase64(new Uint8Array(digest));
}

export async function isValidTwilioSignature(args: {
  authToken: string;
  publicUrl: string;
  params: URLSearchParams;
  suppliedSignature: string;
}): Promise<boolean> {
  if (!args.suppliedSignature) return false;
  const expected = await twilioSignature(args.authToken, args.publicUrl, args.params);
  return constantTimeEqual(expected, args.suppliedSignature);
}

export function isTwilioStop(body: string, optOutType: string | null): boolean {
  if (optOutType?.trim().toUpperCase() === 'STOP') return true;
  return TWILIO_STOP_WORDS.has(body.trim().toUpperCase());
}

export async function handleTwilioInboundWebhook(
  request: Request,
  dependencies: TwilioWebhookDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  if (!dependencies.authToken || !dependencies.publicUrl) {
    return json({ ok: false, error: 'Webhook is not configured' }, 503);
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/x-www-form-urlencoded')) {
    return json({ ok: false, error: 'Form encoding required' }, 415);
  }

  const params = new URLSearchParams(await request.text());
  const valid = await isValidTwilioSignature({
    authToken: dependencies.authToken,
    publicUrl: dependencies.publicUrl,
    params,
    suppliedSignature: request.headers.get('x-twilio-signature') ?? '',
  });
  if (!valid) return json({ ok: false, error: 'Invalid signature' }, 403);

  const providerAccountSid = params.get('AccountSid')?.trim() ?? '';
  const providerMessageSid = (params.get('MessageSid') || params.get('SmsSid'))?.trim() ?? '';
  const fromPhoneE164 = params.get('From')?.trim() ?? '';
  const toPhoneE164 = params.get('To')?.trim() ?? '';
  const body = params.get('Body') ?? '';
  if (
    !providerAccountSid
    || !providerMessageSid
    || !E164.test(fromPhoneE164)
    || !E164.test(toPhoneE164)
  ) {
    return json({ ok: false, error: 'Invalid Twilio payload' }, 400);
  }

  const result = await dependencies.ingest({
    providerAccountSid,
    providerMessageSid,
    fromPhoneE164,
    toPhoneE164,
    body,
    isStop: isTwilioStop(body, params.get('OptOutType')),
  });
  if (!result.stored && result.reason === 'unknown_destination') {
    return json({ ok: false, error: 'Unknown destination' }, 404);
  }
  if (!result.stored) return json({ ok: false, error: 'Message was not stored' }, 500);

  return new Response('<Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
}
