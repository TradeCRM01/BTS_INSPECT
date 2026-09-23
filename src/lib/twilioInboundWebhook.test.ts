import { describe, expect, it } from 'vitest';
import {
  classifyMissedCallReply,
  handleTwilioInboundWebhook,
  twilioSignature,
  type TwilioInboundRecord,
  type TwilioIngestResult,
} from '../../supabase/functions/_shared/twilioInbound';

const publicUrl = 'https://project.supabase.co/functions/v1/twilio-inbound';
const authToken = 'test_auth_token';

type Sender = { accountSid: string; to: string; companyId: string };
type Outbox = { id: string; companyId: string; to: string; state: 'queued' | 'claimed' | 'cancelled' };

class InMemorySmsStore {
  senders: Sender[] = [];
  messages = new Map<string, TwilioInboundRecord & { companyId: string }>();
  preferences = new Map<string, 'consented' | 'opted_out'>();
  outbox: Outbox[] = [];
  preferenceTransitions = 0;

  ingest = async (record: TwilioInboundRecord): Promise<TwilioIngestResult> => {
    const sender = this.senders.find(
      (candidate) =>
        candidate.accountSid === record.providerAccountSid && candidate.to === record.toPhoneE164,
    );
    if (!sender) return { stored: false, reason: 'unknown_destination' };
    if (this.messages.has(record.providerMessageSid)) {
      return { stored: true, replay: true, organisation_id: sender.companyId };
    }

    this.messages.set(record.providerMessageSid, { ...record, companyId: sender.companyId });
    if (record.isStop) {
      this.preferences.set(`${sender.companyId}:${record.fromPhoneE164}`, 'opted_out');
      this.preferenceTransitions += 1;
      for (const message of this.outbox) {
        if (message.companyId === sender.companyId && message.to === record.fromPhoneE164) {
          message.state = 'cancelled';
        }
      }
    }
    return { stored: true, replay: false, organisation_id: sender.companyId };
  };

  claim(): Outbox | undefined {
    const candidate = this.outbox.find(
      (message) =>
        message.state === 'queued'
        && this.preferences.get(`${message.companyId}:${message.to}`) === 'consented',
    );
    if (candidate) candidate.state = 'claimed';
    return candidate;
  }
}

async function signedRequest(
  values: Record<string, string>,
  signatureToken = authToken,
): Promise<Request> {
  const params = new URLSearchParams(values);
  const signature = await twilioSignature(signatureToken, publicUrl, params);
  return new Request(publicUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: params,
  });
}

function payload(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    AccountSid: 'AC111',
    MessageSid: 'SM111',
    From: '+61412345678',
    To: '+61280000001',
    Body: 'Can somebody call me?',
    ...overrides,
  };
}

