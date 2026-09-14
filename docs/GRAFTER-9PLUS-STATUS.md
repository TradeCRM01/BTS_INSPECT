# Grafter 9+ programme — development status

**Programme state:** Milestones 0–5 plus the 13–14 Sep 2026 hardening / validation pass are on `integration/job-workspace-tabs`. This document is the living record.

Baseline: live UX audit of original Grafter, 13 September 2026.
Repo: original Grafter (`TradeCRM01/BTS_INSPECT`).

**No production deployment.** **No production migration.** **No verified 9+ rating.** **No Simpro parity claim.** Physical iPhone and Android remain required before any 9+ **mobile** claim. Emulator / Cursor-browser results are interim only.

Production deploys, `grafter.com.au`, payments, and customer email stay out of scope until separately approved.

| Category | Audit baseline | After M0–5 + 14 Sep hardening | Verified 9+ |
| --- | ---: | --- | --- |
| Overall app | 6.5 | Implemented on branch; local signed-in pass (not production JS) | No |
| UI/UX vs competitors | 6.0 | Unchanged vs competitor UI | No |
| Desktop efficiency | 6.5 | 1366×768 signed-in smoke after sticky correction | No |
| Mobile field | 5.5 provisional | Emulated pointer passes at **390×844** and **375×667** | No |
| Scheduling / dispatch | 6.0 | Local `staff_hours` fixture; least-privilege grants | No |
| Reliability / recovery | 4.5 | `due_on` list loads locally; PWA dismiss via **controlled** event | No |

## Hardening pass — 14 Sep 2026 (local sandbox)

App: `http://127.0.0.1:5174` with `VITE_SUPABASE_URL=http://127.0.0.1:55321` (overrides `.env` production URL).
Data: local Supabase only. Company “Building Technology Solutions”. **No writes to `ezszahvwwmbuekpedumf` or grafter.com.au.** Local login passwords are not recorded here.

Local-only tables (`expenses`, `staff_hours`) stay in `scripts/local-apply-cogs-hours.sql` / `scripts/local-validation-fixtures.sql`. Those files are **not** production migrations. `GRANT` is `authenticated` + `service_role` only. `REVOKE ALL` from `anon` and `PUBLIC`. Re-run is idempotent (`NOT EXISTS`). Static guard: `src/lib/localFixtureSql.test.ts`. Live local check: `has_table_privilege('anon', …)` is **false** for SELECT/INSERT/UPDATE/DELETE on both tables. All three local jobs share one `company_id`.

### Sticky action hierarchy

Office Next (`ops-sticky`) is `hidden lg:block` and only renders when `next.key !== 'none'`. Phone primary is the On-site strip (`lg:hidden`): sticky bottom, `z-index: 30`.

Take 5 is **disabled** when the job has no parent JHA. Hint: “Start a JHA first — Take 5 needs that SWMS.” JHA in the same strip is the start path. Safety rule unchanged: Take 5 still requires a parent JHA to navigate.

### Mobile field path — 390×844

Signed-in pointer/tap. `scrollWidth` 390. Office sticky `display: none`. Strip buttons 44px; `elementFromPoint` hit the intended control.

| Action | Result |
| --- | --- |
| Today → today jobs | Command strip **On today** → `/jobs?when=today` |
| Open job | `#0001` Today boarded switchboard |
| Clock on/off | Clock off then on; Time tab increased |
| Photo | Pointer on Photo; fixture PNG on the file input |
| Typed note | “390 pass — note saved 14 Sep.” persisted |
| More to do | Tap accepted; status stayed `in_progress` |
| JHA | `/jha/new?…` from `#0002` (no parent JHA) |
| Take 5 | `#0001` (after local JHA) → `/jha/take5?jhaId=…`. `#0002` Take 5 **disabled** + hint |
| All done | `#0002` → `completed` |

Screenshots: `docs/validation/2026-09-14/phone-390-dashboard.png`, `phone-390-jobs-today.png`, `phone-390-job-field.png`, `phone-390-take5.png`, `phone-390-take5-disabled.png`.

### Mobile field path — 375×667

Signed-in pointer/tap after the 390 pass. Viewport `375×667`. `scrollWidth` 375. All strip targets 44px; `elementFromPoint` hit. No office sticky overlay.

| Action | Result |
| --- | --- |
| Today → today jobs | **1 On today** → `/jobs?when=today` |
| Open job | `#0001` |
| Clock on/off | Clock off then on; Time tab 4 |
| Photo | Pointer + injected `375-pass.png` change event |
| Typed note | “375 pass — note saved 14 Sep.” persisted |
| More to do | Tap accepted |
| Take 5 | `#0001` → `/jha/take5?jhaId=102134bd-…` |
| JHA | `#0003` → `/jha/new?templateId=…&jobId=f26b8e52-…` |
| All done | `#0003` → `completed` |
| Take 5 dead-end | `#0003` Take 5 **disabled** + hint (no parent JHA) |

Screenshots: `phone-375-dashboard.png`, `phone-375-job-field.png`, `phone-375-take5.png`, `phone-375-jha-new.png`, `phone-375-take5-disabled.png`.

