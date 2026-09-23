# Run missed-call qualification

Phase 2C keeps missed-call replies in the existing SMS thread. For new threads,
the caller must answer four short prompts before `BOOK` can create a booking
command:

1. Job or service needed.
2. Urgency: `1` emergency, `2` today, `3` this week, or `4` flexible.
3. Name and suburb/area, separated by a comma.
4. Best contact time window.

The final prompt asks for the existing Phase 2B syntax:
`BOOK YYYY-MM-DD HH:MM`. A `BOOK` reply before qualification repeats the
current question and never creates a command. Phase 2B threads that existed
when the migration was applied retain their previous booking contract.

## Keywords

- `HELP` returns the short keyword, ladder, and booking guide.
- `STOP` wins over every other command, opts the number out, cancels queued or
  claimed messages, and pauses the thread.
- `START` restores messaging only when the same organisation and phone had a prior
  consent basis before `STOP`. It does not turn unknown consent into consent.

`STOP` and `START` transitions are recorded in
`communication_preference_events` with the source inbound message and consent
provenance. Organisation members can read only their own records.

## Office handoff

Completing the ladder creates an organisation-visible `Qualified missed-call
enquiry` on the existing reminders path. Vague or malformed answers stay on
the current prompt; no reply silently books. Existing Phase 2B conflict and
non-eligible booking failures still create `Review missed-call SMS reply`
tasks.

Deploy the migration and updated inbound function:

```sh
npx supabase db push
npx supabase functions deploy twilio-inbound
```

Keep the Phase 2B booking worker and shared SMS worker schedules running. No
new worker or UI route is required.