describe('Twilio inbound webhook', () => {
  it('requires the explicit booking command and a valid concrete slot', () => {
    expect(classifyMissedCallReply('BOOK 2026-09-23 09:30')).toEqual({
      kind: 'confirmed_slot',
      date: '2026-09-23',
      time: '09:30',
    });
    expect(classifyMissedCallReply('yes')).toEqual({ kind: 'ambiguous' });
    expect(classifyMissedCallReply('Yes, Tuesday works')).toEqual({ kind: 'ambiguous' });
    expect(classifyMissedCallReply('BOOK 2026-02-30 09:30')).toEqual({ kind: 'ambiguous' });
    expect(classifyMissedCallReply('Please call me')).toEqual({ kind: 'noneligible' });
  });

  it('classifies STOP before booking language', () => {
    expect(classifyMissedCallReply('STOP')).toEqual({ kind: 'stop' });
    expect(classifyMissedCallReply('anything', 'STOP')).toEqual({ kind: 'stop' });
  });

  it('classifies exact HELP and START keywords', () => {
    expect(classifyMissedCallReply(' help ')).toEqual({ kind: 'help' });
    expect(classifyMissedCallReply('START')).toEqual({ kind: 'start' });
    expect(classifyMissedCallReply('anything', 'HELP')).toEqual({ kind: 'help' });
    expect(classifyMissedCallReply('anything', 'START')).toEqual({ kind: 'start' });
    expect(classifyMissedCallReply('HELP', 'STOP')).toEqual({ kind: 'stop' });
    expect(classifyMissedCallReply('START BOOK 2026-09-23 09:30')).toEqual({ kind: 'ambiguous' });
  });

  it('matches Twilio’s published HMAC-SHA1 signature example', async () => {
    const params = new URLSearchParams({
      CallSid: 'CA1234567890ABCDE',
      Caller: '+14158675310',
      Digits: '1234',
      From: '+14158675310',
      To: '+18005551212',
    });
    await expect(twilioSignature(
      '12345',
      'https://example.com/myapp.php?foo=1&bar=2',
      params,
    )).resolves.toBe('L/OH5YylLD5NRKLltdqwSvS0BnU=');
  });

  it('rejects a bad signature before touching storage', async () => {
    const store = new InMemorySmsStore();
    store.senders.push({ accountSid: 'AC111', to: '+61280000001', companyId: 'company-a' });
    let calls = 0;
    const request = await signedRequest(payload(), 'wrong_token');

    const response = await handleTwilioInboundWebhook(request, {
      authToken,
      expectedAccountSid: 'AC111',
      publicUrl,
      ingest: async (record) => {
        calls += 1;
        return store.ingest(record);
      },
    });

    expect(response.status).toBe(403);
    expect(calls).toBe(0);
    expect(store.messages.size).toBe(0);
  });

  it('rejects a signed request from a different Twilio account', async () => {
    const store = new InMemorySmsStore();
    const response = await handleTwilioInboundWebhook(
      await signedRequest(payload({ AccountSid: 'AC999' })),
      {
        authToken,
        expectedAccountSid: 'AC111',
        publicUrl,
        ingest: store.ingest,
      },
    );
    expect(response.status).toBe(403);
    expect(store.messages.size).toBe(0);
  });

  it('stores a provider SID once when Twilio replays it', async () => {
    const store = new InMemorySmsStore();
    store.senders.push({ accountSid: 'AC111', to: '+61280000001', companyId: 'company-a' });
    const dependencies = { authToken, expectedAccountSid: 'AC111', publicUrl, ingest: store.ingest };

    expect((await handleTwilioInboundWebhook(await signedRequest(payload()), dependencies)).status).toBe(200);
    expect((await handleTwilioInboundWebhook(await signedRequest(payload()), dependencies)).status).toBe(200);
    expect(store.messages.size).toBe(1);
  });

  it('maps To to one company and keeps the same caller isolated', async () => {
    const store = new InMemorySmsStore();
    store.senders.push(
      { accountSid: 'AC111', to: '+61280000001', companyId: 'company-a' },
      { accountSid: 'AC111', to: '+61280000002', companyId: 'company-b' },
    );
    const response = await handleTwilioInboundWebhook(
      await signedRequest(payload({ MessageSid: 'SM222', To: '+61280000002', Body: 'STOP' })),
      { authToken, expectedAccountSid: 'AC111', publicUrl, ingest: store.ingest },
    );

    expect(response.status).toBe(200);
    expect(store.messages.get('SM222')?.companyId).toBe('company-b');
    expect(store.preferences.get('company-b:+61412345678')).toBe('opted_out');
    expect(store.preferences.has('company-a:+61412345678')).toBe(false);
  });

  it('applies STOP synchronously before a queued message can be claimed', async () => {
    const store = new InMemorySmsStore();
    store.senders.push({ accountSid: 'AC111', to: '+61280000001', companyId: 'company-a' });
    store.outbox.push({
      id: 'out-1',
      companyId: 'company-a',
      to: '+61412345678',
      state: 'queued',
    });

    const dependencies = { authToken, expectedAccountSid: 'AC111', publicUrl, ingest: store.ingest };
    await handleTwilioInboundWebhook(
      await signedRequest(payload({ Body: ' stop ' })),
      dependencies,
    );
    await handleTwilioInboundWebhook(
      await signedRequest(payload({ Body: ' stop ' })),
      dependencies,
    );

    expect(store.preferences.get('company-a:+61412345678')).toBe('opted_out');
    expect(store.preferenceTransitions).toBe(1);
    expect(store.outbox[0]?.state).toBe('cancelled');
    expect(store.claim()).toBeUndefined();
  });
});
