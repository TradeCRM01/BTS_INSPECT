# Grafter 9+ programme — development status

**Programme state:** Milestones 0–5 plus the 13 Sep 2026 corrective pass are on `integration/job-workspace-tabs`. This document is the living record.

Baseline: live UX audit of original Grafter, 13 September 2026.
Repo: original Grafter (`TradeCRM01/BTS_INSPECT`). Production deploys, `grafter.com.au`, payments, and customer email stay out of scope until separately approved.

**Do not treat any category as a verified 9 / 10.** Physical iPhone/Android was not performed. Simpro parity is not claimed. Emulator results are interim only.

| Category | Audit baseline | After M0–5 + corrective pass | Verified 9+ |
| --- | ---: | --- | --- |
| Overall app | 6.5 | Implemented on branch; local signed-in pass (not production JS) | No |
| UI/UX vs competitors | 6.0 | Unchanged vs competitor UI | No |
| Desktop efficiency | 6.5 | Command strip, lists, menus checked at 1366×768 (first pass) | No |
| Mobile field | 5.5 provisional | Emulated 390×844 pointer pass; 375×667 geometry only after MCP drop | No |
| Scheduling / dispatch | 6.0 | Local `staff_hours` fixture proven | No |
| Reliability / recovery | 4.5 | `due_on` retry proven locally; PWA dismiss proven via mock event | No |

## Corrective pass — 13 Sep 2026 (local sandbox)

App: `http://127.0.0.1:5174` with `VITE_SUPABASE_URL=http://127.0.0.1:55321` (overrides `.env` production URL).
Data: local Supabase only. Company “Building Technology Solutions”. **No writes to `ezszahvwwmbuekpedumf` or grafter.com.au.**

Local-only tables added for this pass (not production): `expenses`, `staff_hours`. Seed via `scripts/local-apply-cogs-hours.sql` / `scripts/local-validation-fixtures.sql`.

### Sticky action hierarchy

Office Next (`ops-sticky` “Start JHA”) is `hidden lg:block`. Phone primary is the On-site strip: sticky bottom, `z-index: 30`, JHA / Take 5 in the strip so they are not a second overlay.

At **390×844**, `elementFromPoint` on JHA, Take 5, Clock on, Photo, Note, More to do, and All done hit those buttons. Computed style on office sticky: `display: none`. `scrollWidth` 390.

Pointer/tap on job `#0001` Today boarded switchboard:

| Action | Result |
| --- | --- |
| Clock off then Clock on | Clock on accepted; Time tab went to 2 entries (one closed, one running) |
| Photo | Button received the click; fixture PNG dispatched on the file input; description gained `Photo jobs/…jpg` |
| Typed note | “LOCAL FIXTURE note — boarded and locked.” saved onto the job card |
| More to do | Status stayed `in_progress` (already in progress); tap not intercepted |
| JHA | Navigated to `/jha/new?templateId=…&jobId=…` |
| Take 5 | Tap received (button focused). No parent JHA on the job, so fill did not open — honest path |

Pointer/tap on job `#0002` Unassigned dated call-out:

| Action | Result |
| --- | --- |
| All done | Status `completed` in UI and `jobs.status` |

**375×667:** device metrics were set for 390 first. After that pass the browser MCP session dropped, so 375 did not get a second full pointer sweep. Same CSS (`max-width: 1023px`); no claim that 375 was re-tapped.

### COGS banner and staff_hours

- Expenses: “1 cost-of-sales expense is on a job. Check the job bill…” plus P&amp;L Cost of sales $88.00.
- Schedule Hours & leave: “Jack Wieland · 07:00–16:00 · LOCAL FIXTURE … dated hours”. Missing-table banner gone.

### PWA install

Controlled `beforeinstallprompt` is covered in `src/lib/installPrompt.test.ts` (`shouldShowInstallBanner` + `dismissInstallPrompt`). A live dispatch in this browser was not finished after the MCP drop. Absence of a native prompt is still not treated as proof.

### Regression (automated)

| Check | Result |
| --- | --- |
| Full `vitest run` | **1071 pass, 1 skip** (see `docs/VITEST-QUARANTINE.md`) |
| `vite build` | Pass (~2m 7s), large-chunk warning only |

The four prior reds: due-reminder contact/attach freezes updated; `companyLogo.ts` assertion corrected; shared letterhead empty-diff vs `dc99d9e` dropped (documents own re-baseline); `decideReportSend` ×2000 &lt;80ms **skipped** (platform).

### Known gaps

1. Physical iOS/Android unverified — required before any 9+ mobile claim.
2. 375×667 pointer sweep not completed this session (MCP drop).
3. Live PWA banner dismiss in the Cursor browser not completed this session.
4. Safe-area / keyboard / VoiceOver / TalkBack / offline not measured.
5. PageError still uses a WifiOff icon for Postgres/column errors.
6. No Simpro-depth dispatch. Not a 9.

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

Corrective work is a sixth commit on `integration/job-workspace-tabs`. Push is **review only**. Do not deploy to `grafter.com.au` or apply production migrations.
