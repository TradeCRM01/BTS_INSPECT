# Missed-call SMS Phase 1 operations

Phase 1 receives and records inbound SMS, applies explicit STOP requests, and
provides a dormant durable outbox. It does not send customer text-backs, react
to missed calls, create jobs, or make bookings.

## Edge secrets

Set these on the `twilio-inbound` Supabase Edge Function:

```sh
npx supabase secrets set \
  TWILIO_AUTH_TOKEN='…' \
  TWILIO_WEBHOOK_URL='https://PROJECT_REF.supabase.co/functions/v1/twilio-inbound'
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to deployed Edge
Functions by Supabase. Never put the service-role key or Twilio auth token in a
`VITE_*` variable.

`TWILIO_WEBHOOK_URL` must exactly match the public URL configured in Twilio,
including scheme, host, path, and any query string. Signature validation uses
this value instead of the proxy-facing request URL.

The Twilio Account SID is stored with each sender mapping. The existing
`TWILIO_ACCOUNT_SID` secret may remain for existing reminder sends, but this
inbound function resolves and verifies the account through the mapping.

## Provision a company number

1. Buy or port an SMS-capable number in the intended Twilio account or
   subaccount.
2. Record the Account SID (`AC…`), Incoming Phone Number SID (`PN…`), and E.164
   number.
3. Apply the migration and add the mapping with an administrative database
   connection:

   ```sql
   insert into public.company_twilio_senders (
     company_id,
     phone_e164,
     provider_account_sid,
     provider_sender_sid
   )
   values (
     'COMPANY_UUID',
     '+61XXXXXXXXX',
     'AC…',
     'PN…'
   );
   ```

4. Deploy the function:

   ```sh
   npx supabase functions deploy twilio-inbound
   ```

5. In Twilio, set the number's incoming-message webhook to `POST` the exact
   `TWILIO_WEBHOOK_URL`.
6. Send a harmless inbound test, then confirm one `received` row exists in
   `sms_messages` for the mapped company.
7. Send `STOP`; confirm the company+phone preference is `opted_out` and any
   queued or leased outbound rows for that recipient are `cancelled`.

Only one active mapping may own an E.164 number. To retire a number without
losing message history:

```sql
update public.company_twilio_senders
set active = false, updated_at = now()
where provider_sender_sid = 'PN…';
```

Do not delete a mapping that has message history.

## Expected webhook behavior

- Invalid signatures return `403` before any database access.
- Unknown Account SID + `To` mappings return `404` and store nothing.
- A replayed Twilio Message SID returns success and does not duplicate the
  ledger row or repeat the preference transition.
- `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, and `QUIT` are treated as
  explicit opt-out. Twilio's `OptOutType=STOP` is also honored.
- Message bodies and phone numbers are not written to function logs.

If valid Twilio requests fail signature validation, compare the Twilio request
inspector URL byte-for-byte with `TWILIO_WEBHOOK_URL`. Do not weaken signature
validation to work around a proxy or custom-domain mismatch.

## Checks

Run webhook behavior tests:

```sh
npm test -- src/lib/twilioInboundWebhook.test.ts
```

With a migrated local or disposable Supabase database, export its local keys
and run the database integration proof:

```sh
SUPABASE_URL=http://127.0.0.1:55321 \
SUPABASE_ANON_KEY='…' \
SUPABASE_SERVICE_ROLE_KEY='…' \
npm run test:sms-db
```

The integration script proves provider-SID replay handling, company RLS
isolation, STOP-before-send, and concurrent `FOR UPDATE SKIP LOCKED` claims.
Never run it against production.

Operational queue checks:

```sql
select id, company_id, state, attempts, next_attempt, last_error
from public.sms_messages
where direction = 'outbound'
  and state in ('queued', 'claimed', 'failed')
order by coalesce(next_attempt, created_at);
```

Before production inbound traffic, set an approved retention period for message
bodies and document the corresponding deletion process. Phone numbers and
message bodies are personal information.
