import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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
const companyA = randomUUID();
const companyB = randomUUID();
const userPassword = `Sms-${randomUUID()}-1a!`;
const users = [];

async function must(query, label) {
  const result = await query;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function createTenant(companyId, label) {
  const email = `sms-${label}-${suffix}@example.test`;
  const created = await must(
    admin.auth.admin.createUser({ email, password: userPassword, email_confirm: true }),
    `create ${label} auth user`,
  );
  users.push(created.user.id);
  await must(admin.from('companies').insert({ id: companyId, name: `SMS test ${label}` }), `create ${label} company`);
  await must(
    admin.from('profiles').insert({
      id: created.user.id,
      email,
      name: `SMS ${label}`,
      company_id: companyId,
    }),
    `create ${label} profile`,
  );
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await must(client.auth.signInWithPassword({ email, password: userPassword }), `sign in ${label}`);
  return { client, userId: created.user.id };
}

async function ingest({ sid, to, body = 'Hello' }) {
  const stop = body.trim().toUpperCase() === 'STOP';
  const confirmed = body.trim().match(/^BOOK\s+(\d{4}-\d{2}-\d{2})\s+(?:AT\s+)?(\d{2}:\d{2})$/i);
  const replyKind = stop
    ? 'stop'
    : confirmed
      ? 'confirmed_slot'
      : /\b(?:yes|book|booking|available|works|confirm)\b/i.test(body)
        ? 'ambiguous'
        : 'noneligible';
  return must(
    admin.rpc('ingest_twilio_inbound_sms', {
      p_provider_account_sid: `AC${suffix}`,
      p_provider_message_sid: sid,
      p_from_phone_e164: '+61412345678',
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
  const tenantA = await createTenant(companyA, 'a');
  const tenantB = await createTenant(companyB, 'b');
  const clientA = tenantA.client;
  const clientB = tenantB.client;
  const senderA = randomUUID();
  const senderB = randomUUID();
  await must(
    admin.from('company_twilio_senders').insert([
      {
        id: senderA,
        company_id: companyA,
        phone_e164: '+61280000001',
        provider_account_sid: `AC${suffix}`,
        provider_sender_sid: `PN${suffix}A`,
      },
      {
        id: senderB,
        company_id: companyB,
        phone_e164: '+61280000002',
        provider_account_sid: `AC${suffix}`,
        provider_sender_sid: `PN${suffix}B`,
      },
    ]),
    'insert sender mappings',
  );

  const unknownConsentId = randomUUID();
  await must(
    admin.from('sms_messages').insert({
      id: unknownConsentId,
      company_id: companyA,
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
    company_id: companyA,
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
    admin.from('company_twilio_senders').update({ active: false }).eq('id', senderA),
    'disable sender fixture',
  );
  const inactiveSender = await admin.from('sms_messages').insert({
    company_id: companyA,
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
    admin.from('company_twilio_senders').update({ active: true }).eq('id', senderA),
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
  await must(admin.from('company_twilio_senders').update({ active: false }).eq('id', senderA), 'retire replay sender');
  const retiredReplay = await ingest({ sid: replaySid, to: '+61280000001' });
  assert.equal(retiredReplay.replay, true, 'replay remains idempotent after sender retirement');
  await must(admin.from('company_twilio_senders').update({ active: true }).eq('id', senderA), 'restore replay sender');
  const forgedAutomation = await clientA.from('jobs').insert({
    company_id: companyA,
    title: 'Must not persist',
    created_by: null,
    created_via: 'missed_call_sms',
    automation_ref: replayRows[0].id,
  });
  assert.ok(forgedAutomation.error, 'authenticated users cannot forge automation provenance');

  const companyBSid = `SM${suffix}B`;
  await ingest({ sid: companyBSid, to: '+61280000002' });
  const rowsA = await must(clientA.from('sms_messages').select('company_id'), 'company A RLS read');
  const rowsB = await must(clientB.from('sms_messages').select('company_id'), 'company B RLS read');
  assert.ok(rowsA.length > 0 && rowsA.every((row) => row.company_id === companyA), 'company A sees only A');
  assert.ok(rowsB.length > 0 && rowsB.every((row) => row.company_id === companyB), 'company B sees only B');
  const forbiddenWrite = await clientA.from('sms_messages').insert({
    company_id: companyA,
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
      company_id: companyB,
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
      company_id: companyB,
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
      company_id: companyA,
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
    admin.from('missed_calls').select('company_id, outbound_message_id').eq('provider_call_sid', callSid),
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

  const missedCallsA = await must(clientA.from('missed_calls').select('company_id'), 'company A missed-call read');
  const missedCallsB = await must(clientB.from('missed_calls').select('company_id'), 'company B missed-call read');
  assert.ok(
    missedCallsA.length > 0 && missedCallsA.every((row) => row.company_id === companyA),
    'company A sees only its missed calls',
  );
  assert.ok(
    missedCallsB.length > 0 && missedCallsB.every((row) => row.company_id === companyB),
    'company B sees only its missed calls',
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

  await must(
    admin.from('clients').insert({
      company_id: companyA,
      name: 'Missed-call client',
      phone: '+61412345678',
      address: '1 Test Street',
    }),
    'create booking client',
  );
  const vague = await ingest({
    sid: `SM${suffix}VAGUE`,
    to: '+61280000001',
    body: 'yes',
  });
  assert.equal(vague.review_reason, 'ambiguous', 'vague yes does not book');
  const vagueReview = await must(
    admin.from('missed_call_office_reviews').select('reason').eq('inbound_message_id', vague.message_id).single(),
    'read vague review',
  );
  assert.equal(vagueReview.reason, 'ambiguous', 'vague reply is sent to office review');

  const bookingDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const bookingReply = await ingest({
    sid: `SM${suffix}BOOK`,
    to: '+61280000001',
    body: `BOOK ${bookingDate} 09:30`,
  });
  assert.ok(bookingReply.command_id, 'confirmed concrete slot creates a booking command');
  const booked = await must(
    admin.rpc('process_next_missed_call_booking', { p_worker_id: 'booking-test' }),
    'process confirmed booking',
  );
  assert.equal(booked.booked, true, 'confirmed concrete slot books a job');
  const bookedJob = await must(
    admin.from('jobs')
      .select('company_id, scheduled_date, start_time, created_by, created_via, automation_ref')
      .eq('id', booked.job_id)
      .single(),
    'read automated job',
  );
  assert.equal(bookedJob.company_id, companyA, 'booking stays in the missed-call company');
  assert.equal(bookedJob.scheduled_date, bookingDate, 'booking keeps the confirmed date');
  assert.equal(bookedJob.start_time.slice(0, 5), '09:30', 'booking keeps the confirmed time');
  assert.equal(bookedJob.created_by, null, 'automation does not spoof a human JWT');
  assert.equal(bookedJob.created_via, 'missed_call_sms', 'job records automation provenance');
  assert.equal(bookedJob.automation_ref, bookingReply.message_id, 'job references the inbound command message');
  const confirmation = await must(
    admin.from('sms_messages')
      .select('state, body')
      .like('idempotency_key', `booking-confirmation:${bookingReply.command_id}:%`)
      .single(),
    'read booking confirmation',
  );
  assert.equal(confirmation.state, 'queued', 'booking queues confirmation through shared dispatch');

  const commandsA = await must(
    clientA.from('missed_call_booking_commands').select('company_id'),
    'company A booking command read',
  );
  const commandsB = await must(
    clientB.from('missed_call_booking_commands').select('company_id'),
    'company B booking command read',
  );
  assert.ok(commandsA.length > 0 && commandsA.every((row) => row.company_id === companyA), 'company A sees only A commands');
  assert.equal(commandsB.length, 0, 'company B cannot see company A commands');

  const rebook = await ingest({
    sid: `SM${suffix}REBOOK`,
    to: '+61280000001',
    body: `BOOK ${bookingDate} 09:30`,
  });
  assert.equal(rebook.review_reason, 'conflict', 'a booked thread sends rebooking to office review');
  const jobsAfterRebook = await must(
    admin.from('jobs').select('id').eq('automation_ref', bookingReply.message_id),
    'read jobs after rebook',
  );
  assert.equal(jobsAfterRebook.length, 1, 'idempotent rebook does not create a second job');

  const conflictCallSid = `CA${`${suffix}c`.padEnd(32, 'c')}`;
  await ingestCall({ sid: conflictCallSid, to: '+61280000001' });
  const conflictReply = await ingest({
    sid: `SM${suffix}CONFLICT`,
    to: '+61280000001',
    body: `BOOK ${bookingDate} 09:30`,
  });
  const conflictBooking = await must(
    admin.rpc('process_next_missed_call_booking', { p_worker_id: 'booking-conflict-test' }),
    'process conflicting booking',
  );
  assert.equal(conflictBooking.booked, false, 'occupied slot is not booked');
  assert.equal(conflictBooking.review_reason, 'conflict', 'occupied slot goes to office review');
  const conflictReview = await must(
    admin.from('missed_call_office_reviews').select('reason').eq('inbound_message_id', conflictReply.message_id).single(),
    'read conflict review',
  );
  assert.equal(conflictReview.reason, 'conflict', 'conflict review keeps its reason');

  const stopCallSid = `CA${`${suffix}d`.padEnd(32, 'd')}`;
  await ingestCall({ sid: stopCallSid, to: '+61280000001' });
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

  const claimId = randomUUID();
  await must(
    admin.from('communication_preferences').insert({
      company_id: companyA,
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
      company_id: companyA,
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
  await admin.from('missed_call_office_reviews').delete().in('company_id', [companyA, companyB]);
  await admin.from('missed_call_booking_commands').delete().in('company_id', [companyA, companyB]);
  await admin.from('missed_call_sms_threads').delete().in('company_id', [companyA, companyB]);
  await admin.from('jobs').delete().in('company_id', [companyA, companyB]);
  await admin.from('clients').delete().in('company_id', [companyA, companyB]);
  await admin.from('missed_calls').delete().in('company_id', [companyA, companyB]);
  await admin.from('sms_messages').delete().in('company_id', [companyA, companyB]);
  await admin.from('communication_preferences').delete().in('company_id', [companyA, companyB]);
  await admin.from('company_twilio_senders').delete().in('company_id', [companyA, companyB]);
  await admin.from('profiles').delete().in('id', users);
  await admin.from('companies').delete().in('id', [companyA, companyB]);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
