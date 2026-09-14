# Grafter 9+ programme — development status

**Programme state:** Milestones 0–7 (Schedule dispatch-centre redesign) are on `integration/job-workspace-tabs`. Milestone 6–7 schema/fixtures are **local sandbox only**. **No production deployment. No production migration. No verified 9+ rating. No Simpro parity.** Physical iPhone/Android remain required after this redesign.

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
| Scheduling / dispatch | 6.0 | M6 local resource layer (not Simpro-depth) | No |
| Reliability / recovery | 4.5 | `due_on` list loads locally; PWA dismiss via **controlled** event | No |

## Hardening pass — 14 Sep 2026 (local sandbox)

App: `http://127.0.0.1:5174` with `VITE_SUPABASE_URL=http://127.0.0.1:55321` (overrides `.env` production URL).
Data: local Supabase only. Company “Building Technology Solutions”. **No writes to `ezszahvwwmbuekpedumf` or grafter.com.au.** Local login passwords are not recorded here.

Local-only tables (`expenses`, `staff_hours`) stay in `scripts/local-apply-cogs-hours.sql` / `scripts/local-validation-fixtures.sql`. Milestone 6 dispatch tables stay in `scripts/local-m6-dispatch-resources.sql`. Those files are **not** production migrations. `GRANT` is `authenticated` + `service_role` only. `REVOKE ALL` from `anon` and `PUBLIC`. Re-run is idempotent (`NOT EXISTS`). Static guard: `src/lib/localFixtureSql.test.ts`. Live local check: `has_table_privilege('anon', …)` is **false** for SELECT/INSERT/UPDATE/DELETE on both tables. All three local jobs share one `company_id`.

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

### Milestone 6 — resource-aware dispatch (14 Sep 2026, local only)

**Not 9+. Not Simpro parity.** No production migration. Schema lives in `scripts/local-m6-dispatch-resources.sql` (`LOCAL SANDBOX ONLY` / `Not a production migration`). **Not** copied into `supabase/migrations`.

Applied to local Docker Postgres (`supabase_db_BTS_INSPECT`) only. Company “Building Technology Solutions”. Seed: Tester ticket, Fluke tester (available), EWP-1 (out of service), dated member qualifications. `profiles.licence_number` stays display-only.

#### Local schema

Job columns: `dispatch_ready`, `dispatch_version`, `required_crew_count`, `last_dispatch_override_at`, `last_dispatch_override_reason`.

Tables (all `company_id` + RLS, `authenticated`/`service_role` only, `REVOKE` from `anon`/`PUBLIC`):

- `dispatch_skills`
- `dispatch_member_qualifications`
- `dispatch_resources` (operational pool — not `assets`, not stock)
- `job_skill_requirements`
- `job_resource_requirements`
- `job_resource_allocations`
- `dispatch_events` (`UNIQUE (company_id, idempotency_key)`)

Write path: `public.save_job_dispatch(jsonb)` is `SECURITY DEFINER` with `search_path = pg_catalog, public`. Every save loads the locked job, catalogue, qualifications, resource state and sibling allocations from the database. Client `conflicts` / `overridden` are not trusted. Crew and selected resources are locked `FOR UPDATE` in ID order before availability checks. Crew + requirements + allocations + job bump (`clock_timestamp()`) + one `dispatch_events` row are one transaction. Replay on the same idempotency key (`replayed: true`). `stale_dispatch` / `tenant_mismatch`. Hard conflicts raise `dispatch_blocked` with JSON `DETAIL`. Soft gates (`hours_unknown`, hours window, planning crew/resource shortfall) need an **admin** and a non-empty reason. Members cannot override. Admins cannot override hard conflicts. Execute: `authenticated` + `service_role` only. No second `staff_hours` table.

Live privilege: `has_table_privilege('anon', …, SELECT/INSERT)` is **false** on all seven new tables. `authenticated` can **SELECT** job requirements, allocations and events, but **cannot INSERT/UPDATE/DELETE** them (RPC only). Catalogue writes are **admin** + same company.

#### Browser (signed-in local, `127.0.0.1:5174`)

| Viewport | Check | Result |
| --- | --- | --- |
| 1366×768 | Schedule: **Needs resources** filter | Present. Empty filter now states that no jobs need resources or have a recorded override, and to turn the filter off. |
| 1366×768 | Job `#0001` Requirements | Tickets / equipment / ready checkbox in Schedule & crew. Tester ticket saved via RPC (`job_skill_requirements` + one `assign` event). |
| 1366×768 | Hard blocks | EWP-1 out-of-service did not insert an allocation. Clear crew without override reason left `assigned_team` unchanged; still one event. |
| 390×844 | Schedule | Agenda/list (`scrollWidth` 390). No desktop grid. **Needs resources** in the toolbar (not a new sticky). |
| 390×844 | Job field path | On-site strip unchanged (JHA / Take 5 / Clock / Photo / Note / More to do / All done). JHA target 44px. One sticky. |
| 375×667 | Schedule + job | `scrollWidth` 375. Agenda list + same On-site strip. Take 5 still needs a parent JHA. |

