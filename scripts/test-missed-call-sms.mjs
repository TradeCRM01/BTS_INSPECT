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
  return must(
    admin.rpc('ingest_twilio_inbound_sms', {
      p_provider_account_sid: `AC${suffix}`,
      p_provider_message_sid: sid,
      p_from_phone_e164: '+61412345678',
      p_to_phone_e164: to,
      p_body: body,
      p_is_stop: body.trim().toUpperCase() === 'STOP',
    }),
    `ingest ${sid}`,
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
  await admin.from('sms_messages').delete().in('company_id', [companyA, companyB]);
  await admin.from('communication_preferences').delete().in('company_id', [companyA, companyB]);
  await admin.from('company_twilio_senders').delete().in('company_id', [companyA, companyB]);
  await admin.from('profiles').delete().in('id', users);
  await admin.from('companies').delete().in('id', [companyA, companyB]);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
