import { describe, expect, it, vi } from 'vitest';
import {
  handleTwilioVoiceStatusWebhook,
  type TwilioVoiceIngestResult,
  type TwilioVoiceStatusRecord,
} from '../../supabase/functions/_shared/twilioVoiceStatus';
import {
  handleTwilioSmsWorker,
  type ClaimedSms,
} from '../../supabase/functions/_shared/twilioSmsWorker';
import { twilioSignature } from '../../supabase/functions/_shared/twilioInbound';

const publicUrl = 'https://project.supabase.co/functions/v1/twilio-voice-status';
const authToken = 'test_auth_token';
const approvedBody = 'Sorry we missed your call. Reply here and our team will get back to you.';

type Sender = { accountSid: string; to: string; companyId: string; id: string };
type StoredCall = TwilioVoiceStatusRecord & {
  companyId: string;
  messageId?: string;
};
type Outbox = ClaimedSms & { companyId: string; state: 'queued' | 'claimed' | 'sent' };

class InMemoryMissedCallStore {
  senders: Sender[] = [];
  calls = new Map<string, StoredCall>();
  consent = new Map<string, 'consented' | 'opted_out'>();
  outbox: Outbox[] = [];

  ingest = async (record: TwilioVoiceStatusRecord): Promise<TwilioVoiceIngestResult> => {
    const existing = this.calls.get(record.providerCallSid);
    if (existing) {
      if (
        existing.providerAccountSid !== record.providerAccountSid
        || existing.fromPhoneE164 !== record.fromPhoneE164
        || existing.toPhoneE164 !== record.toPhoneE164
      ) {
        throw new Error('CallSid conflict');
      }
      return {
        stored: true,
        replay: true,
        organisation_id: existing.companyId,
        message_id: existing.messageId,
        queued: !!existing.messageId,
      };
    }

    const sender = this.senders.find(
      (candidate) =>
        candidate.accountSid === record.providerAccountSid && candidate.to === record.toPhoneE164,
    );
    if (!sender) return { stored: false, reason: 'unknown_destination' };
    const call: StoredCall = { ...record, companyId: sender.companyId };
    this.calls.set(record.providerCallSid, call);

    const eligible = ['busy', 'canceled', 'failed', 'no-answer'].includes(record.callStatus);
    const consented =
      this.consent.get(`${sender.companyId}:${record.fromPhoneE164}`) === 'consented';
    if (eligible && consented) {
      const id = `sms-${record.providerCallSid}`;
      call.messageId = id;
      this.outbox.push({
        id,
        companyId: sender.companyId,
        claim_token: `claim-${id}`,
        provider_account_sid: sender.accountSid,
        from_phone_e164: sender.to,
        to_phone_e164: record.fromPhoneE164,
        body: approvedBody,
        state: 'queued',
      });
    }
    return {
      stored: true,
      replay: false,
      organisation_id: sender.companyId,
      message_id: call.messageId,
      queued: !!call.messageId,
    };
  };
}

function voicePayload(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    AccountSid: 'AC111',
    CallSid: `CA${'1'.repeat(32)}`,
    From: '+61412345678',
    To: '+61280000001',
    CallStatus: 'no-answer',
    Direction: 'inbound',
    ...overrides,
  };
}

async function signedVoiceRequest(values: Record<string, string>): Promise<Request> {
  const params = new URLSearchParams(values);
  const signature = await twilioSignature(authToken, publicUrl, params);
  return new Request(publicUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: params,
  });
}

function dependencies(store: InMemoryMissedCallStore) {
  return {
    authToken,
    expectedAccountSid: 'AC111',
    publicUrl,
    ingest: store.ingest,
  };
}