Screenshots: `docs/validation/2026-09-14/desktop-1366-job-dispatch.png`, `desktop-1366-schedule-needs-resources.png`, `phone-390-schedule-agenda.png`, `phone-390-job-field-m6.png`, `phone-375-schedule-agenda.png`, `phone-375-job-field-m6.png`.

No maps, travel time, or route suggestions.

#### Automated

| Check | Result |
| --- | --- |
| Full `vitest run` | **92 files, 1094 passed, 0 skip** (14 Sep 2026, this machine, after server-side validation pass) |
| `vite build` | **Pass** (`built in 2m 26s`) this pass. |
| Live local RPC | `scripts/local-m6-dispatch-security.sql` — **passed** (NOTICE: server validation, override policy, tenant, stale, retry, and RLS checks passed) |
| Live local race | `scripts/local-m6-dispatch-race.ps1` — **passed** (one kit allocation; second client `dispatch_blocked`) |

Covered in unit tests: valid/expired/missing qualification; licence does not satisfy a skill; valid allocation; OOS and overlap blocks; timed crew overlap; planning warning vs ready block; admin reason + member reject; tenant/stale RPC mapping; idempotent payload key; legacy job readable; no `staff_hours` recreation; Needs resources empty copy.

#### Security pass — live local negatives (server-side, 14 Sep 2026)

Crafted RPC with `overridden: false` against isolated fixtures (`M6 Hard Ticket`, `M6 Dead Kit`, `M6 Race Kit`). Jack’s real Tester ticket was not expired. Isolated fixtures (not a production login path):

| Case | Result |
| --- | --- |
| Missing mandatory qualification | `dispatch_blocked` / `missing_qualification`; no job/allocation/event write |
| Expired qualification + admin reason | `dispatch_blocked` / `expired_qualification`; no write |
| Out-of-service resource | `dispatch_blocked` / `resource_out_of_service`; no write |
| Resource overlap | `dispatch_blocked` / `resource_overlap`; no write |
| Timed crew overlap | `dispatch_blocked` / `crew_timed_overlap`; no write |
| Ready/confirmed omit required resource | `dispatch_blocked` / `required_resource_missing`; no write |
| Member + hours_unknown + reason / `overridden: true` | `override_forbidden`; no write |
| Admin soft without reason | `override_reason_required`; no write |
| Admin soft with reason | success, `overridden: true` |
| Other-company JWT on a BTS job | `tenant_mismatch` |
| Admin JWT allocating another company’s resource | `tenant_mismatch` |
| Same idempotency key twice | One allocation, one event, `replayed: true` |
| Second key with stale `updated_at` | `stale_dispatch` |
| `has_function_privilege('anon'/'public', save_job_dispatch, execute)` | **false** — catalog evidence that execute is revoked. **Not** a direct anonymous invocation proof. `SET ROLE anon` then calling this SECURITY DEFINER is a **local-image limitation** (segfault on this Docker Postgres); do not treat that crash as the grant test. |
| Other company `SELECT` on BTS `dispatch_resources` as `authenticated` | 0 rows |
| `authenticated` INSERT into `dispatch_events` / allocations | denied |
| Two clients, same kit, same slot | exactly one allocation |

`now()` stays `clock_timestamp()` on job writes.

#### Pre-push static/security check (15 Sep 2026)

- `save_job_dispatch` and `dispatch_time_to_minutes` set `search_path = pg_catalog, public`. Every relation in the RPC body is `public.`-qualified (`jobs`, `profiles`, catalogue, allocations, events, `staff_hours`).
- Script grants: `REVOKE ALL … FROM PUBLIC, anon` then `GRANT EXECUTE … TO authenticated, service_role`. Live catalog on local Docker: `authenticated` / `service_role` execute **true**; `anon` / `public` execute **false**.
- Race helper is two `docker exec … psql -U postgres` sessions (peer auth). No dblink, no committed password, no reusable credential in `scripts/local-m6-dispatch-race.ps1`.
- `dispatch_blocked` DETAIL is JSON `{ code, conflicts }` (kind / severity / operator-facing message / overridable). The client maps that to `blocked` plus the first conflict message. Stale/tenant/override codes use fixed copy. Unexpected RPC text is **not** shown (`Could not save dispatch.`).

