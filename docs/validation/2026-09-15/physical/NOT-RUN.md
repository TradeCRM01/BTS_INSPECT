# Milestone 7 — physical devices (15 Sep 2026)

**Not physical validation.** This file records setup and blockers only. No screenshots were taken because no hardware session ran.

Checkpoint: `6863cbd` on `integration/job-workspace-tabs` (matches `origin` after fetch). No reset.

## Resolved runtime (before any sign-in)

Recorded on the development PC. No public tunnel. No `grafter.com.au`.

| Role | Resolved URL | Bind |
| --- | --- | --- |
| Vite (this session) | `http://127.0.0.1:5174/` | `127.0.0.1` only (`--strictPort --host 127.0.0.1`) |
| Local Supabase API (Kong) | `http://127.0.0.1:55321` | container `0.0.0.0:55321->8000` |
| Vite process override | `VITE_SUPABASE_URL=http://127.0.0.1:55321` | required; `.env` host is production `ezszahvwwmbuekpedumf.supabase.co` and must stay unused |

Private LAN address on this machine (Wi‑Fi): `10.1.0.9`. Not used this pass. A phone on the same LAN still cannot use `127.0.0.1` on the phone. When hardware is present, start Vite with the same local anon key and `VITE_SUPABASE_URL=http://10.1.0.9:55321`, `--host 10.1.0.9`, and open `http://10.1.0.9:5174` — still no ngrok / Cloudflare tunnel / production hostname.

## Devices

| Device | Browser | Result | Blocker |
| --- | --- | --- | --- |
| Physical iPhone (Safari) | — | **Not run** | No physical iPhone is attached to this agent session. Safari on hardware cannot be driven from Cursor. |
| Physical Android (Chrome) | — | **Not run** | No physical Android is attached to this agent session. Chrome on hardware cannot be driven from Cursor. |

Emulators / Cursor browser / prior 390×844 and 375×667 pointer passes are **not** this gate.

Model, OS, browser version, tab vs PWA, viewports, DPR, safe-area, and remote inspection: **not measured**.

## When hardware is in the room

Use fictional local fixtures and a signed-in local account only. Same private Wi‑Fi. Folder for shots: `docs/validation/2026-09-15/physical/` with names like `iphone-safari-today.png`. Gates already listed on the programme: field path, safe area, hardware keyboard, offline/retry, VoiceOver, TalkBack. The incoming Milestone 7 checklist in chat was truncated after “Required physical-d”; do not invent extra cases.
