export type ClaimedSms = {
  id: string;
  claim_token: string;
  provider_account_sid: string;
  from_phone_e164: string;
  to_phone_e164: string;
  body: string;
};

export type TwilioSmsWorkerDependencies = {
  workerSecret: string;
  authToken: string;
  workerId: string;
  claim: () => Promise<ClaimedSms | null>;
  authorize: (messageId: string, claimToken: string) => Promise<ClaimedSms | null>;
  complete: (messageId: string, claimToken: string, providerMessageSid: string) => Promise<boolean>;
  fail: (messageId: string, claimToken: string, error: string) => Promise<boolean>;
  send: (message: ClaimedSms, authToken: string) => Promise<string>;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const max = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < max; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export async function sendTwilioSms(message: ClaimedSms, authToken: string): Promise<string> {
  const auth = btoa(`${message.provider_account_sid}:${authToken}`);
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${message.provider_account_sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: message.to_phone_e164,
        From: message.from_phone_e164,
        Body: message.body,
      }),
    },
  );
  const responseBody = await response.text();
  if (!response.ok) throw new Error(`Twilio HTTP ${response.status}: ${responseBody.slice(0, 200)}`);

  const parsed = JSON.parse(responseBody) as { sid?: unknown };
  if (typeof parsed.sid !== 'string' || !parsed.sid) {
    throw new Error('Twilio response did not include a Message SID');
  }
  return parsed.sid;
}

export async function handleTwilioSmsWorker(
  request: Request,
  dependencies: TwilioSmsWorkerDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  if (!dependencies.workerSecret || !dependencies.authToken || !dependencies.workerId) {
    return json({ ok: false, error: 'Worker is not configured' }, 503);
  }
  const suppliedSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!suppliedSecret || !constantTimeEqual(suppliedSecret, dependencies.workerSecret)) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const claimed = await dependencies.claim();
  if (!claimed) return new Response(null, { status: 204 });
  const authorized = await dependencies.authorize(claimed.id, claimed.claim_token);
  if (!authorized) return json({ ok: true, sent: false, reason: 'dispatch_not_authorized' }, 200);

  try {
    const providerMessageSid = await dependencies.send(authorized, dependencies.authToken);
    const completed = await dependencies.complete(
      authorized.id,
      authorized.claim_token,
      providerMessageSid,
    );
    if (!completed) throw new Error('Sent SMS could not be marked complete');
    return json({ ok: true, sent: true, message_id: authorized.id }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider send failed';
    await dependencies.fail(authorized.id, authorized.claim_token, message);
    return json({ ok: false, error: 'SMS send failed' }, 502);
  }
}
