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
  reply: MissedCallReply;
};

export type MissedCallReply =
  | { kind: 'stop' }
  | { kind: 'start' }
  | { kind: 'help' }
  | { kind: 'confirmed_slot'; date: string; time: string }
  | { kind: 'ambiguous' }
  | { kind: 'noneligible' };

export type TwilioIngestResult = {
  stored: boolean;
  reason?: string;
  replay?: boolean;
  organisation_id?: string;
  message_id?: string;
  opted_out?: boolean;
};

export type TwilioWebhookDependencies = {
  authToken: string;
  expectedAccountSid: string;
  publicUrl: string;
  ingest: (record: TwilioInboundRecord) => Promise<TwilioIngestResult>;
};

const E164 = /^\+[1-9][0-9]{7,14}$/;
const MAX_FORM_BYTES = 64 * 1024;

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

async function readLimitedBody(request: Request): Promise<string | null> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FORM_BYTES) return null;
  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FORM_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
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

export function classifyMissedCallReply(
  body: string,
  optOutType: string | null = null,
): MissedCallReply {
  if (isTwilioStop(body, optOutType)) return { kind: 'stop' };

  const providerKeyword = optOutType?.trim().toUpperCase();
  if (providerKeyword === 'START') return { kind: 'start' };
  if (providerKeyword === 'HELP') return { kind: 'help' };

  const keyword = body.trim().toUpperCase();
  if (keyword === 'START') return { kind: 'start' };
  if (keyword === 'HELP') return { kind: 'help' };

  const confirmed = body.trim().match(
    /^BOOK\s+(\d{4})-(\d{2})-(\d{2})\s+(?:AT\s+)?([01]\d|2[0-3]):([0-5]\d)$/i,
  );
  if (confirmed) {
    const [, year, month, day, hour, minute] = confirmed;
    const date = `${year}-${month}-${day}`;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (
      parsed.getUTCFullYear() === Number(year)
      && parsed.getUTCMonth() + 1 === Number(month)
      && parsed.getUTCDate() === Number(day)
    ) {
      return { kind: 'confirmed_slot', date, time: `${hour}:${minute}` };
    }
  }

  if (
    /\b(?:yes|yeah|yep|book|booking|available|works|confirm)\b/i.test(body)
    || /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(body)
    || /\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(body)
  ) {
    return { kind: 'ambiguous' };
  }
  return { kind: 'noneligible' };
}

export async function handleTwilioInboundWebhook(
  request: Request,
  dependencies: TwilioWebhookDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  if (!dependencies.authToken || !dependencies.expectedAccountSid || !dependencies.publicUrl) {
    return json({ ok: false, error: 'Webhook is not configured' }, 503);
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/x-www-form-urlencoded')) {
    return json({ ok: false, error: 'Form encoding required' }, 415);
  }

  const rawBody = await readLimitedBody(request);
  if (rawBody === null) return json({ ok: false, error: 'Payload too large' }, 413);
  const params = new URLSearchParams(rawBody);
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
  if (providerAccountSid !== dependencies.expectedAccountSid) {
    return json({ ok: false, error: 'Invalid Twilio account' }, 403);
  }
  if (
    !providerAccountSid
    || !providerMessageSid
    || !E164.test(fromPhoneE164)
    || !E164.test(toPhoneE164)
  ) {
    return json({ ok: false, error: 'Invalid Twilio payload' }, 400);
  }

  const reply = classifyMissedCallReply(body, params.get('OptOutType'));
  const result = await dependencies.ingest({
    providerAccountSid,
    providerMessageSid,
    fromPhoneE164,
    toPhoneE164,
    body,
    isStop: reply.kind === 'stop',
    reply,
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
