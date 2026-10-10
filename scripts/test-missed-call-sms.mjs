import nodeAssert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function pass(name) {
  if (typeof name === 'string' && name.length > 0) {
    console.log(`pass: ${name}`);
  }
}

const assert = {
  equal(actual, expected, message) {
    nodeAssert.equal(actual, expected, message);
    pass(message);
  },
  deepEqual(actual, expected, message) {
    nodeAssert.deepEqual(actual, expected, message);
    pass(message);
  },
  ok(value, message) {
    nodeAssert.ok(value, message);
    pass(message);
  },
  match(actual, expected, message) {
    nodeAssert.match(actual, expected, message);
    pass(message);
  },
};

const TEST_MOBILE = '+61418893602';
const SENDER_A = '+15555550101';
const SENDER_B = '+15555550102';
const SENDER_C = '+15555550103';
const DENIED_START_PHONE = '+15555550009';
const CONCURRENT_PHONE = '+15555550008';
const REJECT_UNKNOWN = '+15555550088';
const REJECT_LANDLINE = '+12125550100';
const REJECT_INTL = '+447911111111';
const REJECT_PLACEHOLDER = '+266696687';
const MISMATCH_FROM = '+15555550999';
const CONFLICT_FROM = '+15555550998';

const url = process.env.SUPABASE_URL || 'http://127.0.0.1:55321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!serviceKey || !anonKey) {
  throw new Error('Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY for the test database.');
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = randomUUID().slice(0, 8);
const organisationA = randomUUID();
const organisationB = randomUUID();
const organisationC = randomUUID();
const userPassword = `Sms-${randomUUID()}-1a!`;
const users = [];