describe('Twilio missed-call status webhook', () => {
  it('deduplicates CallSid and queues exactly one approved text-back', async () => {
    const store = new InMemoryMissedCallStore();
    store.senders.push({
      accountSid: 'AC111',
      to: '+61280000001',
      companyId: 'company-a',
      id: 'sender-a',
    });
    store.consent.set('company-a:+61412345678', 'consented');

    const first = await handleTwilioVoiceStatusWebhook(
      await signedVoiceRequest(voicePayload()),
      dependencies(store),
    );
    const replay = await handleTwilioVoiceStatusWebhook(
      await signedVoiceRequest(voicePayload()),
      dependencies(store),
    );

    expect(first.status).toBe(204);
    expect(replay.status).toBe(204);
    expect(store.calls.size).toBe(1);
    expect(store.outbox).toHaveLength(1);
    expect(store.outbox[0]?.body).toBe(approvedBody);
  });

  it('does not queue when the caller has opted out', async () => {
    const store = new InMemoryMissedCallStore();
    store.senders.push({
      accountSid: 'AC111',
      to: '+61280000001',
      companyId: 'company-a',
      id: 'sender-a',
    });
    store.consent.set('company-a:+61412345678', 'opted_out');

    const response = await handleTwilioVoiceStatusWebhook(
      await signedVoiceRequest(voicePayload()),
      dependencies(store),
    );

    expect(response.status).toBe(204);
    expect(store.calls.size).toBe(1);
    expect(store.outbox).toHaveLength(0);
  });

  it('routes the same caller by destination without crossing companies', async () => {
    const store = new InMemoryMissedCallStore();
    store.senders.push(
      {
        accountSid: 'AC111',
        to: '+61280000001',
        companyId: 'company-a',
        id: 'sender-a',
      },
      {
        accountSid: 'AC111',
        to: '+61280000002',
        companyId: 'company-b',
        id: 'sender-b',
      },
    );
    store.consent.set('company-a:+61412345678', 'opted_out');
    store.consent.set('company-b:+61412345678', 'consented');

    await handleTwilioVoiceStatusWebhook(
      await signedVoiceRequest(voicePayload({
        CallSid: `CA${'2'.repeat(32)}`,
        To: '+61280000002',
      })),
      dependencies(store),
    );

    expect(store.calls.get(`CA${'2'.repeat(32)}`)?.companyId).toBe('company-b');
    expect(store.outbox.map((message) => message.companyId)).toEqual(['company-b']);
  });

  it('rejects a reused CallSid with different call identity', async () => {
    const store = new InMemoryMissedCallStore();
    store.senders.push({
      accountSid: 'AC111',
      to: '+61280000001',
      companyId: 'company-a',
      id: 'sender-a',
    });
    await store.ingest({
      providerAccountSid: 'AC111',
      providerCallSid: `CA${'3'.repeat(32)}`,
      fromPhoneE164: '+61412345678',
      toPhoneE164: '+61280000001',
      callStatus: 'no-answer',
      direction: 'inbound',
    });

    await expect(store.ingest({
      providerAccountSid: 'AC111',
      providerCallSid: `CA${'3'.repeat(32)}`,
      fromPhoneE164: '+61499999999',
      toPhoneE164: '+61280000001',
      callStatus: 'no-answer',
      direction: 'inbound',
    })).rejects.toThrow('CallSid conflict');
  });
});

describe('missed-call SMS worker', () => {
  it('checks consent after claim and does not send after STOP', async () => {
    const message: ClaimedSms = {
      id: 'sms-1',
      claim_token: 'claim-1',
      provider_account_sid: 'AC111',
      from_phone_e164: '+61280000001',
      to_phone_e164: '+61412345678',
      body: approvedBody,
    };
    const send = vi.fn();
    const response = await handleTwilioSmsWorker(
      new Request('https://worker.test', {
        method: 'POST',
        headers: { authorization: 'Bearer worker-secret' },
      }),
      {
        workerSecret: 'worker-secret',
        authToken,
        workerId: 'test-worker',
        claim: async () => message,
        authorize: async () => null,
        complete: async () => true,
        fail: async () => true,
        send,
      },
    );

    expect(response.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });

  it('retains the provider Message SID after one authorized send', async () => {
    const message: ClaimedSms = {
      id: 'sms-1',
      claim_token: 'claim-1',
      provider_account_sid: 'AC111',
      from_phone_e164: '+61280000001',
      to_phone_e164: '+61412345678',
      body: approvedBody,
    };
    const complete = vi.fn(async () => true);
    const response = await handleTwilioSmsWorker(
      new Request('https://worker.test', {
        method: 'POST',
        headers: { authorization: 'Bearer worker-secret' },
      }),
      {
        workerSecret: 'worker-secret',
        authToken,
        workerId: 'test-worker',
        claim: async () => message,
        authorize: async () => message,
        complete,
        fail: async () => true,
        send: async () => 'SM123',
      },
    );

    expect(response.status).toBe(200);
    expect(complete).toHaveBeenCalledWith('sms-1', 'claim-1', 'SM123');
  });
});
