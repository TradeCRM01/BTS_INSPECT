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
    }),
    `create ${label} profile`,
  );
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await must(client.auth.signInWithPassword({ email, password: userPassword }), `sign in ${label}`);
  return { client, userId: created.user.id };
}

async function ingest({ sid, to, from = '+61412345678', body = 'Hello' }) {
  const stop = body.trim().toUpperCase() === 'STOP';
  const start = body.trim().toUpperCase() === 'START';
  const help = body.trim().toUpperCase() === 'HELP';
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

async function ingestCall({ sid, to, from = '+61412345678', status = 'no-answer' }) {
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
  const clientA = tenantA.client;
  const clientB = tenantB.client;
  const senderA = randomUUID();
  const senderB = randomUUID();
  await must(
    admin.from('organisation_twilio_senders').insert([
      {
        id: senderA,
        organisation_id: organisationA,
        phone_e164: '+61280000001',
        provider_account_sid: `AC${suffix}`,
        provider_sender_sid: `PN${suffix}A`,
      },
      {
        id: senderB,
        organisation_id: organisationB,
        phone_e164: '+61280000002',
        provider_account_sid: `AC${suffix}`,
        provider_sender_sid: `PN${suffix}B`,
      },
    ]),
    'insert sender mappings',
  );

  const deniedStartPhone = '+61400000009';
  const deniedStart = await ingest({
    sid: `SM${suffix}DENIEDSTART`,
    to: '+61280000001',
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

  const concurrentPhone = '+61400000008';
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
      to: '+61280000002',
      from: concurrentPhone,
      body: 'STOP',
    }),
    ingest({
      sid: `SM${suffix}CONCURRENTSTART`,
      to: '+61280000002',
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
      from_phone_e164: '+61280000001',
      to_phone_e164: '+61488888888',
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
  await must(admin.from('sms_messages').delete().eq('id', unknownConsentId), 'remove unknown-consent fixture');

  const mismatchedSender = await admin.from('sms_messages').insert({
    organisation_id: organisationA,
    sender_id: senderA,
    direction: 'outbound',
    state: 'queued',
    from_phone_e164: '+61289999999',
    to_phone_e164: '+61477777777',
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
    from_phone_e164: '+61280000001',
    to_phone_e164: '+61477777777',
    body: 'Inactive sender fixture',
    idempotency_key: `test:${suffix}:inactive`,
  });
  assert.ok(inactiveSender.error, 'inactive senders cannot queue messages');
  await must(
    admin.from('organisation_twilio_senders').update({ active: true }).eq('id', senderA),
    'restore sender fixture',
  );

  const replaySid = `SM${suffix}REPLAY`;
  await ingest({ sid: replaySid, to: '+61280000001' });
  const replay = await ingest({ sid: replaySid, to: '+61280000001' });
  assert.equal(replay.replay, true, 'provider SID replay is acknowledged');
  const replayRows = await must(
    admin.from('sms_messages').select('id').eq('provider_message_sid', replaySid),
    'read replay rows',
  );
  assert.equal(replayRows.length, 1, 'provider SID is stored once');
  await must(admin.from('organisation_twilio_senders').update({ active: false }).eq('id', senderA), 'retire replay sender');
  const retiredReplay = await ingest({ sid: replaySid, to: '+61280000001' });
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
  await ingest({ sid: organisationBSid, to: '+61280000002' });
  const rowsA = await must(clientA.from('sms_messages').select('organisation_id'), 'organisation A RLS read');
  const rowsB = await must(clientB.from('sms_messages').select('organisation_id'), 'organisation B RLS read');
  assert.ok(rowsA.length > 0 && rowsA.every((row) => row.organisation_id === organisationA), 'organisation A sees only A');
  assert.ok(rowsB.length > 0 && rowsB.every((row) => row.organisation_id === organisationB), 'organisation B sees only B');
  const forbiddenWrite = await clientA.from('sms_messages').insert({
    organisation_id: organisationA,
    sender_id: senderA,
    direction: 'outbound',
    state: 'queued',
    from_phone_e164: '+61280000001',
    to_phone_e164: '+61411111111',
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
      phone_e164: '+61412345678',
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
      from_phone_e164: '+61280000002',
      to_phone_e164: '+61412345678',
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
  await ingest({ sid: `SM${suffix}STOP`, to: '+61280000002', body: 'STOP' });
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

  await must(
    admin.from('communication_preferences').insert({
      organisation_id: organisationA,
      phone_e164: '+61412345678',
      sms_consent_status: 'consented',
      consent_basis: 'express',
      consent_source: 'integration_test',
      consented_at: new Date().toISOString(),
    }),
    'record missed-call fixture consent',
  );
  const callSid = `CA${suffix.padEnd(32, 'a')}`;
  const firstCall = await ingestCall({ sid: callSid, to: '+61280000001' });
  const replayCall = await ingestCall({ sid: callSid, to: '+61280000001' });
  assert.equal(firstCall.queued, true, 'eligible consented missed call queues a text-back');
  assert.equal(replayCall.replay, true, 'CallSid replay is acknowledged');
  const callRows = await must(
    admin.from('missed_calls').select('organisation_id, outbound_message_id').eq('provider_call_sid', callSid),
    'read deduplicated call',
  );
  assert.equal(callRows.length, 1, 'CallSid is stored once');
  const callOutbox = await must(
    admin.from('sms_messages').select('id, body, state').eq('idempotency_key', `missed-call:${callSid}`),
    'read missed-call outbox',
  );
  assert.equal(callOutbox.length, 1, 'missed call queues exactly one outbox row');
  assert.equal(
    callOutbox[0].body,
    'Sorry we missed your call. Reply here and our team will get back to you.',
    'missed call uses the approved text-back',
  );
  const conflict = await admin.rpc('ingest_twilio_voice_status', {
    p_provider_account_sid: `AC${suffix}`,
    p_provider_call_sid: callSid,
    p_from_phone_e164: '+61499999998',
    p_to_phone_e164: '+61280000001',
    p_call_status: 'no-answer',
    p_direction: 'inbound',
  });
  assert.ok(conflict.error, 'CallSid cannot be reused for a different call identity');

  const stoppedCallSid = `CA${`${suffix}b`.padEnd(32, 'b')}`;
  const stoppedCall = await ingestCall({ sid: stoppedCallSid, to: '+61280000002' });
  assert.equal(stoppedCall.queued, false, 'STOP preference blocks queueing');
  const stoppedCallOutbox = await must(
    admin.from('sms_messages').select('id').eq('idempotency_key', `missed-call:${stoppedCallSid}`),
    'read STOP-blocked outbox',
  );
  assert.equal(stoppedCallOutbox.length, 0, 'STOP creates no outbound row');

  const restart = await ingest({
    sid: `SM${suffix}START`,
    to: '+61280000002',
    body: 'START',
  });
  assert.equal(restart.start_allowed, true, 'START restores a previously consented recipient');
  const restartedPreference = await must(
    admin.from('communication_preferences')
      .select('sms_consent_status, consent_basis, consent_source, opted_out_at')
      .eq('organisation_id', organisationB)
      .eq('phone_e164', '+61412345678')
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
    to: '+61280000001',
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
  assert.match(helpReply.body, /STOP/, 'HELP still names STOP');
  assert.match(helpReply.body, /START/, 'HELP still names START');

  const jobReply = await ingest({
    sid: `SM${suffix}JOB`,
    to: '+61280000001',
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

  const bookingDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const bookingReply = await ingest({
    sid: `SM${suffix}BOOK`,
    to: '+61280000001',
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
  await ingestCall({ sid: ladderCallSid, to: '+61280000001' });
  const ladderOpen = await ingest({
    sid: `SM${suffix}LADDEROPEN`,
    to: '+61280000001',
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
    to: '+61280000001',
    body: 'Leaking hot water service today',
  });
  assert.equal(ladderJob.qualification_step, 'urgency', 'kept ladder advances on job or service');
  const ladderUrgency = await ingest({
    sid: `SM${suffix}LADDERURG`,
    to: '+61280000001',
    body: '2',
  });
  assert.equal(ladderUrgency.qualification_step, 'contact_area', 'kept ladder advances on numbered urgency');
  const ladderContact = await ingest({
    sid: `SM${suffix}LADDERWHO`,
    to: '+61280000001',
    body: 'Jack, Newtown',
  });
  assert.equal(ladderContact.qualification_step, 'time_window', 'kept ladder advances on name and area');
  const ladderQualified = await ingest({
    sid: `SM${suffix}LADDERWHEN`,
    to: '+61280000001',
    body: 'Weekdays 2-4pm',
  });
  assert.equal(ladderQualified.qualified, true, 'kept ladder still completes qualification');
  const ladderBook = await ingest({
    sid: `SM${suffix}LADDERBOOK`,
    to: '+61280000001',
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
    to: '+61280000001',
    body: 'STOP',
  });
  assert.equal(bookedStop.reply_kind, 'stop', 'STOP still wins after a BOOK reply');
  const bookedStart = await ingest({
    sid: `SM${suffix}BOOKEDSTART`,
    to: '+61280000001',
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
  await ingestCall({ sid: stopCallSid, to: '+61280000001' });
  const beforeThreadStop = await ingest({
    sid: `SM${suffix}PRESTOPHELP`,
    to: '+61280000001',
    body: 'HELP',
  });
  assert.equal(beforeThreadStop.qualification_step, 'job_service', 'HELP stays on the dormant ladder');
  const stopReply = await ingest({
    sid: `SM${suffix}THREADSTOP`,
    to: '+61280000001',
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
    to: '+61280000001',
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

  const claimId = randomUUID();
  await must(
    admin.from('communication_preferences').insert({
      organisation_id: organisationA,
      phone_e164: '+61499999999',
      sms_consent_status: 'consented',
      consent_basis: 'express',
      consent_source: 'integration_test',
      consented_at: new Date().toISOString(),
    }),
    'record claim fixture consent',
  );
  await must(
    admin.from('sms_messages').insert({
      id: claimId,
      organisation_id: organisationA,
      sender_id: senderA,
      direction: 'outbound',
      state: 'queued',
      from_phone_e164: '+61280000001',
      to_phone_e164: '+61499999999',
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

  console.log('missed-call SMS database integration tests passed');
} finally {
  await admin.from('missed_call_office_reviews').delete().in('organisation_id', [organisationA, organisationB]);
  await admin.from('communication_preference_events').delete().in('organisation_id', [organisationA, organisationB]);
  await admin.from('agent_reminders')
    .delete()
    .in('company_id', [organisationA, organisationB])
    .eq('related_type', 'missed_call_office_review');
  await admin.from('missed_call_booking_commands').delete().in('organisation_id', [organisationA, organisationB]);
  await admin.from('missed_call_sms_threads').delete().in('organisation_id', [organisationA, organisationB]);
  await admin.from('agent_reminders')
    .delete()
    .in('company_id', [organisationA, organisationB])
    .eq('related_type', 'missed_call_sms_thread');
  await admin.from('jobs').delete().in('company_id', [organisationA, organisationB]);
  await admin.from('clients').delete().in('company_id', [organisationA, organisationB]);
  await admin.from('missed_calls').delete().in('organisation_id', [organisationA, organisationB]);
  await admin.from('sms_messages').delete().in('organisation_id', [organisationA, organisationB]);
  await admin.from('communication_preferences').delete().in('organisation_id', [organisationA, organisationB]);
  await admin.from('organisation_twilio_senders').delete().in('organisation_id', [organisationA, organisationB]);
  await admin.from('profiles').delete().in('id', users);
  await admin.from('companies').delete().in('id', [organisationA, organisationB]);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