async function must(query, label) {
  const result = await query;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function createTenant(organisationId, label) {
  const email = `sms-${label}-${suffix}@example.test`;
  const created = await must(
    admin.auth.admin.createUser({ email, password: userPassword, email_confirm: true }),
    `create ${label} auth user`,
  );
  users.push(created.user.id);
  await must(admin.from('companies').insert({ id: organisationId, name: `SMS test ${label}` }), `create ${label} company`);
  await must(
    admin.from('profiles').insert({
      id: created.user.id,
      email,
      name: `SMS ${label}`,
      company_id: organisationId,
      role: 'admin',
    }),
    `create ${label} profile`,
  );
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await must(client.auth.signInWithPassword({ email, password: userPassword }), `sign in ${label}`);
  return { client, userId: created.user.id };
}

function normalizeKeyword(body) {
  return body.trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function ingest({ sid, to, from = TEST_MOBILE, body = 'Hello' }) {
  const keyword = normalizeKeyword(body);
  const stop = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPT OUT', 'OPTOUT'].includes(keyword);
  const start = keyword === 'START';
  const help = keyword === 'HELP';
  const confirmed = body.trim().match(/^BOOK\s+(\d{4}-\d{2}-\d{2})\s+(?:AT\s+)?(\d{2}:\d{2})$/i);
  const replyKind = stop
    ? 'stop'
    : start
      ? 'start'
      : help
        ? 'help'
        : confirmed
          ? 'confirmed_slot'
          : /\b(?:yes|book|booking|available|works|confirm)\b/i.test(body)
            ? 'ambiguous'
            : 'noneligible';
  return must(
    admin.rpc('ingest_twilio_inbound_sms', {
      p_provider_account_sid: `AC${suffix}`,
      p_provider_message_sid: sid,
      p_from_phone_e164: from,
      p_to_phone_e164: to,
      p_body: body,
      p_is_stop: stop,
      p_reply_kind: replyKind,
      p_booking_date: confirmed?.[1] ?? null,
      p_booking_time: confirmed?.[2] ?? null,
    }),
    `ingest ${sid}`,
  );
}

async function ingestCall({ sid, to, from = TEST_MOBILE, status = 'no-answer' }) {
  return must(
    admin.rpc('ingest_twilio_voice_status', {
      p_provider_account_sid: `AC${suffix}`,
      p_provider_call_sid: sid,
      p_from_phone_e164: from,
      p_to_phone_e164: to,
      p_call_status: status,
      p_direction: 'inbound',
    }),
    `ingest call ${sid}`,
  );
}

try {
  const tenantA = await createTenant(organisationA, 'a');
  const tenantB = await createTenant(organisationB, 'b');
  const tenantC = await createTenant(organisationC, 'c');
  const clientA = tenantA.client;
  const clientB = tenantB.client;
  const clientC = tenantC.client;
  const senderA = randomUUID();
  const senderB = randomUUID();
  const senderC = randomUUID();
  await must(
    admin.from('organisation_twilio_senders').insert([
      {
        id: senderA,
        organisation_id: organisationA,
        phone_e164: SENDER_A,
        provider_account_sid: `AC${suffix}`,
        provider_sender_sid: `PN${suffix}A`,
      },
      {
        id: senderB,
        organisation_id: organisationB,
        phone_e164: SENDER_B,
        provider_account_sid: `AC${suffix}`,
        provider_sender_sid: `PN${suffix}B`,
      },
      {
        id: senderC,
        organisation_id: organisationC,
        phone_e164: SENDER_C,
        provider_account_sid: `AC${suffix}`,
        provider_sender_sid: `PN${suffix}C`,
      },
    ]),
    'insert sender mappings',
  );
  const settingsRow = {
    enabled: true,
    test_mode: true,
    test_allowlist: [TEST_MOBILE],
    business_name: 'Twenty Character Nam',
    daily_message_cap: 20,
    hourly_message_cap: 10,
    monthly_message_cap: 300,
    ack_ttl_minutes: 30,
  };
  await must(
    admin.from('sms_automation_settings').insert([
      { organisation_id: organisationA, ...settingsRow },
      { organisation_id: organisationB, ...settingsRow },
      { organisation_id: organisationC, ...settingsRow },
    ]),
    'insert automation settings',
  );

  const deniedStartPhone = DENIED_START_PHONE;
  const deniedStart = await ingest({
    sid: `SM${suffix}DENIEDSTART`,
    to: SENDER_A,
    from: deniedStartPhone,
    body: 'START',
  });
  assert.equal(deniedStart.start_allowed, false, 'START cannot manufacture first-time consent');
  const deniedPreference = await must(
    admin.from('communication_preferences')
      .select('phone_e164')
      .eq('organisation_id', organisationA)
      .eq('phone_e164', deniedStartPhone),
    'read denied START preference',
  );
  assert.equal(deniedPreference.length, 0, 'denied START does not create a consent preference');
  const deniedStartAudit = await must(
    admin.from('communication_preference_events')
      .select('previous_status, resulting_status, transition_source')
      .eq('inbound_message_id', deniedStart.message_id)
      .single(),
    'read denied START audit',
  );
  assert.deepEqual(deniedStartAudit, {
    previous_status: null,
    resulting_status: 'unknown',
    transition_source: 'twilio_inbound_start_denied',
  }, 'denied START is still auditable');

  const concurrentPhone = CONCURRENT_PHONE;
  await must(
    admin.from('communication_preferences').insert({
      organisation_id: organisationB,
      phone_e164: concurrentPhone,
      sms_consent_status: 'consented',
      consent_basis: 'express',
      consent_source: 'integration_test',
      consented_at: new Date().toISOString(),
    }),
    'record concurrent consent fixture',
  );
  await Promise.all([
    ingest({
      sid: `SM${suffix}CONCURRENTSTOP`,
      to: SENDER_B,
      from: concurrentPhone,
      body: 'STOP',
    }),
    ingest({
      sid: `SM${suffix}CONCURRENTSTART`,
      to: SENDER_B,
      from: concurrentPhone,
      body: 'START',
    }),
  ]);
  const concurrentAudits = await must(
    admin.from('communication_preference_events')
      .select('event_kind')
      .eq('organisation_id', organisationB)
      .eq('phone_e164', concurrentPhone),
    'read concurrent consent audits',
  );
  assert.deepEqual(
    new Set(concurrentAudits.map((event) => event.event_kind)),
    new Set(['stop', 'start']),
    'concurrent STOP and START serialize without losing either audit',
  );

  const unknownConsentId = randomUUID();
  await must(
    admin.from('sms_messages').insert({
      id: unknownConsentId,
      organisation_id: organisationA,
      sender_id: senderA,
      direction: 'outbound',
      state: 'queued',
      from_phone_e164: SENDER_A,
      to_phone_e164: REJECT_UNKNOWN,
      body: 'Unknown consent fixture',
      idempotency_key: `test:${suffix}:unknown-consent`,
      next_attempt: new Date(0).toISOString(),
    }),
    'queue unknown-consent fixture',
  );
  const unknownConsentClaim = await must(admin.rpc('claim_next_sms_message', {
    p_worker_id: 'consent-test',
    p_lease_seconds: 60,
  }), 'claim unknown-consent fixture');
  assert.equal(unknownConsentClaim.length, 0, 'unknown consent cannot be claimed');
  const unknownConsentRow = await must(
    admin.from('sms_messages').select('state, last_error').eq('id', unknownConsentId).single(),
    'read unknown-consent fixture after claim',
  );
  assert.deepEqual(
    unknownConsentRow,
    { state: 'cancelled', last_error: 'not_au_mobile' },
    'placeholder dest is cancelled before claim',
  );
  await must(admin.from('sms_messages').delete().eq('id', unknownConsentId), 'remove unknown-consent fixture');

  const mismatchedSender = await admin.from('sms_messages').insert({
    organisation_id: organisationA,
    sender_id: senderA,
    direction: 'outbound',
    state: 'queued',
    from_phone_e164: MISMATCH_FROM,
    to_phone_e164: REJECT_UNKNOWN,
    body: 'Mismatched sender fixture',
    idempotency_key: `test:${suffix}:mismatch`,
  });
  assert.ok(mismatchedSender.error, 'outbound From must match its mapped sender');
  await must(
    admin.from('organisation_twilio_senders').update({ active: false }).eq('id', senderA),
    'disable sender fixture',
  );
  const inactiveSender = await admin.from('sms_messages').insert({
    organisation_id: organisationA,
    sender_id: senderA,
    direction: 'outbound',
    state: 'queued',
    from_phone_e164: SENDER_A,
    to_phone_e164: REJECT_UNKNOWN,
    body: 'Inactive sender fixture',
    idempotency_key: `test:${suffix}:inactive`,
  });
  assert.ok(inactiveSender.error, 'inactive senders cannot queue messages');
  await must(
    admin.from('organisation_twilio_senders').update({ active: true }).eq('id', senderA),
    'restore sender fixture',
  );

  const replaySid = `SM${suffix}REPLAY`;
  await ingest({ sid: replaySid, to: SENDER_A });
  const replay = await ingest({ sid: replaySid, to: SENDER_A });
  assert.equal(replay.replay, true, 'provider SID replay is acknowledged');
  const replayRows = await must(
    admin.from('sms_messages').select('id').eq('provider_message_sid', replaySid),
    'read replay rows',
  );
  assert.equal(replayRows.length, 1, 'provider SID is stored once');
  await must(admin.from('organisation_twilio_senders').update({ active: false }).eq('id', senderA), 'retire replay sender');
  const retiredReplay = await ingest({ sid: replaySid, to: SENDER_A });
  assert.deepEqual(
    { stored: retiredReplay.stored, reason: retiredReplay.reason },
    { stored: false, reason: 'unknown_destination' },
    'retired sender is unknown on the companies ingest path',
  );
  const retiredReplayRows = await must(
    admin.from('sms_messages').select('id').eq('provider_message_sid', replaySid),
    'read retired replay rows',
  );
  assert.equal(retiredReplayRows.length, 1, 'replay remains idempotent after sender retirement');
  await must(admin.from('organisation_twilio_senders').update({ active: true }).eq('id', senderA), 'restore replay sender');
  const forgedAutomation = await clientA.from('jobs').insert({
    company_id: organisationA,
    title: 'Must not persist',
    created_by: null,
    created_via: 'missed_call_sms',
    automation_ref: replayRows[0].id,
  });
  assert.ok(forgedAutomation.error, 'authenticated users cannot forge automation provenance');

  const organisationBSid = `SM${suffix}B`;
  await ingest({ sid: organisationBSid, to: SENDER_B });
  const rowsA = await must(clientA.from('sms_messages').select('organisation_id'), 'organisation A RLS read');
  const rowsB = await must(clientB.from('sms_messages').select('organisation_id'), 'organisation B RLS read');
  assert.ok(rowsA.length > 0 && rowsA.every((row) => row.organisation_id === organisationA), 'organisation A sees only A');
  assert.ok(rowsB.length > 0 && rowsB.every((row) => row.organisation_id === organisationB), 'organisation B sees only B');
  const forbiddenWrite = await clientA.from('sms_messages').insert({
    organisation_id: organisationA,
    sender_id: senderA,
    direction: 'outbound',
    state: 'queued',
    from_phone_e164: SENDER_A,
    to_phone_e164: REJECT_UNKNOWN,
    body: 'must not persist',
    idempotency_key: `test:${suffix}:forbidden`,
  });
  assert.ok(forbiddenWrite.error, 'authenticated clients cannot write the SMS ledger');
  const forbiddenClaim = await clientA.rpc('claim_next_sms_message', {
    p_worker_id: 'browser',
    p_lease_seconds: 60,
  });
  assert.ok(forbiddenClaim.error, 'authenticated clients cannot claim the outbox');

  const stoppedOutbound = randomUUID();
  await must(
    admin.from('communication_preferences').insert({
      organisation_id: organisationB,
      phone_e164: TEST_MOBILE,
      sms_consent_status: 'consented',
      consent_basis: 'express',
      consent_source: 'integration_test',
      consented_at: new Date().toISOString(),
    }),
    'record STOP fixture consent',
  );
  await must(
    admin.from('sms_messages').insert({
      id: stoppedOutbound,
      organisation_id: organisationB,
      sender_id: senderB,
      direction: 'outbound',
      state: 'queued',
      from_phone_e164: SENDER_B,
      to_phone_e164: TEST_MOBILE,
      body: 'Dormant Phase 1 fixture',
      idempotency_key: `test:${suffix}:stopped`,
      next_attempt: new Date(0).toISOString(),
    }),
    'queue STOP fixture',
  );
  const beforeStop = await must(admin.rpc('claim_next_sms_message', {
    p_worker_id: 'stop-test',
    p_lease_seconds: 60,
  }), 'claim before STOP');
  const stoppedLease = beforeStop.find((row) => row.id === stoppedOutbound);
  assert.ok(stoppedLease?.claim_token, 'STOP fixture is leased before opt-out');
  await ingest({ sid: `SM${suffix}STOP`, to: SENDER_B, body: 'Stop.' });
  const cancelled = await must(
    admin.from('sms_messages').select('state').eq('id', stoppedOutbound).single(),
    'read STOP fixture',
  );
  assert.equal(cancelled.state, 'cancelled', 'STOP cancels queued work synchronously');
  const stoppedDispatch = await must(admin.rpc('authorize_sms_dispatch', {
    p_message_id: stoppedOutbound,
    p_claim_token: stoppedLease.claim_token,
  }), 'authorize after STOP');
  assert.equal(stoppedDispatch.length, 0, 'STOP revokes an existing lease before dispatch');

  const callSid = `CA${suffix.padEnd(32, 'a')}`;
  const firstCall = await ingestCall({ sid: callSid, to: SENDER_A });
  const replayCall = await ingestCall({ sid: callSid, to: SENDER_A });
  assert.equal(firstCall.queued, true, 'unknown preference still queues an ack');
  assert.equal(replayCall.replay, true, 'CallSid replay is acknowledged');
  const ackPreference = await must(
    admin.from('communication_preferences')
      .select('sms_consent_status')
      .eq('organisation_id', organisationA)
      .eq('phone_e164', TEST_MOBILE),
    'read ack preference',
  );
  assert.equal(ackPreference.length, 0, 'ack does not manufacture consented');
  const callRows = await must(
    admin.from('missed_calls').select('organisation_id, outbound_message_id').eq('provider_call_sid', callSid),
    'read deduplicated call',
  );
  assert.equal(callRows.length, 1, 'CallSid is stored once');
  const callOutbox = await must(
    admin.from('sms_messages').select('id, body, state, purpose, segments, payload_hash').eq('idempotency_key', `missed-call-ack:${callSid}`),
    'read missed-call outbox',
  );
  assert.equal(callOutbox.length, 1, 'missed call queues exactly one outbox row');
  assert.equal(callOutbox[0].purpose, 'missed_call_ack', 'ack stores purpose');
  assert.equal(callOutbox[0].segments, 1, 'ack is one GSM-7 segment');
  assert.ok(callOutbox[0].payload_hash, 'ack stores payload_hash');
  assert.equal(
    callOutbox[0].body,
    'Hi, this is Twenty Character Nam. Sorry we missed your call. Reply with what you need done and your suburb and we will get back to you. Reply STOP to opt out.',
    'missed call uses the approved text-back',
  );
  const conflict = await admin.rpc('ingest_twilio_voice_status', {
    p_provider_account_sid: `AC${suffix}`,
    p_provider_call_sid: callSid,
    p_from_phone_e164: CONFLICT_FROM,
    p_to_phone_e164: SENDER_A,
    p_call_status: 'no-answer',
    p_direction: 'inbound',
  });
  assert.ok(conflict.error, 'CallSid cannot be reused for a different call identity');

  await must(
    admin.from('sms_automation_settings').update({ business_name: 'Other Business Name' }).eq('organisation_id', organisationA),
    'change ack payload',
  );
  const hashConflict = await admin.rpc('ingest_twilio_voice_status', {
    p_provider_account_sid: `AC${suffix}`,
    p_provider_call_sid: callSid,
    p_from_phone_e164: TEST_MOBILE,
    p_to_phone_e164: SENDER_A,
    p_call_status: 'no-answer',
    p_direction: 'inbound',
  });
  assert.match(
    hashConflict.error?.message ?? '',
    /payload hash/,
    'replay with a different payload raises',
  );
  await must(
    admin.from('sms_automation_settings').update({ business_name: 'Twenty Character Nam' }).eq('organisation_id', organisationA),
    'restore business name',
  );

  const stoppedCallSid = `CA${`${suffix}b`.padEnd(32, 'b')}`;
  const stoppedCall = await ingestCall({ sid: stoppedCallSid, to: SENDER_B });
  assert.equal(stoppedCall.queued, false, 'STOP preference blocks queueing');
  const stoppedPreference = await must(
    admin.from('communication_preferences')
      .select('sms_consent_status')
      .eq('organisation_id', organisationB)
      .eq('phone_e164', TEST_MOBILE)
      .single(),
    'read STOP preference after missed call',
  );
  assert.equal(stoppedPreference.sms_consent_status, 'opted_out', 'missed call never flips opted_out');
  const stoppedCallOutbox = await must(
    admin.from('sms_messages').select('id').eq('idempotency_key', `missed-call-ack:${stoppedCallSid}`),
    'read STOP-blocked outbox',
  );
  assert.equal(stoppedCallOutbox.length, 0, 'STOP creates no outbound row');

  const restart = await ingest({
    sid: `SM${suffix}START`,
    to: SENDER_B,
    body: 'START',
  });
  assert.equal(restart.start_allowed, true, 'START restores a previously consented recipient');
  const restartedPreference = await must(
    admin.from('communication_preferences')
      .select('sms_consent_status, consent_basis, consent_source, opted_out_at')
      .eq('organisation_id', organisationB)
      .eq('phone_e164', TEST_MOBILE)
      .single(),
    'read START-restored preference',
  );
  assert.deepEqual(restartedPreference, {
    sms_consent_status: 'consented',
    consent_basis: 'express',
    consent_source: 'integration_test',
    opted_out_at: null,
  }, 'START preserves the original consent provenance while clearing STOP');
  const startAudit = await must(
    admin.from('communication_preference_events')
      .select('previous_status, resulting_status, transition_source')
      .eq('inbound_message_id', restart.message_id)
      .single(),
    'read START audit event',
  );
  assert.deepEqual(startAudit, {
    previous_status: 'opted_out',
    resulting_status: 'consented',
    transition_source: 'twilio_inbound_start',
  }, 'START records auditable transition provenance');
  const restartReply = await must(
    admin.from('sms_messages')
      .select('body')
      .eq('idempotency_key', `missed-call-reply:${restart.message_id}`)
      .single(),
    'read START reply without thread',
  );
  assert.match(restartReply.body, /Text HELP/, 'START without a thread does not invite a dead-end ladder reply');

  const missedCallsA = await must(clientA.from('missed_calls').select('organisation_id'), 'organisation A missed-call read');
  const missedCallsB = await must(clientB.from('missed_calls').select('organisation_id'), 'organisation B missed-call read');
  assert.ok(
    missedCallsA.length > 0 && missedCallsA.every((row) => row.organisation_id === organisationA),
    'organisation A sees only its missed calls',
  );
  assert.ok(
    missedCallsB.length > 0 && missedCallsB.every((row) => row.organisation_id === organisationB),
    'organisation B sees only its missed calls',
  );

  const missedCallClaim = await must(admin.rpc('claim_next_sms_message', {
    p_worker_id: 'missed-call-worker-test',
    p_lease_seconds: 60,
  }), 'claim missed-call text-back');
  const claimedTextBack = missedCallClaim.find((row) => row.id === callOutbox[0].id);
  assert.ok(claimedTextBack?.claim_token, 'worker claims the queued text-back');
  const authorizedTextBack = await must(admin.rpc('authorize_sms_dispatch', {
    p_message_id: claimedTextBack.id,
    p_claim_token: claimedTextBack.claim_token,
  }), 'authorize missed-call text-back');
  assert.equal(authorizedTextBack.length, 1, 'consent is checked again before send');
  const completedTextBack = await must(admin.rpc('complete_sms_dispatch', {
    p_message_id: claimedTextBack.id,
    p_claim_token: claimedTextBack.claim_token,
    p_provider_message_sid: `SM${suffix}TEXTBACK`,
  }), 'complete missed-call text-back');
  assert.equal(completedTextBack, true, 'worker records successful dispatch');
  const sentTextBack = await must(
    admin.from('sms_messages').select('state, provider_message_sid').eq('id', claimedTextBack.id).single(),
    'read sent text-back',
  );
  assert.deepEqual(
    sentTextBack,
    { state: 'sent', provider_message_sid: `SM${suffix}TEXTBACK` },
    'sent state retains the provider Message SID',
  );

  const help = await ingest({
    sid: `SM${suffix}HELP`,
    to: SENDER_A,
    body: 'HELP',
  });
  assert.equal(help.qualification_step, 'job_service', 'HELP does not skip the qualification ladder');
  const helpReply = await must(
    admin.from('sms_messages')
      .select('body, state')
      .eq('idempotency_key', `missed-call-reply:${help.message_id}`)
      .single(),
    'read HELP reply',
  );
  assert.equal(helpReply.state, 'queued', 'HELP queues a reply through the shared SMS outbox');
  assert.equal(/BOOK/i.test(helpReply.body), false, 'HELP copy has no BOOK');
  assert.match(helpReply.body, /Twenty Character Nam/, 'HELP names the business');
  assert.match(helpReply.body, /STOP/, 'HELP still names STOP');
  assert.match(helpReply.body, /START/, 'HELP still names START');

  const jobReply = await ingest({
    sid: `SM${suffix}JOB`,
    to: SENDER_A,
    body: 'Leaking hot water service today',
  });
  assert.equal(jobReply.qualification_step, 'job_service', 'new threads keep the ladder dormant');
  assert.equal(jobReply.command_id, null, 'ordinary reply creates no booking command');
  const dormantThread = await must(
    admin.from('missed_call_sms_threads')
      .select('qualification_required')
      .eq('id', jobReply.thread_id)
      .single(),
    'read dormant qualification flag',
  );
  assert.equal(dormantThread.qualification_required, false, 'new threads default qualification_required false');
  const thanks = await must(
    admin.from('sms_messages')
      .select('body, purpose, state')
      .eq('idempotency_key', `enquiry-thanks:${jobReply.thread_id}`)
      .single(),
    'read enquiry thanks',
  );
  assert.equal(thanks.purpose, 'enquiry_thanks', 'first reply queues enquiry thanks');
  assert.equal(thanks.state, 'queued', 'thanks is queued once');
  assert.match(thanks.body, /Twenty Character Nam/, 'thanks names the business');
  assert.match(thanks.body, /STOP/, 'thanks includes STOP');

  const bookingDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const bookingReply = await ingest({
    sid: `SM${suffix}BOOK`,
    to: SENDER_A,
    body: `BOOK ${bookingDate} 09:30`,
  });
  assert.equal(bookingReply.command_id, null, 'BOOK is stored as text and creates no command');
  assert.equal(bookingReply.reply_kind, 'confirmed_slot', 'classifier still names the BOOK shape');
  assert.equal(bookingReply.review_reason, 'ambiguous', 'BOOK reply lands in office review as ambiguous');
  const bookReview = await must(
    admin.from('missed_call_office_reviews')
      .select('reason')
      .eq('inbound_message_id', bookingReply.message_id)
      .single(),
    'read BOOK office review',
  );
  assert.equal(bookReview.reason, 'ambiguous', 'BOOK office review reason is ambiguous');
  const commandsAfterBook = await must(
    admin.from('missed_call_booking_commands').select('id').eq('organisation_id', organisationA),
    'count booking commands after BOOK',
  );
  assert.equal(commandsAfterBook.length, 0, 'BOOK reply leaves 0 booking commands');
  const autoJobs = await must(
    admin.from('jobs').select('id').eq('company_id', organisationA).eq('created_via', 'missed_call_sms'),
    'count automated jobs after BOOK',
  );
  assert.equal(autoJobs.length, 0, 'BOOK reply leaves 0 jobs');
  const blockedInsert = await admin.from('missed_call_booking_commands').insert({
    organisation_id: organisationA,
    thread_id: bookingReply.thread_id,
    inbound_message_id: bookingReply.message_id,
    command_kind: 'book_confirmed_slot',
    booking_date: bookingDate,
    booking_time: '09:30',
    payload_hash: `blocked-${suffix}`,
  });
  assert.match(
    blockedInsert.error?.message ?? '',
    /auto-book disabled/,
    'trigger blocks booking command inserts',
  );
  const disabledWorker = await admin.rpc('process_next_missed_call_booking', {
    p_worker_id: 'booking-test',
  });
  assert.match(
    disabledWorker.error?.message ?? '',
    /auto-book disabled/,
    'booking worker raises auto-book disabled',
  );

  const ladderCallSid = `CA${`${suffix}e`.padEnd(32, 'e')}`;
  await ingestCall({ sid: ladderCallSid, to: SENDER_A });
  const ladderOpen = await ingest({
    sid: `SM${suffix}LADDEROPEN`,
    to: SENDER_A,
    body: 'Need a time',
  });
  await must(
    admin.from('missed_call_sms_threads').update({
      qualification_required: true,
      qualification_step: 'job_service',
      state: 'awaiting_reply',
    }).eq('id', ladderOpen.thread_id),
    'keep one thread on the PR-E ladder',
  );
  const ladderJob = await ingest({
    sid: `SM${suffix}LADDERJOB`,
    to: SENDER_A,
    body: 'Leaking hot water service today',
  });
  assert.equal(ladderJob.qualification_step, 'urgency', 'kept ladder advances on job or service');
  const ladderUrgency = await ingest({
    sid: `SM${suffix}LADDERURG`,
    to: SENDER_A,
    body: '2',
  });
  assert.equal(ladderUrgency.qualification_step, 'contact_area', 'kept ladder advances on numbered urgency');
  const ladderContact = await ingest({
    sid: `SM${suffix}LADDERWHO`,
    to: SENDER_A,
    body: 'Jack, Newtown',
  });
  assert.equal(ladderContact.qualification_step, 'time_window', 'kept ladder advances on name and area');
  const ladderQualified = await ingest({
    sid: `SM${suffix}LADDERWHEN`,
    to: SENDER_A,
    body: 'Weekdays 2-4pm',
  });
  assert.equal(ladderQualified.qualified, true, 'kept ladder still completes qualification');
  const ladderBook = await ingest({
    sid: `SM${suffix}LADDERBOOK`,
    to: SENDER_A,
    body: `BOOK ${bookingDate} 09:30`,
  });
  assert.equal(ladderBook.command_id, null, 'qualified BOOK still creates no command');
  assert.equal(ladderBook.review_reason, 'ambiguous', 'qualified BOOK still lands as ambiguous');
  const ladderCommands = await must(
    admin.from('missed_call_booking_commands').select('id').eq('thread_id', ladderOpen.thread_id),
    'count commands on the kept ladder thread',
  );
  assert.equal(ladderCommands.length, 0, 'kept ladder BOOK leaves 0 commands');

  const bookedStop = await ingest({
    sid: `SM${suffix}BOOKEDSTOP`,
    to: SENDER_A,
    body: 'STOP',
  });
  assert.equal(bookedStop.reply_kind, 'stop', 'STOP still wins after a BOOK reply');
  const bookedStart = await ingest({
    sid: `SM${suffix}BOOKEDSTART`,
    to: SENDER_A,
    body: 'START',
  });
  assert.equal(bookedStart.start_allowed, true, 'START can restore consent after STOP');

  const commandsA = await must(
    clientA.from('missed_call_booking_commands').select('organisation_id'),
    'organisation A booking command read',
  );
  const commandsB = await must(
    clientB.from('missed_call_booking_commands').select('organisation_id'),
    'organisation B booking command read',
  );
  assert.equal(commandsA.length, 0, 'organisation A has no booking commands');
  assert.equal(commandsB.length, 0, 'organisation B has no booking commands');
  const threadsA = await must(clientA.from('missed_call_sms_threads').select('organisation_id'), 'organisation A thread read');
  const threadsB = await must(clientB.from('missed_call_sms_threads').select('organisation_id'), 'organisation B thread read');
  assert.ok(threadsA.length > 0 && threadsA.every((row) => row.organisation_id === organisationA), 'organisation A sees only A threads');
  assert.equal(threadsB.length, 0, 'organisation B cannot see organisation A threads');
  const auditA = await must(
    clientA.from('communication_preference_events').select('organisation_id'),
    'organisation A consent audit read',
  );
  const auditB = await must(
    clientB.from('communication_preference_events').select('organisation_id'),
    'organisation B consent audit read',
  );
  assert.ok(auditA.length > 0 && auditA.every((row) => row.organisation_id === organisationA), 'organisation A sees only A consent audits');
  assert.ok(auditB.length > 0 && auditB.every((row) => row.organisation_id === organisationB), 'organisation B sees only B consent audits');

  const stopCallSid = `CA${`${suffix}d`.padEnd(32, 'd')}`;
  await ingestCall({ sid: stopCallSid, to: SENDER_A });
  const beforeThreadStop = await ingest({
    sid: `SM${suffix}PRESTOPHELP`,
    to: SENDER_A,
    body: 'HELP',
  });
  assert.equal(beforeThreadStop.qualification_step, 'job_service', 'HELP stays on the dormant ladder');
  const stopReply = await ingest({
    sid: `SM${suffix}THREADSTOP`,
    to: SENDER_A,
    body: 'STOP',
  });
  const stopReview = await must(
    admin.from('missed_call_office_reviews').select('reason').eq('inbound_message_id', stopReply.message_id).single(),
    'read thread STOP review',
  );
  assert.equal(stopReview.reason, 'stop', 'thread STOP goes to office review without booking');
  const stoppedThread = await must(
    admin.from('missed_call_sms_threads').select('state, qualification_step').eq('id', stopReply.thread_id).single(),
    'read stopped thread',
  );
  assert.equal(stoppedThread.state, 'opted_out', 'STOP advances the thread to opted out');
  assert.equal(stoppedThread.qualification_step, 'job_service', 'STOP preserves the dormant ladder');
  const cancelledHelpPrompt = await must(
    admin.from('sms_messages')
      .select('state')
      .eq('idempotency_key', `missed-call-reply:${beforeThreadStop.message_id}`)
      .single(),
    'read cancelled HELP prompt',
  );
  assert.equal(cancelledHelpPrompt.state, 'cancelled', 'STOP cancels a queued HELP reply');
  const afterStop = await ingest({
    sid: `SM${suffix}AFTERSTOP`,
    to: SENDER_A,
    body: 'Blocked ladder answer',
  });
  assert.equal(afterStop.command_id, null, 'STOP blocks later booking work');
  const threadAfterStop = await must(
    admin.from('missed_call_sms_threads').select('state, qualification_step').eq('id', stopReply.thread_id).single(),
    'read thread after blocked reply',
  );
  assert.deepEqual(threadAfterStop, stoppedThread, 'STOP prevents state progression');
  const blockedPrompt = await must(
    admin.from('sms_messages').select('id').eq('idempotency_key', `missed-call-reply:${afterStop.message_id}`),
    'read blocked post-STOP prompt',
  );
  assert.equal(blockedPrompt.length, 0, 'STOP prevents outbound replies');

  await must(
    admin.from('sms_messages')
      .update({
        state: 'cancelled',
        last_error: 'test_drain',
        next_attempt: null,
        claim_token: null,
        claimed_at: null,
        claim_expires_at: null,
        claimed_by: null,
      })
      .eq('organisation_id', organisationA)
      .in('state', ['queued', 'claimed']),
    'drain organisation A queued outbox before claim race',
  );
  await must(
    admin.from('communication_preferences').update({
      sms_consent_status: 'consented',
      opted_out_at: null,
    }).eq('organisation_id', organisationA).eq('phone_e164', TEST_MOBILE),
    'restore claim fixture consent',
  );
  const claimId = randomUUID();
  await must(
    admin.from('sms_messages').insert({
      id: claimId,
      organisation_id: organisationA,
      sender_id: senderA,
      direction: 'outbound',
      state: 'queued',
      from_phone_e164: SENDER_A,
      to_phone_e164: TEST_MOBILE,
      body: 'Dormant Phase 1 claim fixture',
      idempotency_key: `test:${suffix}:claim`,
      next_attempt: new Date(0).toISOString(),
    }),
    'queue claim fixture',
  );
  const claims = await Promise.all([
    must(admin.rpc('claim_next_sms_message', { p_worker_id: 'worker-a', p_lease_seconds: 60 }), 'worker A claim'),
    must(admin.rpc('claim_next_sms_message', { p_worker_id: 'worker-b', p_lease_seconds: 60 }), 'worker B claim'),
  ]);
  assert.equal(
    claims.flat().filter((row) => row.id === claimId).length,
    1,
    'concurrent workers claim one row once',
  );
  const claimed = claims.flat().find((row) => row.id === claimId);
  await must(
    admin.from('sms_messages').update({
      claim_expires_at: new Date(Date.now() - 1_000).toISOString(),
    }).eq('id', claimId),
    'expire claim fixture',
  );
  const expiredDispatch = await must(admin.rpc('authorize_sms_dispatch', {
    p_message_id: claimId,
    p_claim_token: claimed.claim_token,
  }), 'authorize expired claim');
  assert.equal(expiredDispatch.length, 0, 'expired leases cannot dispatch');

  await must(
    admin.from('sms_messages')
      .update({
        state: 'cancelled',
        last_error: 'test_drain',
        next_attempt: null,
        claim_token: null,
        claimed_at: null,
        claim_expires_at: null,
        claimed_by: null,
      })
      .in('organisation_id', [organisationA, organisationB])
      .in('state', ['queued', 'claimed']),
    'drain A/B outbox before isolated guard fixtures',
  );

  const extraAllowlist = await admin.from('sms_automation_settings').update({
    test_allowlist: [REJECT_UNKNOWN],
  }).eq('organisation_id', organisationC);
  assert.ok(extraAllowlist.error, 'test allowlist cannot contain any number except the pinned mobile');

  const settingsRead = await must(
    clientC.from('sms_automation_settings').select('test_mode, test_allowlist, daily_message_cap').eq('organisation_id', organisationC).single(),
    'tenant can read own automation settings',
  );
  assert.deepEqual(
    settingsRead,
    { test_mode: true, test_allowlist: [TEST_MOBILE], daily_message_cap: 20 },
    'members can read operator-owned settings',
  );
  const tenantCapWrite = await clientC.from('sms_automation_settings').update({
    daily_message_cap: 999,
  }).eq('organisation_id', organisationC).select('daily_message_cap');
  assert.equal(tenantCapWrite.data?.length ?? 0, 0, 'tenant admin cannot update caps');
  const capsUnchanged = await must(
    admin.from('sms_automation_settings').select('daily_message_cap').eq('organisation_id', organisationC).single(),
    'read caps after tenant write',
  );
  assert.equal(capsUnchanged.daily_message_cap, 20, 'tenant admin cap write is rejected by RLS');

  await must(
    admin.from('communication_preferences').insert({
      organisation_id: organisationC,
      phone_e164: TEST_MOBILE,
      sms_consent_status: 'consented',
      consent_basis: 'express',
      consent_source: 'integration_test',
      consented_at: new Date().toISOString(),
    }),
    'record organisation C consent',
  );

  async function restoreCSettings(overrides = {}) {
    await must(admin.from('sms_automation_settings').delete().eq('organisation_id', organisationC), 'clear organisation C settings');
    await must(
      admin.from('sms_automation_settings').insert({
        organisation_id: organisationC,
        ...settingsRow,
        ...overrides,
      }),
      'restore organisation C settings',
    );
  }

  async function drainCOutbox() {
    await must(
      admin.from('sms_messages')
        .update({
          state: 'cancelled',
          last_error: 'test_drain',
          next_attempt: null,
          claim_token: null,
          claimed_at: null,
          claim_expires_at: null,
          claimed_by: null,
        })
        .eq('organisation_id', organisationC)
        .in('state', ['queued', 'claimed', 'sent']),
      'drain organisation C outbox',
    );
  }

  async function queueGuardFixture({ id, to, body, createdAt }) {
    const row = {
      id,
      organisation_id: organisationC,
      sender_id: senderC,
      direction: 'outbound',
      state: 'queued',
      from_phone_e164: SENDER_C,
      to_phone_e164: to,
      body,
      idempotency_key: `test:${suffix}:${id}`,
      next_attempt: new Date(0).toISOString(),
    };
    await must(admin.from('sms_messages').insert(row), `queue ${body}`);
    if (createdAt) {
      await must(
        admin.from('sms_messages').update({ created_at: createdAt }).eq('id', id),
        `backdate ${body}`,
      );
    }
    return id;
  }

  async function claimCancelled(id, reason, label) {
    const claimedRows = await must(admin.rpc('claim_next_sms_message', {
      p_worker_id: `guard-${id.slice(0, 8)}`,
      p_lease_seconds: 60,
    }), `claim ${label}`);
    assert.equal(claimedRows.filter((row) => row.id === id).length, 0, `${label} is not claimed`);
    const row = await must(
      admin.from('sms_messages').select('state, last_error').eq('id', id).single(),
      `read ${label}`,
    );
    assert.deepEqual(row, { state: 'cancelled', last_error: reason }, label);
  }

  await must(
    admin.from('sms_automation_settings').update({ enabled: false }).eq('organisation_id', organisationC),
    'disable organisation C automation',
  );
  const disabledId = randomUUID();
  await queueGuardFixture({ id: disabledId, to: TEST_MOBILE, body: 'Disabled fixture' });
  await claimCancelled(disabledId, 'disabled', 'enabled=false cancels as disabled');

  await must(admin.from('sms_automation_settings').delete().eq('organisation_id', organisationC), 'remove organisation C settings row');
  const missingSettingsId = randomUUID();
  await queueGuardFixture({ id: missingSettingsId, to: TEST_MOBILE, body: 'Missing settings fixture' });
  await claimCancelled(missingSettingsId, 'disabled', 'no settings row cancels as disabled');
  await restoreCSettings();

  const authorizeCancelId = randomUUID();
  await queueGuardFixture({ id: authorizeCancelId, to: TEST_MOBILE, body: 'Authorize cancel fixture' });
  const authorizeClaim = await must(admin.rpc('claim_next_sms_message', {
    p_worker_id: 'authorize-cancel',
    p_lease_seconds: 60,
  }), 'claim authorize-cancel fixture');
  assert.equal(authorizeClaim[0]?.id, authorizeCancelId, 'authorize-cancel fixture is claimed');
  await must(
    admin.from('sms_automation_settings').update({ enabled: false }).eq('organisation_id', organisationC),
    'disable automation after claim',
  );
  const authorizeBlocked = await must(admin.rpc('authorize_sms_dispatch', {
    p_message_id: authorizeCancelId,
    p_claim_token: authorizeClaim[0].claim_token,
  }), 'authorize after disable');
  assert.equal(authorizeBlocked.length, 0, 'authorize cancels when guards fail');
  const authorizeRow = await must(
    admin.from('sms_messages').select('state, last_error').eq('id', authorizeCancelId).single(),
    'read authorize-cancel fixture',
  );
  assert.deepEqual(authorizeRow, { state: 'cancelled', last_error: 'disabled' }, 'authorize cancel path records disabled');
  await restoreCSettings();

  await must(
    admin.from('sms_automation_settings').update({ test_allowlist: [] }).eq('organisation_id', organisationC),
    'clear organisation C allowlist',
  );
  const blockedAllowlistId = randomUUID();
  await queueGuardFixture({
    id: blockedAllowlistId,
    to: TEST_MOBILE,
    body: 'Non-allowlisted fixture',
  });
  await claimCancelled(blockedAllowlistId, 'test_mode_blocked', 'non-allowlisted number is cancelled');
  await must(
    admin.from('sms_automation_settings').update({ test_allowlist: [TEST_MOBILE] }).eq('organisation_id', organisationC),
    'restore organisation C allowlist',
  );

  const landlineId = randomUUID();
  await queueGuardFixture({ id: landlineId, to: REJECT_LANDLINE, body: 'Landline fixture' });
  await claimCancelled(landlineId, 'not_au_mobile', 'landline number is cancelled');

  const intlId = randomUUID();
  await queueGuardFixture({ id: intlId, to: REJECT_INTL, body: 'International fixture' });
  await claimCancelled(intlId, 'not_au_mobile', 'international number is cancelled');

  const placeholderId = randomUUID();
  await queueGuardFixture({ id: placeholderId, to: REJECT_PLACEHOLDER, body: 'Placeholder fixture' });
  await claimCancelled(placeholderId, 'not_au_mobile', 'placeholder number is cancelled');

  const selfLoopId = randomUUID();
  await queueGuardFixture({ id: selfLoopId, to: SENDER_C, body: 'Self-loop sender fixture' });
  await claimCancelled(selfLoopId, 'self_loop', 'sender self-loop is cancelled');

  await must(
    admin.from('companies').update({ phone: TEST_MOBILE }).eq('id', organisationC),
    'set company phone to the test mobile',
  );
  const companyLoopId = randomUUID();
  await queueGuardFixture({ id: companyLoopId, to: TEST_MOBILE, body: 'Self-loop company fixture' });
  await claimCancelled(companyLoopId, 'self_loop', 'company phone self-loop is cancelled');
  await must(
    admin.from('companies').update({ phone: null }).eq('id', organisationC),
    'clear company phone',
  );

  await must(
    admin.from('sms_automation_settings').update({ forward_from_e164: TEST_MOBILE }).eq('organisation_id', organisationC),
    'set forward-from to the test mobile',
  );
  const forwardLoopId = randomUUID();
  await queueGuardFixture({ id: forwardLoopId, to: TEST_MOBILE, body: 'Self-loop forward fixture' });
  await claimCancelled(forwardLoopId, 'self_loop', 'forward-from self-loop is cancelled');
  await must(
    admin.from('sms_automation_settings').update({ forward_from_e164: null }).eq('organisation_id', organisationC),
    'clear forward-from',
  );

  const staleId = randomUUID();
  await queueGuardFixture({
    id: staleId,
    to: TEST_MOBILE,
    body: 'Stale fixture',
    createdAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
  });
  await claimCancelled(staleId, 'stale', 'stale message is cancelled');

  await drainCOutbox();
  await restoreCSettings({ daily_message_cap: 2 });
  const burstOldest = randomUUID();
  const burstMiddle = randomUUID();
  const burstNewest = randomUUID();
  const burstBase = Date.now() - 4_000;
  await queueGuardFixture({
    id: burstOldest,
    to: TEST_MOBILE,
    body: 'Burst oldest',
    createdAt: new Date(burstBase).toISOString(),
  });
  await queueGuardFixture({
    id: burstMiddle,
    to: TEST_MOBILE,
    body: 'Burst middle',
    createdAt: new Date(burstBase + 1_000).toISOString(),
  });
  await queueGuardFixture({
    id: burstNewest,
    to: TEST_MOBILE,
    body: 'Burst newest',
    createdAt: new Date(burstBase + 2_000).toISOString(),
  });
  const burstClaim = await must(admin.rpc('claim_next_sms_message', {
    p_worker_id: 'cap-burst',
    p_lease_seconds: 60,
  }), 'claim cap burst');
  const burstRows = await must(
    admin.from('sms_messages').select('id, state, last_error').in('id', [burstOldest, burstMiddle, burstNewest]),
    'read cap burst rows',
  );
  const burstById = Object.fromEntries(burstRows.map((row) => [row.id, row]));
  assert.deepEqual(
    { state: burstById[burstNewest].state, last_error: burstById[burstNewest].last_error },
    { state: 'cancelled', last_error: 'cap_reached' },
    'cap burst cancels only the newest as cap_reached',
  );
  assert.equal(
    burstRows.filter((row) => row.state === 'cancelled').length,
    1,
    'cap 2 with 3 queued cancels exactly one',
  );
  assert.equal(burstClaim[0]?.id, burstOldest, 'cap burst still claims the oldest');
  assert.ok(['queued', 'claimed'].includes(burstById[burstMiddle].state), 'cap burst keeps the middle claimable');
  assert.equal(burstById[burstOldest].state, 'claimed', 'cap burst keeps the oldest claimable');
  const burstSecond = await must(admin.rpc('claim_next_sms_message', {
    p_worker_id: 'cap-burst-2',
    p_lease_seconds: 60,
  }), 'claim remaining burst row');
  assert.equal(burstSecond[0]?.id, burstMiddle, 'second burst claim takes the remaining claimable row');

  async function expectCapWindow(window, capPatch, label) {
    await drainCOutbox();
    await restoreCSettings(capPatch);
    await must(
      admin.from('agent_reminders').delete().eq('company_id', organisationC).eq('related_type', 'missed_call_sms_cap'),
      `clear ${window} reminders`,
    );
    const firstId = randomUUID();
    await queueGuardFixture({ id: firstId, to: TEST_MOBILE, body: `${label} first` });
    const firstClaim = await must(admin.rpc('claim_next_sms_message', {
      p_worker_id: `${window}-first`,
      p_lease_seconds: 60,
    }), `claim ${window} first`);
    assert.equal(firstClaim[0]?.id, firstId, `${window} first message is claimed`);
    await must(admin.rpc('complete_sms_dispatch', {
      p_message_id: firstId,
      p_claim_token: firstClaim[0].claim_token,
      p_provider_message_sid: `SM${suffix}${window.toUpperCase()}1`,
    }), `complete ${window} first`);
    const overId = randomUUID();
    await queueGuardFixture({ id: overId, to: TEST_MOBILE, body: `${label} over` });
    await claimCancelled(overId, 'cap_reached', `${window} cap cancels the extra send`);
    const reminder = await must(
      admin.from('agent_reminders')
        .select('title')
        .eq('company_id', organisationC)
        .eq('related_type', 'missed_call_sms_cap')
        .single(),
      `read ${window} reminder`,
    );
    assert.equal(
      reminder.title,
      `Missed-call texts paused: ${window} limit reached`,
      `${window} reminder names the window`,
    );
  }

  const withheldSid = `CA${`${suffix}w`.padEnd(32, 'w')}`;
  const withheld = await ingestCall({ sid: withheldSid, to: SENDER_A, from: REJECT_PLACEHOLDER });
  assert.equal(withheld.stored, true, 'withheld caller is stored');
  assert.equal(withheld.queued, false, 'withheld caller queues no SMS');
  const withheldOutbox = await must(
    admin.from('sms_messages').select('id').eq('idempotency_key', `missed-call-ack:${withheldSid}`),
    'read withheld outbox',
  );
  assert.equal(withheldOutbox.length, 0, 'withheld caller creates no outbound row');

  const invalidZone = await admin.from('companies').update({ time_zone: 'Not/AZone' }).eq('id', organisationA);
  assert.ok(invalidZone.error, 'invalid IANA time zone is rejected');

  await expectCapWindow('hourly', { hourly_message_cap: 1 }, 'Hourly');
  await expectCapWindow('daily', { daily_message_cap: 1 }, 'Daily');
  await expectCapWindow('monthly', { monthly_message_cap: 1 }, 'Monthly');

  const sameDayId = randomUUID();
  await queueGuardFixture({ id: sameDayId, to: TEST_MOBILE, body: 'Same-day cap fixture' });
  await claimCancelled(sameDayId, 'cap_reached', 'a second cap hit the same day still cancels');
  const capReminders = await must(
    admin.from('agent_reminders')
      .select('id, title, related_type')
      .eq('company_id', organisationC)
      .eq('related_type', 'missed_call_sms_cap'),
    'read cap reminders',
  );
  assert.equal(capReminders.length, 1, 'hitting a cap gives 1 reminder per day');

  console.log('missed-call SMS database integration tests passed');
} finally {
  const organisations = [organisationA, organisationB, organisationC];
  await admin.from('missed_call_office_reviews').delete().in('organisation_id', organisations);
  await admin.from('communication_preference_events').delete().in('organisation_id', organisations);
  await admin.from('agent_reminders')
    .delete()
    .in('company_id', organisations)
    .eq('related_type', 'missed_call_office_review');
  await admin.from('missed_call_booking_commands').delete().in('organisation_id', organisations);
  await admin.from('missed_call_sms_threads').delete().in('organisation_id', organisations);
  await admin.from('agent_reminders')
    .delete()
    .in('company_id', organisations)
    .in('related_type', ['missed_call_sms_thread', 'missed_call_sms_cap']);
  await admin.from('jobs').delete().in('company_id', organisations);
  await admin.from('clients').delete().in('company_id', organisations);
  await admin.from('missed_calls').delete().in('organisation_id', organisations);
  await admin.from('sms_messages').delete().in('organisation_id', organisations);
  await admin.from('communication_preferences').delete().in('organisation_id', organisations);
  await admin.from('organisation_twilio_senders').delete().in('organisation_id', organisations);
  await admin.from('sms_automation_settings').delete().in('organisation_id', organisations);
  await admin.from('profiles').delete().in('id', users);
  await admin.from('companies').delete().in('id', organisations);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
