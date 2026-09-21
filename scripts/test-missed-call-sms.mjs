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
  return client;
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
  const clientA = await createTenant(companyA, 'a');
  const clientB = await createTenant(companyB, 'b');
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

  const replaySid = `SM${suffix}REPLAY`;
  await ingest({ sid: replaySid, to: '+61280000001' });
  const replay = await ingest({ sid: replaySid, to: '+61280000001' });
  assert.equal(replay.replay, true, 'provider SID replay is acknowledged');
  const replayRows = await must(
    admin.from('sms_messages').select('id').eq('provider_message_sid', replaySid),
    'read replay rows',
  );
  assert.equal(replayRows.length, 1, 'provider SID is stored once');

  const companyBSid = `SM${suffix}B`;
  await ingest({ sid: companyBSid, to: '+61280000002' });
  const rowsA = await must(clientA.from('sms_messages').select('company_id'), 'company A RLS read');
  const rowsB = await must(clientB.from('sms_messages').select('company_id'), 'company B RLS read');
  assert.ok(rowsA.length > 0 && rowsA.every((row) => row.company_id === companyA), 'company A sees only A');
  assert.ok(rowsB.length > 0 && rowsB.every((row) => row.company_id === companyB), 'company B sees only B');

  const stoppedOutbound = randomUUID();
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
  await ingest({ sid: `SM${suffix}STOP`, to: '+61280000002', body: 'STOP' });
  const cancelled = await must(
    admin.from('sms_messages').select('state').eq('id', stoppedOutbound).single(),
    'read STOP fixture',
  );
  assert.equal(cancelled.state, 'cancelled', 'STOP cancels queued work synchronously');
  const stoppedClaim = await must(admin.rpc('claim_next_sms_message', {
    p_worker_id: 'stop-test',
    p_lease_seconds: 60,
  }), 'claim after STOP');
  assert.ok(stoppedClaim.every((row) => row.id !== stoppedOutbound), 'STOP row cannot be claimed');

  const claimId = randomUUID();
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

  console.log('missed-call SMS database integration tests passed');
} finally {
  await admin.from('sms_messages').delete().in('company_id', [companyA, companyB]);
  await admin.from('communication_preferences').delete().in('company_id', [companyA, companyB]);
  await admin.from('company_twilio_senders').delete().in('company_id', [companyA, companyB]);
  await admin.from('profiles').delete().in('id', users);
  await admin.from('companies').delete().in('id', [companyA, companyB]);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