#### Limitations

- Local schema only. Production still has no dispatch-resource tables.
- **Physical-device gate is now the stop:** iPhone and Android — safe area, hardware keyboard, offline/retry, VoiceOver, TalkBack. Feature work on this branch pauses until that gate is run. No new signed-in browser pass on the validation commit itself.
- Direct `jobs` updates (legacy last-write-wins) still exist when the sandbox schema is missing, and for status/date fields outside this RPC.
- No maps or travel work.
- No new dispatcher role; admin only for soft override.

## Review branch

Pushed `integration/job-workspace-tabs` as a **review backup only** at `6863cbd`. Do not merge. Do not deploy to `grafter.com.au` or apply production migrations.

## Milestone 7 — Schedule / Dispatch Centre (15 Sep 2026, local)

**Not 9+. Not Simpro parity. Not physical-device complete.**

Hierarchy rebuild of Schedule around dispatcher work. Did not restyle borders only.

### What changed

- One compact **dispatch command bar**: title + live summary, Today / prev / next, readable range, Day/Week, Needs resources + count, Hours & leave disclosure, 7am–5pm vs 6am–8pm, New Job. Desktop crew filter sits inside that bar.
- **Hours & leave** is closed by default (`StaffHoursPanel` `open`). Office can still record dated hours.
- Day board default **7am–5pm** at **72px/hour** so a normal workday fits 1366 without default horizontal scroll. Jobs outside that window increment the extended-hours control; they are not silently dropped. Full 6am–8pm remains available.
- Crew rows still show name, job count, booked/available hours, off/over. Job cards use **hard / soft / override chips** instead of muted sentences.
- Right rail is a **Dispatch queue** grouped No date / Blocked / Unassigned / Needs resources, with a compact empty state.
- Mobile is **agenda first** (date command + today’s list), then the queue. Hours stay a secondary disclosure. On-site job strip unchanged.

### Preserved

`jobs.assigned_team`, day/week views, drag/drop and timed drop (`save_job_dispatch` + booking warnings), crew colours, `staff_hours`, M6 requirements/allocations/readiness/hard-soft rules/idempotency/RLS, auth/role boundaries. No second calendar, no extra hours table, no paid calendar dependency.

### Local fixture

`scripts/local-m7-dispatch-centre.sql` — `LOCAL SANDBOX ONLY`, not a migration. Applied to local Docker. Fictional titles `LOCAL M7 …`: timed overlap, late/over-hours, untimed, unassigned, no-date, ready job with EWP-1 (hard), recorded override. Jack + M6 Member. Static guard in `localFixtureSql.test.ts`.

### Viewport evidence

Signed-in Schedule screenshots **were not captured** this pass: Cursor browser tabs were on `/login`. Baseline/after files under `docs/validation/2026-09-15/` were **not written**. Emulator viewports (1366, 1440, 390, 375) are **not physical**. Interaction (Day/Week, New Job, crew filter, Needs resources, Hours disclosure, click-through, drag/drop, M6 blocks) needs a signed-in local session after this commit.

### Automated

| Check | Result |
| --- | --- |
| Full `vitest run` | **93 files, 1096 passed** |
| `vite build` | **Pass** (`built in 1m 23s`) |

### Remaining gates

Physical iPhone Safari and Android Chrome, offline/retry, hardware keyboard, VoiceOver, TalkBack. Safe-area on hardware. No 9+ mobile claim until both phones are evidenced.

## Milestone 7 — physical-device validation (15 Sep 2026)

**Not started on hardware. Not 9+. Not mobile-complete.**

Fetch confirmed `HEAD` = `origin/integration/job-workspace-tabs` = `6863cbd`. No reset.

### Runtime before sign-in (this session)

| Role | Resolved URL |
| --- | --- |
| Vite | `http://127.0.0.1:5174/` (`--host 127.0.0.1`) |
| Local Supabase (Kong) | `http://127.0.0.1:55321` (Vite override `VITE_SUPABASE_URL`) |

`.env` still names production `ezszahvwwmbuekpedumf.supabase.co`. That host was **not** used. No tunnel. No `grafter.com.au`.

### Physical devices

| Device | Result | Blocker |
| --- | --- | --- |
| iPhone + Safari | **Not run** | No physical iPhone attached to this Cursor session; Safari on device cannot be operated from here. |
| Android + Chrome | **Not run** | No physical Android attached to this Cursor session; Chrome on device cannot be operated from here. |

No screenshots. Notes: `docs/validation/2026-09-15/physical/NOT-RUN.md`. Emulator / 390 / 375 passes stay interim only.

Physical sign-off remains open after the dispatch-centre redesign. Resume hardware validation when both phones are on the private LAN.
