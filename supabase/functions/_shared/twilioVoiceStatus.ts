import { isValidTwilioSignature } from './twilioInbound.ts';

const E164 = /^\+[1-9][0-9]{7,14}$/;
const CALL_SID = /^CA[a-fA-F0-9]{32}$/;
const CALL_STATUSES = new Set(['busy', 'canceled', 'completed', 'failed', 'no-answer']);
const MAX_FORM_BYTES = 64 * 1024;

export type TwilioVoiceStatusRecord = {
  providerAccountSid: string;
  providerCallSid: string;
  fromPhoneE164: string;
  toPhoneE164: string;
  callStatus: string;
  direction: 'inbound';
};

export type TwilioVoiceIngestResult = {
  stored: boolean;
  reason?: string;
  replay?: boolean;
  organisation_id?: string;
  call_id?: string;
  message_id?: string;
  queued?: boolean;
};

export type TwilioVoiceWebhookDependencies = {
  authToken: string;
  expectedAccountSid: string;
  publicUrl: string;
  ingest: (record: TwilioVoiceStatusRecord) => Promise<TwilioVoiceIngestResult>;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

export async function handleTwilioVoiceStatusWebhook(
  request: Request,
  dependencies: TwilioVoiceWebhookDependencies,
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
  const providerCallSid = params.get('CallSid')?.trim() ?? '';
  const fromPhoneE164 = (params.get('From') || params.get('Caller'))?.trim() ?? '';
  const toPhoneE164 = (params.get('To') || params.get('Called'))?.trim() ?? '';
  const callStatus = params.get('CallStatus')?.trim().toLowerCase() ?? '';
  const direction = params.get('Direction')?.trim().toLowerCase() ?? '';

  if (providerAccountSid !== dependencies.expectedAccountSid) {
    return json({ ok: false, error: 'Invalid Twilio account' }, 403);
  }
  if (
    !CALL_SID.test(providerCallSid)
    || !E164.test(fromPhoneE164)
    || !E164.test(toPhoneE164)
    || !CALL_STATUSES.has(callStatus)
    || direction !== 'inbound'
  ) {
    return json({ ok: false, error: 'Invalid Twilio payload' }, 400);
  }

  const result = await dependencies.ingest({
    providerAccountSid,
    providerCallSid,
    fromPhoneE164,
    toPhoneE164,
    callStatus,
    direction,
  });
  if (!result.stored && result.reason === 'unknown_destination') {
    return json({ ok: false, error: 'Unknown destination' }, 404);
  }
  if (!result.stored) return json({ ok: false, error: 'Voice status was not stored' }, 500);
  return new Response(null, { status: 204 });
}