### Desktop 1366×768 (after sticky correction)

Signed-in. `scrollWidth` 1366. Mobile On-site strip `display: none`.

| Check | Result |
| --- | --- |
| Today command strip | **1 On today**, **0 Unassigned**, **0 Needs a date**, **1 Overdue invoices** |
| Jobs crew/date/unassigned | `#0001` dated + 1 crew; `#0002` dated Unassigned; `#0003` No date · Unassigned |
| CRM health | Sandbox Client Co: 1 open · last 14 Sep · Overdue $1,210.00 |
| Inspection `due_on` | `/inspections` listed Sandbox inspection (column present). **Retry/error UI not re-fired** this pass because the local column exists. Loading resolved to the list. |
| Overdue KPI | Dashboard **1** matches `/invoices?status=overdue` invoice `#0001` $1,210.00 Overdue |
| Zero-duration time | Add Entry 08:00–08:00 blocked: “That entry has no duration…” |
| Mobile strip on desktop | Absent (`display: none`) |
| Office Next | `#0003` sticky **Set a date** `display: block`. `#0001` had `next.key === 'none'` so no office sticky (intended) |
| Nav | Field Work opened; toggle closed; click-away on the job card collapsed the menu |

Screenshots: `desktop-1366-dashboard.png`, `desktop-1366-jobs.png`, `desktop-1366-clients.png`, `desktop-1366-inspections.png`, `desktop-1366-invoices-overdue.png`, `desktop-1366-timesheet-zero.png`, `desktop-1366-office-next.png`, `desktop-1366-pwa-banner.png`.

### Console / network (local)

- App data: local Vite + `127.0.0.1:55321` only.
- Dashboard Industry News showed **News unavailable** (external news, not Grafter/Supabase). That is not treated as a field-path failure.
- No production hosts were used. A full DevTools error dump was not exported; no crash blocked the pointer or desktop smokes.

### PWA install

**Native `beforeinstallprompt` did not fire** in this Cursor browser. That absence is **not** a pass.

Proof levels that **did** run:

1. Unit: `canOfferInstallPrompt` / `shouldShowInstallBanner` in `src/lib/installPrompt.test.ts`.
2. Session / integration (same file, no Playwright in this repo): banner only after a revealed controlled event; never on `/jobs`, `/schedule`, `/inspections`, or a job URL; dismiss + navigate + “reload” stay hidden.
3. Live controlled event: dashboard banner after a dispatched `beforeinstallprompt` (`top: 12px`, does not cover the Today strip). Dismiss stored `pwa-install-dismissed=1`. After `/jobs` and return to `/`, a second dispatch did **not** show the banner.

Screenshot: `desktop-1366-pwa-banner.png`.

### Local SQL / permissions

- Scripts remain under `scripts/` with `LOCAL SANDBOX ONLY` / `Not a production migration`.
- No file added under `supabase/migrations` for this work.
- Anon cannot read or mutate `expenses` / `staff_hours` (script + live privilege check).

### Regression (automated)

| Check | Result |
| --- | --- |
| Full `vitest run` | **90 files, 1076 passed, 0 skip** (14 Sep 2026, this machine) |
| `vite build` | Pass (44.58s). Large-chunk warning only (`vendor-pdf`). |
| GitHub Actions | `.github/workflows/review-checks.yml` added on the branch. **Not pushed.** **Not run on GitHub.** The repository currently has **no remote required checks**; this only prepares the branch. |

Wall-clock `decideInvoiceSend` ×2000 &lt;80ms was **replaced** (not skipped) with a source/complexity guard. See `docs/VITEST-QUARANTINE.md`.

### Known gaps (still open)

1. Physical iOS/Android unverified — **required** before any 9+ mobile claim.
2. Hardware keyboard, VoiceOver, TalkBack, safe-area on a real device, and offline/retry on a dropped radio were not measured.
3. Inspection `due_on` **error/retry** path was not re-broken locally this pass (column present).
4. PageError still uses a WifiOff icon for Postgres/column errors.
5. No Simpro-depth dispatch. Not a 9.

## Milestone notes (implementation, already on the branch)

### Milestone 0 — reliability

Inspection `due_on` retry, overdue KPI/list rule, dashboard-only install helper, zero-duration timesheet guard.

### Milestone 1 — shell and list density

Today command strip, Jobs crew/date, client health lines, nav click-away, settings jump links.

### Milestone 2 — dispatch load

Load vs recorded hours only; one-hour slot on timed drop.

### Milestone 3 — field path

`/jobs?when=today`; On-site strip is the phone sticky primary (JHA / Take 5 included).

### Milestone 4 — commercial / inventory

Stock available vs allocated; COGS-on-job helper. Banner live-proven with a local fixture.

### Milestone 5 — 9+ gate

**Not passed.**

## Review branch

Hardening is a **local** commit on `integration/job-workspace-tabs`. **Do not push** from this pass unless separately asked. Do not deploy to `grafter.com.au` or apply production migrations.
