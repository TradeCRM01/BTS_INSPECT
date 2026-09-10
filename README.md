# The Paper

A one-reader morning paper for your phone. It reads your calendar, your inbox and the Grafter numbers, writes eight lines with a verdict, asks one question at night, and keeps the score.

You type one sentence a day. Everything else it works out.

## What arrives

**Morning edition** (05:30 local, by email, and at `/`)

- **One thing.** The sentence you set the night before. Nothing prints above it.
- **Today.** Calendar for the day, then the longest clear run between 8am and 5pm.
- **Waiting on you.** Inbox threads where someone else spoke last and it has sat two days or more. Each one shows `Day N`, counting the mornings it has been in the paper. It climbs until you act.
- **Grafter, yesterday.** Signups by name, how many companies did anything, paying and trial counts, and a phone call if anyone is past due. Sentences, not tables.
- **Yesterday.** The one thing from yesterday and whether you said it got done.
- **The record.** Fourteen dots. Done, not done, or blank. No streak, no reset.

**Evening edition** (18:00 local)

- Did today's one thing get done? Two buttons.
- Name tomorrow's one thing.

A section with nothing to say does not print. A source that fails prints one line saying so; the paper still arrives.

## Run it

```bash
npm install
cp .dev.vars.example .dev.vars   # PAPER_DEMO=true uses fixture data
npm run dev
```

Open http://127.0.0.1:8787/?t=YOUR_PAPER_TOKEN. The token sets a cookie and drops out of the address bar.

Routes (all behind the token):

| Route | What |
| --- | --- |
| `GET /` | Today's paper. Composes it live if none has been written yet. |
| `GET /text` | Same, as plain text. |
| `GET /preview?edition=morning\|evening` | Compose without saving or sending. |
| `GET /run?edition=morning\|evening` | Compose, save, and email it now. |
| `GET /answer?d=done\|missed&date=YYYY-MM-DD` | Record tonight's answer. |
| `GET\|POST /one-thing?date=YYYY-MM-DD` | Set the one thing for a day. |
| `GET /health` | No token needed. |

Fire a cron locally: `curl "http://127.0.0.1:8787/__scheduled?cron=30+21+*+*+*"`.

```bash
npm test          # vitest over the editor, time and render
npm run typecheck
```

## Deploy

1. `npx wrangler kv namespace create PAPER` and put the id in `wrangler.toml`.
2. Set `PAPER_URL` in `wrangler.toml` to the worker's public URL.
3. Secrets, one at a time with `npx wrangler secret put NAME`:
   - `PAPER_TOKEN` — one long random string. `openssl rand -hex 32` is fine.
   - `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_TO` — [Resend](https://resend.com). Verify the sending domain there.
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `MAIL_ME` — see below.
   - `GRAFTER_SUPABASE_URL`, `GRAFTER_SERVICE_KEY` — the Grafter project's URL and service role key. The worker only ever reads `companies`, `quotes` and `jobs`. The key never reaches a browser.
4. Set `PAPER_DEMO = "false"` and `npm run deploy`.
5. Open `PAPER_URL/run?edition=morning&t=TOKEN` once. The email that lands is the real thing.

Crons in `wrangler.toml` are UTC. `30 21` and `0 10` are 05:30 and 18:00 in Perth. Move them if you change `PAPER_TZ`.

### Google refresh token

One OAuth client in Google Cloud (type: Web application), two scopes, read only:

- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/gmail.readonly`

Add `https://developers.google.com/oauthplayground` as an authorised redirect URI, open the [OAuth Playground](https://developers.google.com/oauthplayground), tick "Use your own OAuth credentials" in the settings cog, paste the client id and secret, authorise the two scopes, exchange the code, and copy the refresh token. While the Google app is in "Testing" the token expires after seven days; publish it (it is only ever used by you) and it stops expiring.

## How it is put together

```
src/
  index.ts        Worker. Cron picks morning or evening by local hour. Routes above.
  editor.ts       The editor. Pure. Signals + state in, edition out.
  render.ts       Plain text and HTML, for email and the page.
  state.ts        KV: one thing per day, the record, and first-seen dates for ageing.
  time.ts         Timezone-correct day keys and clocks with no dependency.
  sources/
    calendar.ts   Google Calendar, today's events.
    gmail.ts      Waiting on you.
    grafter.ts    Supabase REST, three selects.
    demo.ts       Fixture signals for PAPER_DEMO.
    index.ts      Runs every source; one failing cannot stop the paper.
```

The editor is the whole product. Everything else is plumbing. If a line reads wrong, the fix is in `editor.ts` and there is a test for it.

## Adding a source

Add a type to `types.ts`, a fetcher under `sources/`, wrap it with `attempt()` in `sources/index.ts`, and write a section in `editor.ts` that says something a person would say. Then add the fixture to `demo.ts`. Only add a source if it changes what you would do this morning.
