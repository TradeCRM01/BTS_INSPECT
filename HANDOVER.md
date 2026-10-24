# Grafter redesign handover (24 Oct 2026)

This file is for Jack. It explains where the Grafter redesign is up to and how to carry on in Cursor, either with cloud agents or on your own computer. Every Cursor agent also reads the short rule file `.cursor/rules/grafter-quality-bar.mdc`, which points back here.

Times are Brisbane time (AEST). A "sha" is the short ID of one exact version of the code (for example `459d435b`). "main" is the live branch: whatever is on main gets deployed.

## 0. How to start work in Cursor

**Cloud agent (runs on Cursor's servers):**
1. Open https://cursor.com/agents and start a new agent on `TradeCRM01/BTS_INSPECT`, branch `main` (or the PR branch you are finishing).
2. In the prompt, name the PR or page, paste the "What is left" list from section 2, and say "follow HANDOVER.md and the quality bar rule".
3. When it pushes, precheck its head sha yourself (or with a second agent) against section 4 before you sign off.

**Locally (on your own computer):**
1. `git clone https://github.com/TradeCRM01/BTS_INSPECT.git`, then `npm ci`.
2. Copy `.env.example` to `.env` and fill in the Supabase URL and anon key (never commit `.env`).
3. `npm run dev` starts the app. `npm test`, `npm run typecheck` and `npx playwright test` run the checks. `AGENTS.md` has more detail.
4. To finish an open PR, check out its branch: `git fetch origin && git checkout <branch>`.

Cursor agents pick up `AGENTS.md` and everything in `.cursor/rules/` automatically.

## 1. What is live now

| PR | What it did | Merged as | Notes |
|---|---|---|---|
| [#403](https://github.com/TradeCRM01/BTS_INSPECT/pull/403) | Today page (dashboard) rebuilt to the mockup | `aad2eef7` | Live proven on test company 40183ed1. |
| [#405](https://github.com/TradeCRM01/BTS_INSPECT/pull/405) | Landing page headline wrap and iPhone safe-area fix | `459d435b` | Deployed 24 Oct 18:06 AEST. Live bundle `index-CPoBCTD1-r2.js`. Main is `459d435b`. |

"Safe area" means the strip at the top and bottom of an iPhone screen where the clock, notch and home bar sit. Content must not hide under it.

## 2. Open work, in merge order

Merge **one PR at a time**, in this order. Each one goes through the full release flow (section 5) before the next starts.

A "cloud agent" is a Cursor agent that runs on Cursor's servers. The links below open the last agent that worked on each PR, so you can read its history. Start a fresh agent for new work rather than continuing an old one unless you are sure its context is still right.

A "kill file" is a test file whose job is to fail (go red) when the product is wrong. "Frozen" means it was written first, in its own commit, and must not be edited by the builder.

### 2.1 #406 Today 768 Customize fix
- Link: https://github.com/TradeCRM01/BTS_INSPECT/pull/406 (open, ready for review)
- Head sha: `1b0f7e03` (r6, pushed by the builder but **not yet prechecked**). Last prechecked round was r5 `40164717`.
- Last cloud agent: https://cursor.com/agents/bc-e4603a4b-f098-5a99-89c0-3449c7357ff1 (do not continue it; start fresh)
- Frozen kill (do not edit): `src/test/hf406.frozen.mocks.ts`, `src/test/hf406.frozen.entry.tsx`, `src/test/hf406.frozen.matrix.ts`, `src/test/hf406.frozen.chromium.kill.tsx`, `src/test/hf406.frozen.webkit.kill.tsx`, `vitest.hf406-frozen.config.ts`, and the `test:hf406-frozen` script in `package.json`. Frozen at commit `3d82b22f`.
- Status: the product passes the frozen kill (12 of 12 on r5, Chromium and WebKit, both time zones). Only test files are left.
- What is left:
  - A few `p1Dashboard.{chromium,webkit}.kill.tsx` tests need the spec-change update: the drag handle is **absent at 768px wide** (and `.dashboard-home-widget-resize` count is 0), and **present and dragging at 1024px and up**. Remove the `if (handle)` guard so the test cannot quietly pass.
  - The "1024 neighbour gaps" test was flaky (3 of 10). Fix it with `expect.poll` and an exact value, not a looser range.
  - The r6 push says it does both (builder's own claim, unchecked). Precheck r6 with a no-loosening diff against `40164717`: confirm every original expected value is byte-identical (including "resize keeps saved x"), the guard is gone, and the frozen files are unchanged since `3d82b22f`.
  - Then mutants, gates, and a look check (768 button crowding, left border near x 22, empty space in cards).

### 2.2 #402 `?look=` production gate
- Link: https://github.com/TradeCRM01/BTS_INSPECT/pull/402 (draft)
- Head sha: `b561c1d4` (r5)
- Last cloud agent: https://cursor.com/agents/bc-c8da0653-a7a2-5e09-85c8-08d4a64ae4d3
- What it does: makes sure the `?look=` preview fixtures (fake demo data used for design proofs) can never show in the live app.
- Last verdict: the substance passes, but it is out of date with main.
- What is left: rebase onto current main (replay its commits on top of the latest main), add a kill for the surviving mutant called M2b, fix the `:2184` line citation, then a short delta precheck.

### 2.3 #399 Schedule page
- Link: https://github.com/TradeCRM01/BTS_INSPECT/pull/399 (draft)
- Head sha: `e14c4aa8` (r13)
- Last cloud agent: https://cursor.com/agents/bc-d6afb65d-2cbe-5cde-837b-9a73ec915c16
- Last verdict: gates and WebKit pass; the mutant run was about 114 of 142 done when work paused.
- What is left:
  - Mutant survivors to fix or judge (full list and notes on the bot's computer in `p2-399-precheck.md`): `agenda-min-width`, `agenda-min-width-r9`, `agenda-time-ink`, `clock-narrow-col`, `day-clock-clip-r9`, `own-clock-clip-dayboard-r9`, `fade-pointer`, `flex-2col`, `hide-header`, `hour-lines-cream`, `quiet-24`, `seg-32`, `seg-on-unfilled`, `seg-on-unringed`, `ref-ellipsis`, `track-no-scroll`, `track-overflow-hidden`, `unguarded-dark`, `r13-own-cols-drop-company`, `r13-own-limit-huge`.
  - The jobs query must stay bounded (a hard limit, never "select everything"), with a test that seeds more than 200 jobs.
  - Pin the board column list as a literal, not by importing the same constant the code uses.
  - Change the "whisper" `toContain` checks to exact `toBe`.
  - Audit any baseline numbers taken from a fixture against the "no hardcoded baseline" rule.
  - WebKit checks at 320, 375 and 390 wide.
  - Check whether this PR has loosened tests twice. If yes, write a frozen kill first (see section 4).

### 2.4 #407 Jobs page (replaces closed #400)
- Link: https://github.com/TradeCRM01/BTS_INSPECT/pull/407 (open, ready for review)
- Head sha: `c11a7003` (r18)
- Last cloud agent: https://cursor.com/agents/bc-60cb42e2-5370-554f-8617-28b814e34d53
- Desktop look: approved by Jack.
- What is left:
  - Phone type lighter below 768px: job title about 24px semibold; detail values regular weight.
  - The "ring-strong" mutant survives because the ring colour is only checked in computed CSS. Add a painted (real pixel) ring colour check.
  - Not yet run on r18: Brisbane time zone vitest, WebKit at 375 and 390, the full gates, and a look check (the 11px bill label at 320).

### 2.5 404b Customize bug fix (thin PR)
- Not started. #404 was closed unmerged.
- Plan: after #406 is live, do a read-only audit of Customize on the live app, write a frozen kill first, then build from a fresh main.
- Keep it thin. It never blocks the page rebuilds.

## 3. Remaining pages, in order

After the open PRs above:

1. Invoices (list, view, pay, PDF, client portal)
2. Quotes (list and editor)
3. Field (inspections, JHA, Take 5)
4. Clients (list and detail)
5. Sign-in (sign in, sign up, reset)
6. Shell nav (top nav and phone tab bar; nav words are locked by Jack)
7. Settings (company, billing, team)
8. Appearance
9. Landing
10. Email
11. Reports, Inventory, Internal tools
12. S3 dark mode, last of all. Dark carry: the iPhone status-bar style and the `theme-color` must switch with the theme.

Every page is a **layout rebuild that matches its mockup**, never just a recolour. Measure against the mockup at 390 (phone) and 1280 (laptop), and check 320, 375, 768 and 1024 too.

## 4. The quality bar (gates on every PR, including visual-only ones)

A "gate" is a check that must pass before merge. All of these apply to every PR:

- **TypeScript:** `tsc` error count must be 180 or fewer (main's baseline).
- **Unit tests (vitest):** the list of failing tests must equal main's list exactly, in **both** `TZ=UTC` and `TZ=Australia/Brisbane`, with **0 skipped**. Main's current 13 known fails: formFieldFit, inspectionsList, invoiceSheetClientEmail, invoiceSheetClientPhone, jobReminder, jobReminderClientAttach, pageAudit, sendInvoiceDeliver, sendReportDeliver, quoteInvoiceSendNextLook, quotesEditorTheme, reports/jha/compose, reports/take5/theme. (`jobClientFieldErrorLayout` needs `/tmp/pw` and only runs on the bot's computer.)
- **Browser tests (Playwright, Chromium):** green.
- **Text past the screen edge:** at 320, 375 and 390 wide, check every text node's rectangles (client rects) against `innerWidth`. Checking `scrollWidth` alone is not enough. Check `body` as well as the document.
- **Phones in WebKit too:** run phone checks in Playwright **WebKit** (Safari's engine) as well as Chromium. The repo's Playwright 1.48 WebKit will not launch on Debian 13, so use the official `mcr.microsoft.com/playwright:v1.48.2-jammy` Docker image, or a Mac. A WebKit run with 0 tests is a **FAIL**.
- **iOS home-screen safe area:** check the standalone (added to home screen) view with a 47px top inset. Insets use `padding-top: max(<px>, env(safe-area-inset-top))` or `calc(<px> + env(safe-area-inset-top))`, never both stacked (doubled).
- **Sideways scrolling:** only `.hub-day-track` may scroll sideways. Nothing else.
- **Real kills:** tests must check behaviour (what the user sees or what gets saved) and must go red when the real source file is broken on purpose (a "mutant"). A check that only reads computed CSS, greps source, or edits itself does not count.
- **No loosening between rounds:** weakening a test (toBe to a range, removing an assert, widening a tolerance, skipping) is an instant fail.
- **Loosened twice:** for a PR that loosened tests twice, write the test file first, in its own commit, and freeze it. The builder may not touch it.
- **Compare against real main:** build main in the same run and compare against it. Never use hardcoded or committed baseline numbers.
- **Values that wobble:** if a value changes run to run, use a band from 10 or more main runs.
- **Fonts:** load the real Geist font before measuring anything.

### WebKit wrapper
On the bot's computer, `/workspace/grafter-proofs/tools/webkit148.sh` runs a command inside the jammy image with real WebKit 18.0. It fails closed: exit 2 if WebKit does not launch, exit 3 if 0 WebKit tests ran. Usage:

```
webkit148.sh [--out DIR] <worktree> -- <command...>
```

To do the same yourself on Linux:

```
docker run --rm -it -v "$PWD:/app" -w /app mcr.microsoft.com/playwright:v1.48.2-jammy \
  bash -c "npm ci && npx playwright test --project=webkit"
```

Then confirm the report shows more than 0 WebKit tests.

## 5. Release flow (every PR)

1. **Precheck** the head sha against all the gates in section 4.
2. **Sign-off** written down and pinned to that exact head sha. If you work solo, you play the sign-off role: write "signed at <sha>" in the PR.
3. **Pinned squash merge**: merge with the head sha pinned, so nothing pushed after the sign-off sneaks in.
4. **Database first**: if the PR has a Supabase migration (a database change), apply it to production project `ezszahvwwmbuekpedumf` **before** the Cloudflare deploy.
5. **Deploy** (Cloudflare Pages runs on push to main) and confirm the run succeeded and the bundle name changed.
6. **Live check** on test company **40183ed1 only**.
7. **Close** with before and after screenshots (390 and 1280).

## 6. Hard rules

- **Never** use company 8d88e1d6 (Jack's real business) or b62e2079 (his sandbox) for tests. Probe rows go in company 5a106e2d.
- Grafter copy is for **all trades** (never electrician-sounding) and has **no em dashes**.
- Public copy shows **no dollar prices**. "2 months free" is set; the weekly price is undecided.
- Parked (do not start): Stripe billing, SMTP, Twilio, Relovi. (Relovi and Littleloop never appear in product copy; see `.cursor/rules/hard-locks.mdc`.)
- HOLD PRs: #244, #245, #259. Do not merge or rework them.
- Never commit or print secrets (Twilio keys and the like).
- `ANTHROPIC_API_KEY` stays unset.
- Never put a made-up ABN in production.
- Cursor on-demand usage stays **off**. Cloud work runs on the monthly quota.

## 7. Testing on a real iPhone

After any change to the status bar or the web app manifest (the file that sets the home-screen name, icon and colours), **delete the Grafter icon from the home screen and add it again**. iOS caches the old settings until you do.

## 8. Known follow-ups

- **SWEEP-2b PWA-1:** the manifest description still says "Field inspection and reporting platform" (needs all-trades copy, no em dashes); add a one-time iOS "Add Grafter to your Home Screen" tip (never shown in standalone); fold the Reminders and Your widgets behind a "More on Today" fold on phone; standalone safe-area insets at 375 and 390 (header clears the notch, bottom nav clears the home bar) with kills.
- **SWEEP-12:** the trailing date on Today gets cut off (truncated).
- **SEC-SMTP follow-up:** the email "set" indicator should come from `email_smtp_ready()`. Must land before the SMTP lane unparks.
- **App shell safe area:** there is no logged-in check yet of the app shell's safe-area inset. Do one on a real iPhone (after re-adding the icon).
- Test jobs #0149 and #0150 on 40183ed1 are left for the demo-seed cleanup.

## 9. Design mockups (where they are)

The mockups live **on the bot's computer, not in this repo**, under `/workspace/grafter-proofs/design/directions/`. The target is the `4-dark-light/` direction (light frames now, dark frames for S3). If you want them in the repo, ask Ai Coach to commit them to `docs/design/`.

Each frame below also has `-vp-01`, `-vp-02` (and sometimes `-vp-03`) viewport slices, and an HTML source in `4-dark-light/html/`.

`4-dark-light/` (light; each also has a `-dark` twin):
- `dashboard-390-light.png`, `dashboard-1280-light.png`
- `schedule-1280-light.png`
- `job-390-light.png`
- `invoice-view-390-light.png`, `invoice-pdf.png`, `portal-invoice-390.png` (no dark twin)
- `quote-390-light.png`
- `clients-390-light.png`
- `signin-390-light.png`
- `settings-1280-light.png`
- `appearance-390-light.png`, `appearance-1280-light.png`
- `landing-390-light.png`, `landing-1440-light.png`
- `email-640.png`
- `kit-4-dark-light.png` (the component kit, used for pages with no frame: Field, Reports, Inventory, Internal)

`nav/4-dark-light/` (light and dark):
- `tabbar-390-light.png`, `more-sheet-390-light.png`
- `topnav-768-light.png`, `topnav-1024-light.png`, `topnav-1280-light.png`, `topnav-1920-light.png`

Side-by-side boards in `directions/`:
- `board-4-dark-light.png`
- `compare-dark-vs-light-{appearance-390, clients-390, dashboard-390, dashboard-1280, invoice-view-390, job-390, landing, landing-390, nav-390, nav-1280, quote-390, schedule-1280, settings-1280, signin-390}.png`

Earlier directions kept for reference only: `1-mission-dark/`, `2-monochrome-light/`, `3-evolved/`.

## 10. Where the detailed notes are

On the bot's computer, in `/workspace/grafter-proofs/design/`:
- `notes/overnight-resume.md` (the running log; see "HANDOVER STATUS")
- `hf-403-768-precheck.md` (#406), `look-gate-402-precheck.md` (#402), `p2-399-precheck.md` (#399), `p3-400-precheck.md` (#407, see "c11a7003 (r18)"), `hf-land-1-precheck.md` (#405), `pr404-r11-diff.md` (the closed #404)
- `notes/decisions.md` (approved design decisions), `notes/redesign-page-ranking.md` (why the page order is what it is)
