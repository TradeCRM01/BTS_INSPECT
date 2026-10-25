# Grafter Dark + Light: build plan, shell PR onward

**Status:** plan only. No PRs are opened from this document; the Lead cuts and opens every PR. Jack approved the full Direction 4 build on 19 Oct 2026, 20:15 AEST.
**A0 is not in this file.** The `[data-theme]` token layer, its zero-visual-change pixel-diff and the head script are in [`BUILD-PLAN-A0.md`](BUILD-PLAN-A0.md), with `handoff/tokens.css` and `handoff/theme-init.js`. These files are owned by a separate stream. This plan starts at the first PR after A0 and uses the token names from `handoff/tokens.css`. See §2 for how those names map to the Direction 4 mockup values.
**Repo baseline:** app repo `main`, read-only reads on 19 Oct 2026 at about 20:30 AEST. Line numbers refer to that read; re-check them when each PR is cut.
**Look targets:** this folder (`*-dark.png`, `*-light.png`, `*-vp-NN.png`), `../board-4-dark-light.png`, the `../compare-dark-vs-light-*.png` sheets, `kit-4-dark-light.png`, and `../nav/4-dark-light/`.
**Rules carried from `spec/implementation-plan.md` §0:** thin PRs, token-first, style only, look tests move with the style, revert-safe, draft until FUNCTION PASS, LOOK, SIGN, and the Lead merges. Snippets A (overflow), B (clipped text) and C (money fingerprint) are unchanged.

---

## 0. Order and gates (Coach, binding)

| Step | What | Gate to start |
|---|---|---|
| P0 | Finish #383, #373, #380, #382 | #383 `feat(templates): seed built-in renderers` is already merged (closed 19 Oct, 20:30 AEST). #373 money rounding parser, #380 input junk rejection and #382 one-word company name in the header are open drafts. |
| A0 | Themed token layer, zero visual change in Light | Starts now, in parallel with P0. See `BUILD-PLAN-A0.md`. |
| S1 | Brand: Geist, Mitre logo, favicon, app icons, manifest, `<Wordmark/>`, `<BrandMark/>`, `BRAND_NAME` | After A0 **and** #382, since both touch the header lockup |
| S2 | Shell and nav: visual switch to the new Light map | After S1 |
| S3 | Settings > Appearance plus profile persistence; Dark becomes reachable | After S2 |
| K1–K6 | Shared components, themed | After S2; can run in any order, except K4 → C1 |
| P1–P12 | Page migrations | After K1–K4 |
| D1–D3 | PDFs, portal and emails, fixed light | After S1, in parallel with P1–P12 |
| L1 | Landing: dark hero by default | After S1 and #384 (landing price copy) |
| C1–C11 | Strip `!important` and `.btn-primary` overrides, then the raw-colour lint | Per area, after that area's page PR |
| Z1 | `system` follows the OS (Dark for OS-dark users by default) | Last |

Why Z1 is separate: per Coach (b), Dark values are reachable only through Appearance from S3 on. Until every page is migrated, `system` resolves to Light, so OS-dark users never land on a half-migrated page. `handoff/theme-init.js` holds the switch as `DARK_READY`, per the comment in `handoff/tokens.css` §3. This plan splits it into two flags: `DARK_READY`, which allows an explicit Dark choice and turns on at S3, and `SYSTEM_DARK`, which lets `system` follow the OS and turns on at Z1. The A0 stream should confirm that split in `theme-init.js`.

## 1. Acceptance criteria for every PR from S1 on
A PR is not ready for LOOK until all of these pass, in **both themes**. Before S3, "both themes" means Light plus Dark forced by `document.documentElement.dataset.theme='dark'` in the prover's capture script. Users can't reach Dark yet, but the frames are still taken.
1. **Frames:** full-page before and after frames at **375, 390, 1024 and 1280**, in **light and dark**, for every touched page and state. Name them `{pr}-{page}-{state}-{theme}-{before|after}-{width}.png`, for example `p05-invoice-view-part-paid-dark-after-390.png`. Capture at DPR 2 with the fixed clock and the Northside Plumbing & Gas demo tenant.
2. **No overflow:** snippet A passes at each width in each theme.
3. **No clipped text:** snippet B passes.
4. **Contrast:** body text and labels 7:1 or better, pills 4.5:1 or better (7:1 is the target), non-text UI 3:1, in both themes. Run the computed-style contrast walk from `_src/render.js` (`minCR`) on each frame; the values to meet are in `contrast.json`.
5. **0 raw colours:** no hex, `rgb()` or `hsl()` literal outside `src/styles/tokens.css` in the touched files. Also, no computed colour on the touched pages is outside the token set in either theme (the "stray" walk from `_src/render.js`).
6. **Money unchanged:** snippet C output is identical before and after. `gst.ts`, job bill and invoice total tests pass untouched.
7. **Behaviour and routes unchanged:** no edits to handlers, hooks, queries or `src/App.tsx` routes. Only S3 changes behaviour, and its scope is stated.
8. **Green only in pills:** no element outside `.pill`, `[data-status]` or the status badge has a computed colour with hue 85–175 and saturation 0.2 or more.
9. **Theme switch:** with the page open, toggle `data-theme`. Nothing moves; the bounding boxes of the top 50 elements are identical in both themes.

## 2. Token names (from `handoff/tokens.css`) and Direction 4 values
`handoff/tokens.css` holds three maps: block 2 is Light as live today (A0), block 3 is Dark, and block 4 is the new-identity Light applied at S2. This plan uses those names. The values below are the Direction 4 mockup values (`tokens.css` in this folder, contrast in `contrast.json`). Where they differ from `handoff/tokens.css` blocks 3 and 4, or fill an UNVERIFIED gap there, **Coach signs which wins before S2**. Proposed resolution: use the Direction 4 values, because those are the ones the frames and the 54-pair contrast table were measured on.

| handoff name | Role | D4 mockup token | D4 Light | D4 Dark | Note vs handoff |
|---|---|---|---|---|---|
| `--g-surface` | Page | `--g-bg` | `#F5F5F7` | `#0A0A0B` | Same |
| `--g-surface-raised` | Cards, sheets, inputs | `--g-surface` | `#FFFFFF` | `#121214` | Same |
| `--g-surface-2` | Wells, hover rows | `--g-surface-2` | `#EBEBEE` | `#1C1C1F` | Handoff new-Light is `#F5F5F7` (equal to page); D4 needs a visible well |
| `--g-ink` | Body, headings, figures | `--g-ink` | `#0A0A0B` | `#FAFAFA` | Handoff new-Light `#1D1D1F` |
| `--g-ink-muted` | Secondary text | `--g-ink-2` | `#3F3F46` | `#D4D4D8` | Light differs (`#424245`) |
| `--g-ink-subtle` | Labels, meta | `--g-ink-muted` | `#4A4A52` | `#ADADB5` | Handoff Dark `#A1A1AA` is 6.6:1 on surface-2; D4 holds 7.6:1 |
| `--g-line` | Hairlines | `--g-line` | `#E4E4E7` | `#27272A` | Light differs slightly |
| `--g-line-strong` | Strong dividers | `--g-line-strong` | `#A1A1AA` | `#52525B` | Light differs |
| `--g-accent` | **Primary action fill** (the live `.btn-primary` uses accent) | `--g-inverse` | `#0A0A0B` | `#FAFAFA` | Handoff Dark is blue `#4D82FF`. D4's primary is the inverse pair in both themes |
| `--g-accent-hover` | Primary hover | `--g-inverse-hover` | `#27272A` | `#E4E4E7` | Fills the Dark UNVERIFIED |
| `--g-accent-ink` | Text on primary | `--g-inverse-ink` | `#FFFFFF` | `#0A0A0B` | Same |
| `--g-focus` | Focus ring | `--g-accent` | `#183FB8` | `#8FABFF` | Fills the Dark UNVERIFIED (8.4:1 on surface). Light is blue, not ink |
| `--g-ok`, `--g-ok-bg` | Pill: paid, done | `--g-ok`, `--g-ok-bg` | `#0E5A2C` / `#E3F2E8` | `#7DD3A0` / `#0F2A1A` | Same |
| `--g-warn`, `--g-warn-bg` | Pill: due, part paid | same | `#7A2E03` / `#FCEBDF` | `#FDBA8C` / `#2E1607` | Same |
| `--g-bad`, `--g-bad-bg` | Pill: overdue | same | `#8A170F` / `#FBE9E7` | `#FCA5A0` / `#2D0F0D` | Fills both UNVERIFIED (8.1:1 and 9.3:1) |
| `--g-sent`, `--g-sent-bg` | Pill: sent | same | `#1E3A8A` / `#E6EDFB` | `#A9C1FF` / `#132042` | Same |
| `--g-draft`, `--g-draft-bg` | Pill: draft | same | `#3F3F46` / `#EDEDEF` | `#D4D4D8` / `#232326` | Same |
| `--g-overlay` | Sheet scrim | `--g-scrim` | `rgba(10,10,11,.42)` | `rgba(0,0,0,.6)` | Dark differs; `.42` is too light on black |
| `--g-shadow-1`, `--g-shadow-2` | Elevation | `--g-sh-1`, `--g-sh-2` | see `tokens.css` | see `tokens.css` | Dark adds a 1px light edge so sheets read on black |
| `--g-nav-bg`, `--g-nav-ink` | Top nav | `--g-nav-bg`, `--g-ink` | `rgba(255,255,255,.92)` / `#0A0A0B` | `rgba(10,10,11,.92)` / `#FAFAFA` | Same |
| `--g-crew-1..6` | Crew colours (schedule) | `--g-crew-harbour, -clay, -ochre, -dusk, -slate` | `#5D86AE #B0705A #977832 #7F79B0 #717B8A` | `#8FB3D6 #D49A84 #C9A85C #ABA6D9 #A3ACB9` | D4 lifts every crew colour in Dark (7.8:1 or better). D4 has 5 crews and no plum; `--g-crew-2` plum stays a Coach call |
| `--g-chart-1..4` | Chart series | `--g-chart-1`, `--g-chart-2` | `#0A0A0B`, `#A1A1AA` | `#FAFAFA`, `#52525B` | D4 charts are ink plus grey, with value labels. Series 3 and 4 (green, red) would break "green only on pills" |
| `--g-radius-lg` | Card radius | `--r-card` | 14px | 14px | Answers the handoff OPEN: 14px |
| `--g-font-*` | Families | `--font-ui` | Geist | Geist | Handoff block 4 sets mono to Geist Mono. Coach required one family: D4 uses Geist with `tabular-nums` for figures |

**Names the shell PR onward needs that are not in `handoff/tokens.css` yet.** S2 adds these to `src/styles/tokens.css`, with the values from this folder's `tokens.css`:
- `--g-link`: the D4 `--g-accent`, `#183FB8` / `#8FABFF`.
- `--g-accent-press`
- Tab bar: `--g-tab-bg`, `--g-tab-ink`, `--g-tab-active-bg`, `--g-tab-active-ink`. Active is the inverse pair.
- `--g-input-line`: `#808A93` / `#7A7A83`.
- `--g-danger`, `--g-danger-ink`, `--g-danger-hover`, `--g-danger-press`. These are the destructive fill, kept separate from the `--g-bad` pill.
- Pill dots: `--g-ok-dot`, `--g-warn-dot`, `--g-bad-dot`, `--g-sent-dot`, `--g-draft-dot`.
- `--g-sched`, `--g-sched-bg`, `--g-sched-dot`, `--g-live`, `--g-live-bg`, `--g-live-dot`.
- `--g-toast-bg`, `--g-toast-ink`, `--g-toast-action`.
- `--g-disabled-bg`, `--g-disabled-ink`.
- `--g-skeleton`, `--g-skeleton-hi`.
- `--g-press`, `--g-glass`, `--g-glass-line`, `--g-selected` (D4 `--g-accent-tint`).
- `--g-mk-bg` (landing page).
- `--g-dur-theme`: 150ms, and 0ms under reduced motion.

The two Light maps (Coach b): `src/styles/tokens.css` keeps block 2 (live) as the Light values from A0 until S2. S2 replaces block 2's values with the new-identity Light. Names don't change, so no component diff is needed for the swap itself.

## 3. Hard-coded "Grafter" strings (Coach a: trademark risk)
A read-only GitHub code search of `main` for "Grafter" returns **174 files**. It is case-insensitive, so identifiers such as `grafterMark` count. The full list is in `handoff/grafter-string-hits.txt`. 93 of the 174 are tests, 7 are scripts and 9 are Markdown docs or agent rules (including the two legal content files below). The other 66 are runtime files. S1, D1–D3 and the P PRs route them through one constant. They are:
- **Head and manifest:** `index.html` (`<title>`, og and twitter titles, `og:site_name`, `apple-mobile-web-app-title`), `vite.config.ts` (manifest `name` and `short_name`), `public/robots.txt`, `public/sitemap.xml`, `src/lib/publicSeo.ts`.
- **Brand components:** `src/components/brand/BrandLockup.tsx` ("Grafter" text, three times), `grafterMark.ts`, and the legacy mark component in `src/components/brand/`, which BrandMark replaces.
- **Shells:** `src/components/layout/AppShell.tsx`, `OperatorShell.tsx`, `ProtectedRoute.tsx`, `src/components/auth/AuthShell.tsx`, `src/components/legal/LegalShell.tsx`, `src/components/ui/InstallPrompt.tsx`.
- **Pages:**
  - `RootPage.tsx`, `MarketingPage.tsx`, `LoginPage.tsx`, `SignupPage.tsx`
  - `AuthConfirmPage.tsx`, `ResetPasswordPage.tsx`, `BillingSettingsPage.tsx`, `CompanySettingsPage.tsx`
  - `TeamSettingsPage.tsx`, `AiAssistantPage.tsx`
  - `operator/Operator{Billing,Companies,CompanyDetail,Operators,Overview}Page.tsx`
- **Libraries:**
  - Sending and documents: `sendInvoice.ts`, `sendQuote.ts`, `documentShare.ts`, `documentShareDeliver.ts`
  - Reminders and next actions: `jobReminder.ts`, `inspectionDueReminder.ts`, `invoiceNextAction.ts`, `quoteNextAction.ts`
  - Company and platform: `companyBilling.ts`, `companyLogo.ts`, `platformOperator.ts`, `publicAuthPath.ts`
  - Jobs and records: `jobCalendar.ts` (calendar event text), `photoProvenance.ts`, `expenseReceiptAttach.ts`, `timesheetJob.ts`
  - Other: `speechHints.ts`, `labourPriceBookPick.ts`, `scheduleJobPatchStore.ts`, `supabase.ts`, `devFieldAuditAuth.ts`, `devFieldAuditDocs.ts`
- **Reports (PDF):** `src/reports/commercial`, `generic_inspection`, `jha` and `take5`.
- **Server:**
  - Edge functions under `supabase/functions/`: `invite-user`, `forgot-password`, `job-reminder`, `notify-jha-sign`, `test-smtp`, `company-billing`, `platform-operator`, `ai-console`.
  - Other server config: `supabase/templates/invite.html`, `supabase/config.toml`, three migrations (comments or seed text), and the two `workers/missed-call-*` `wrangler.toml` files.
- **Content:** `src/content/terms.md`, `privacy.md`. These are legal text; route them through the constant only if legal agrees.

The rule from S1 on is: the product name lives in **one constant** and **one component**.
- `src/lib/brand.ts` (new): `export const BRAND_NAME = 'Grafter'`, plus `BRAND_DOMAIN`, `BRAND_SUPPORT_EMAIL` and `BRAND_TAGLINE`. Edge functions get a copy at `supabase/functions/_shared/brand.ts`. A unit test asserts the two copies are equal.
- `src/components/brand/Wordmark.tsx` (new): renders `BRAND_NAME` as live text in Geist 600, tracking -0.02em. It takes `size` and `tone` props (`ink` or `onDark`). It is the only place the wordmark is drawn.
- `src/components/brand/BrandMark.tsx` (new): the Mitre mark from `handoff/brand/mark.svg`, filled with `currentColor`. It has no text, so a rename never touches it.
- A lint rule (C11) bans the literal `Grafter` in `src/**/*.tsx` and `supabase/functions/**`, except in `brand.ts` and tests.
- Rename cost after this: one constant, the outlined lockups in `handoff/brand/lockup-*.svg` (used for email and PDF only), the app icons (no text, unaffected), and legal copy.

The 66 runtime hits move to the constant inside the PR that already touches each file: S1 (head, manifest, brand, shells), D1–D3 (documents, emails, server), and P1–P12 (pages and libraries). They don't get a separate sweep PR. Any hit left over goes in C11.

---

## 4. PRs

Each PR lists:
- **Name**
- **Scope:** the exact files
- **Changes**
- **Acceptance:** §1, plus the extra checks for that PR
- **LOOK:** the frames to compare against

### S1. `design(brand): Geist, Mitre mark, favicon, app icons, manifest, brand constant`
- **Scope:**
  - New: `src/lib/brand.ts`, `supabase/functions/_shared/brand.ts`, `src/components/brand/Wordmark.tsx`, `src/components/brand/BrandMark.tsx`.
  - Changed: `src/components/brand/BrandLockup.tsx` (composes BrandMark plus Wordmark) and `src/components/brand/grafterMark.ts` (Mitre geometry; the speed-bar exports are removed once nothing imports them).
  - Assets: `public/fonts/Geist-Variable.woff2` (OFL) and the licence file; `public/favicon.svg`, `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`, all from `handoff/brand/`. Retire `public/icon-192.svg` and `public/icon-512.svg`, and the legacy company logo PNG in `public/` if nothing references it.
  - Config: `index.html` and `vite.config.ts` (manifest).
- **Changes:**
  - Geist `@font-face` in `src/styles/tokens.css`, with `--g-font-*` pointed at Geist. Change the families only, no sizes.
  - `index.html`:
    - Replace the Google Fonts link with a preload of `/fonts/Geist-Variable.woff2`.
    - Keep the signature script families (Allura, Dancing Script, Great Vibes, Pacifico, Satisfy), because `SignatureCapture.tsx` uses them. Drop only Inter, Newsreader, JetBrains Mono, Rajdhani and Source Sans 3, and only once `rg` shows no remaining use.
  - `<title>`, the og and twitter tags and `apple-mobile-web-app-title` read from `BRAND_NAME`, via `vite.config.ts` `transformIndexHtml` or a small `%BRAND_NAME%` replacement.
  - `theme-color`: two tags, `media="(prefers-color-scheme: light)"` with `#F5F5F7` and `media="(prefers-color-scheme: dark)"` with `#0A0A0B`.
  - Manifest: `name` and `short_name` come from `BRAND_NAME`. `theme_color` is `#0A0A0B`; `background_color` is `#F5F5F7`. Icons are the PNGs plus the maskable icon. `apple-touch-icon` is the 180 PNG.
  - Header and auth lockups render BrandMark plus Wordmark. Per S2's split, the header keeps today's navy bar with a white mark on it; the ink-on-light mark arrives with S2.
- **Visual:** a global font swap (Inter, Source Sans 3 and Rajdhani become Geist), the new mark, and new favicon and app icons. Colours don't change; that is S2.
- **Acceptance:**
  - §1.
  - Favicon resolves. The manifest validates in Lighthouse (installable, maskable icon present).
  - `rg -n "Grafter" index.html vite.config.ts src/components/brand src/components/layout src/components/auth src/components/legal` shows hits only in `brand.ts` and tests.
  - The `rg` from S1's index.html change is clean.
  - The `*Look.test.ts` files that pin font families update in this PR.
  - Snippet B at 375 matters most here: Geist is slightly wider than Inter.
- **LOOK:** `../logo/in-context-mitre-*.png` (browser tab, home screen, app header) and `signin-390-light.png` for the auth lockup.

### S2. `design(shell): new Light map, themed shell and nav`
- **Scope:**
  - `src/styles/tokens.css`: block 2 values become the new-identity Light. Add the §2 extra names.
  - `src/components/layout/AppShell.tsx`.
  - `src/components/layout/appShellTheme.ts`.
  - `src/components/layout/appShellPhoneNav.ts`: no logic change; labels and icons only.
  - `src/components/layout/OperatorShell.tsx`.
  - `src/index.css` `.shell-*` block: `.shell-header` L16666, `.shell-menu` L16693, `.shell-menu-item` and `-active` L16698–16706, `.shell-root` L16707, `.shell-phone-menu` L16791, `.shell-bottom-nav` L16795, `.shell-bottom-tab` and `-active` L16805–16814.
  - `src/components/search/GlobalSearch.tsx` (the overlay chrome only).
  - `src/components/ui/InstallPrompt.tsx` and `SWUpdatePrompt.tsx` (they float over the shell).
- **Changes:**
  - Top nav: glass `--g-nav-bg`, ink text, BrandMark and Wordmark in ink on Light and white on Dark. The company switcher holds a 53-character name, wrapping or with a wider max at 1280 and 1920, as in the D4 nav frames. #382's readable one-word rule is kept.
  - Tab bar: `--g-tab-bg`, with the active tab on the inverse pair. More opens the sheet as today.
  - The body background uses `--g-surface`.
  - `appShellTheme.ts`: today the company `report_theme` (navy, accent) tints the header. **Open decision (Jack or Coach):** the proposal is that `report_theme` stops tinting the app shell and applies only to documents (D1). It has no meaningful dark equivalent, and the brief says it must never change the primary colour. If they agree, `resolveAppShellColors` stays for documents, and AppShell stops reading it.
  - `color-scheme` comes from the token layer, so native controls follow.
- **Visual:** the switch. Cream and navy become white, ink and one blue, on the shell and on every page that already reads `--g-*` tokens. Pages that still hold page-level hexes stay as they are until their P PR. That mixed state is expected, and it is why Dark is not reachable yet.
- **Acceptance:**
  - §1, with frames from the core walk (implementation-plan §0.5) plus `/settings/profile`.
  - Header, logo and tab bar sit inside the viewport and are not covered (the `elementFromPoint` check from `_src/render.js`).
  - The top nav at 768, 1024, 1280 and 1920 with the 53-character name passes snippet B.
  - The tab bar's tap targets are 44px or more.
  - `appShellPhoneNav` tests are unchanged.

- **Added 2026-10-20 (Coach and CoS, binding):**
  - From 768 to 1023 the top nav shows visible short labels under or beside each icon (Jobs, Schedule, Clients, Money, More, and so on) in both themes. Tooltips don't count. Every label is a tap target of 44px or more, and the row still fits with the 53-character company name.
  - Every dark selector is gated on `allowDark`, the same flag as theme-init. Setting `data-theme=dark` by hand while `allowDark` is false must leave Light pixels unchanged; if it doesn't, that's a kill in the PR. No dark presentation ships before S3.
- **LOOK:**
  - `../nav/4-dark-light/topnav-{768,1024,1280,1920}-{light,dark}.png`
  - `tabbar-390-*`, `more-sheet-390-*`
  - `../compare-dark-vs-light-nav-390.png` and `-nav-1280.png`
  - `dashboard-1280-light.png` for the shell around content

### S3. `feat(settings): Appearance (System, Light, Dark) saved to the profile`
This is the one PR in this plan that changes behaviour. Its scope is stated, and it ships nothing else.
- **Scope:**
  - New: `supabase/migrations/<ts>_profiles_theme_preference.sql`, which adds `theme_preference text not null default 'system' check (theme_preference in ('system','light','dark'))` to `profiles`, with RLS unchanged: users update only their own row.
  - New: `src/lib/themePreference.ts`, which reads and writes the `grafter-theme` key, applies `data-theme`, adds `html.theme-switching` for 150ms around a change, and writes the profile.
  - `src/contexts/AuthContext.tsx`: on profile load, the profile value wins and is written to localStorage.
  - `src/pages/ProfileSettingsPage.tsx`: the Appearance section.
  - `handoff/theme-init.js` → `index.html` inline: set `DARK_READY = true`, with the A0 stream's sign-off.
- **Changes:**
  - Three radio cards with previews (System, Light, Dark).
  - The outdoors note: "Working outside? Light is easiest to read in direct sun. Dark is fully supported too: every screen keeps body text at 7:1 or better in both themes. Quotes, invoices, emails and the client portal always print on white."
  - Until Z1, choosing System shows "Uses Light for now" under the card, because `SYSTEM_DARK` is off. That is honest about the rollout.
  - Crossfade: `--g-dur-theme` 150ms on background, colour, border and fill only; 0ms under reduced motion.
- **Acceptance:**
  - §1.
  - Behaviour: after a reload, the choice is persisted. Signing in on a second browser context applies the profile value.
  - No flash on first paint: a Playwright trace shows no frame with the wrong theme.
  - The `matchMedia` change applies only when the choice is System and `SYSTEM_DARK` is on.
  - With `emulateMedia({reducedMotion:'reduce'})`, there are no transitions.
  - The migration is reversible: a down migration drops the column.
- **LOOK:** `appearance-1280-{light,dark}.png`, `appearance-390-{light,dark}.png`, and the matching compare sheets.

### K1–K6. Shared components, themed
These keep the component scope and line references from `spec/implementation-plan.md` A2–A9. Values come from §2 instead of the paper kit. Every K PR is captured on the core walk in both themes at four widths.

| PR | Name | Scope (files) | Changes | LOOK |
|---|---|---|---|---|
| K1 | `design(button): buttons on the inverse primary` | `src/index.css` `.btn-primary/-secondary/-ghost/-danger/-icon` (L47–65), `.ops-next-control*` (L238–260); `src/components/ui/PageError.tsx`; `ManagedSelect.tsx` L235 | Primary is `--g-accent` (D4 inverse pair) at 44px, radius 10. Danger uses `--g-danger*`. Disabled uses explicit `--g-disabled-*`. No press scale | Kit, Buttons row, both halves |
| K2 | `design(input): inputs, selects and native controls` | `.form-input`, `.form-input-sm`, global min-height and select styles in `src/index.css`; `ManagedSelect.tsx`, `DateFieldInput.tsx`, `TimeFieldInput.tsx`, `SearchBar.tsx`, `Switch.tsx` | `--g-input-line` border (3.5:1 on Light, 4.4:1 on Dark), 16px text, `--g-focus` ring. Native date, time and select inherit `color-scheme` | Kit, Fields and Native controls sections, both halves |
| K3 | `design(surface): cards, tables, empty and loading` | `.card*`, `.ops-card*`; `OpsCard.tsx`, `SummaryCard.tsx`, `EmptyState.tsx`, `Skeletons.tsx` (also remove the `Math.random()` widths), `DataTable.tsx`, `PageHeader.tsx`, `ViewToggle.tsx`, `Breadcrumbs.tsx` | `--g-surface-raised`, 1px `--g-line`, radius 14. Cards hug their content, with 24px or less of dead space at 390. Skeleton uses `--g-skeleton*` with no pulse under reduced motion | Kit, Cards and Table sections; `dashboard-390-*` |
| K4 | `design(sheet): sheets, dialogs, drawers` | `.overlay-panel*`, `.overlay-backdrop`, `.hub-ops-form-sheet`; `Modal.tsx`, `AppDialog.tsx`, `ConfirmDialog.tsx`, `OverlayPortal.tsx`, `EditorStickyFooter.tsx`, `ContextMenu.tsx` | `--g-overlay` scrim, `--g-shadow-2` (Dark has a light edge), 44px close button. **Ship with C1 straight after**, because the 69 `!important` on the overlay beat it | `more-sheet-390-*`; kit sheet |
| K5 | `design(status): status pills and toast` | `StatusBadge.tsx`; `.ops-status*`, `.badge`, `select.ops-status` in `src/index.css`; `Toast.tsx`, `.ops-toast-host` | 18 statuses map to 7 tones (ok, warn, bad, sent, sched, draft, live), each with its own per-theme text, fill and dot. Green appears only here. The toast is the inverse pair with an `--g-toast-action` link | Kit, Status pills section; `invoice-view-390-*` |
| K6 | `design(a11y): focus, motion, theme crossfade` | Global `:focus-visible` rule in `src/index.css` and removal of the 41 outline-removal rules; motion tokens and the reduced-motion net; the `html.theme-switching` rule; `LoadingSpinner.tsx` | 2px `--g-focus` ring with a 2px offset in both themes. `--g-dur-theme` 150ms, and 0ms under reduced motion | Kit, focus states, both halves |

K acceptance, in addition to §1:
- K1: every primary measures 44px tall, and each view has one primary.
- K2: no input renders under 16px, and focus frames are captured in both themes.
- K3: computed `boxShadow` has no pure-black shadow on Light.
- K4: `dialogKeyboard.test.tsx` passes unchanged.
- K5: a unit test covers the status-to-tone map, and no status text changes.
- K6: tab through each core-walk page; every interactive element shows a ring in both themes. With `emulateMedia({reducedMotion:'reduce'})`, `document.getAnimations().length === 0`.

### P1–P12. Page migrations
Method per page:
- Replace page-level hexes, Tailwind palette classes and `--<page>-*` look variables with `var(--g-*)`.
- Swap in K1–K6 components.
- Map titles to the Geist ramp.
- Make no logic changes.

Extra checks in each P PR:
- `rg -n '#[0-9A-Fa-f]{3,8}\b|rgba?\(|(gray|slate|zinc|neutral|green|emerald)-\d' <touched files>` returns nothing.
- The page's "Grafter" literals move to `BRAND_NAME`.
- The page's images and charts read their per-theme variants (see §5).

`!important` and `.btn-primary` stripping is **not** done here. It is the C PR for that area.

| PR | Name | Scope (page files, plus the components they own) | Routes | LOOK |
|---|---|---|---|---|
| P1 | `design(dashboard): Today on tokens, both themes` | `DashboardPage.tsx`, `src/widgets/WidgetComponents.tsx`, `IntelligenceWidgets.tsx` (KPI series L454–457 move to `--g-chart-*`), `registry.ts` | `/` | `dashboard-1280-*`, `dashboard-390-*`, compare sheets |
| P2 | `design(schedule): schedule, board and timesheets` | `SchedulePage.tsx`, `src/components/crm/BoardViews.tsx`, `EmployeeColorSwatch.tsx`, `ScheduleJobSheet.tsx`, `ScheduleJobSearch.tsx`, `ScheduleBookByVoice.tsx`, `src/lib/jobColors.ts` (crew colours become `--g-crew-*` per theme), `TimesheetsPage.tsx`, `src/components/timesheets/*` | `/schedule`, `/timesheets` | `schedule-1280-*`, compare sheet |
| P3 | `design(jobs): jobs list and job sheet` | `JobsPage.tsx`, `JobDetailPage.tsx`, `src/components/jobs/*` (10 files), `JobFormModal.tsx`, `FromBooking.tsx`, `EnquiryConversation.tsx` | `/jobs`, `/jobs/:id` (all 4 tabs) | `job-390-*` (and vp-01 to vp-03), compare sheet |
| P4 | `design(quotes): quotes list and editor` | `QuotesPage.tsx`, `src/components/invoicing/LineItemEditor.tsx`, `DocumentVariationsEditor.tsx`, `QuoteSendDialog.tsx`, `QuoteChaseDialog.tsx`, `DocNextAction.tsx`, `DocumentGstTotals.tsx` | `/quotes` | `quote-390-*`, compare sheet |
| P5 | `design(invoices): invoices list, invoice view, payments` | `InvoicesPage.tsx`, `InvoiceSendDialog.tsx`, `DocumentShareManualLink.tsx`, `DocumentShareCompanySetupNudge.tsx`, `CommercialPdfPreviewModal.tsx` (chrome only; the PDF inside stays light) | `/invoices`, invoice view, record payment | `invoice-view-390-*` (balance due is the biggest figure), compare sheet |
| P6 | `design(clients): clients, client detail, contracts, assets` | `ClientsPage.tsx`, `ClientDetailPage.tsx`, `ContractsPage.tsx`, `ContractVisitReminderDialog.tsx`, `AssetsPage.tsx` | `/clients`, `/clients/:id`, `/contracts`, `/assets` | `clients-390-*`, compare sheet |
| P7 | `design(settings): company, billing, accounting, AI, lists` | `CompanySettingsPage.tsx`, `BillingSettingsPage.tsx`, `AccountingSettingsPage.tsx`, `AiSettingsPage.tsx`, `ManagedListsSettingsPage.tsx`, `ProfileSettingsPage.tsx` (non-Appearance sections) | `/settings/*` | `settings-1280-*`, compare sheet |
| P8 | `design(team): team settings` | `TeamSettingsPage.tsx` (embedded `--team-look` CSS moves out), `EmployeeCostRatesPanel.tsx` | `/settings/team` | `settings-1280-*` and kit (no dedicated D4 frame) |
| P9 | `design(field): compliance, inspections, JHA, Take 5` | `CompliancePage.tsx`, `InspectionsPage.tsx`, `NewInspectionPage.tsx`, `InspectionFillPage.tsx`, `InspectionReviewPage.tsx`, `src/components/inspection/*`, `JhaDocumentsPage.tsx`, `JhaFillPage.tsx`, `JhaCrewSignPage.tsx`, `JhaTemplateEditorPage.tsx`, `SwmsLibraryPage.tsx`, `src/components/jha/*`, `Take5ListPage.tsx`, `Take5Page.tsx`, `TemplatesPage.tsx`, `TemplateEditorPage.tsx`, `src/components/template-editor/*`. `SignatureCapture.tsx` is not touched; the signature ink stays black on a fixed-light pad | `/compliance`, `/inspections*`, `/jha*`, `/take5*`, `/templates*` | Kit plus `job-390-*` patterns (no dedicated D4 frame). 375 frames are mandatory: crews use this on site |
| P10 | `design(reports): reports, advanced reports, PDF viewer` | `ReportsListPage.tsx`, `AdvancedReportsPage.tsx`, `ReportPage.tsx` (app chrome only; the report HTML stays light), `UploadedPdfViewerPage.tsx`, `src/components/pdf/*` | `/reports*`, `/inspections/:id/report`, `/uploaded-pdfs/:id` | Kit, Chart section |
| P11 | `design(inventory): stock, suppliers, purchase orders, price books, expenses` | `StockPage.tsx`, `StockDetailPage.tsx`, `StockLocationPage.tsx`, `BarcodeScannerPage.tsx`, `SuppliersPage.tsx`, `SupplierDetailPage.tsx`, `PurchaseOrdersPage.tsx`, `PriceBooksPage.tsx`, `src/components/pricebooks/*`, `ExpensesPage.tsx`, `src/components/expenses/ExpenseModelsModals.tsx`, `src/components/stock/MoveStockModal.tsx`, `RemindersPage.tsx`, `ReminderEditPage.tsx`, `src/components/reminders/*` | `/stock*`, `/suppliers*`, `/purchase-orders`, `/price-books`, `/expenses`, `/reminders*` | Kit (no dedicated D4 frame) |
| P12 | `design(auth): sign in, sign up, reset, confirm` | `LoginPage.tsx`, `SignupPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `AuthConfirmPage.tsx`, `src/components/auth/AuthShell.tsx`, `src/components/legal/LegalShell.tsx`, `PrivacyPage.tsx`, `TermsPage.tsx` | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm`, `/privacy`, `/terms` | `signin-390-*`, compare sheet |

Internal tools are not in the 12 groups Jack listed: `AiAssistantPage`, `AiConsolePage`, `operator/*`, `FieldAuditPage`, `admin/StorageAnalytics.tsx` and `DevConsole.tsx`. They ride in **P13 `design(internal): operator and AI tools`**, the lowest-risk PR, with Light-first frames and Dark spot checks at 1280.

### D1–D3. PDFs, emails and the client portal, fixed light
These never follow the user's theme. They get the new type and logo, on white.

| PR | Name | Scope | Changes | Acceptance (in addition to §1) | LOOK |
|---|---|---|---|---|---|
| D1 | `design(pdf): Geist, Mitre, light paper` | `src/reports/commercial/CommercialDocumentPdf.tsx`, `generateCommercialPdf.ts`, `src/reports/shared/fonts.ts` (register Geist from `/fonts/`, not a CDN), `src/reports/shared/styles.ts`, `components.tsx`; the header and footer only of the `generic_inspection`, `jha` and `take5` chrome | Company name and doc number in Geist. Balance due is the largest run on page 1. Ink rules, no green. "Sent with" + `BRAND_NAME` in the footer. `report_theme` may tint the doc accent only (see S2) | `pdftotext` money strings are identical and in the same order; `pdffonts` shows Geist embedded; the `commercialTheme`, `invoicesPdfLook` and `letterheadLook` tests update only where they pin style; generation works with the network blocked | `invoice-pdf.png` / `.pdf` |
| D2 | `design(portal): client portal fixed light` | `src/pages/ClientPortalPublicPage.tsx`, `CustomerPortalPage.tsx`, `supabase/functions/client-portal/index.ts` (served HTML and meta) | `<html data-theme="light" data-theme-fixed>` on portal routes, so theme-init skips them. Balance due at 56px. Pay and Download PDF as primary and secondary | A Dark OS plus a stored `dark` still renders Light; frames in "dark" mode must be pixel-identical to Light | `portal-invoice-390.png` and its vp captures |
| D3 | `design(email): one light email shell` | `src/lib/sendInvoice.ts`, `sendQuote.ts`, `documentShareDeliver.ts`, `jobReminder.ts`, `inspectionDueReminder.ts`, any `src/lib/*ClientEmail*.ts`; `supabase/functions/job-reminder`, `compliance-reminder`, `invite-user`, `forgot-password`, `test-smtp`, `notify-jha-sign`; `supabase/templates/invite.html`; new `supabase/functions/_shared/emailShell.ts` | One table-based 600px shell on white. The PNG lockup is ink, from `handoff/brand/`, with alt text `BRAND_NAME`. One inverse CTA. Inline styles come from a single token object in `emailShell.ts`; tokens can't be CSS variables in email, so this is the one sanctioned raw-colour file besides `tokens.css` | Litmus-style render in Gmail web and iOS Mail (light and dark client modes) with no inverted logo; `test-smtp` sends to a test inbox; no copy changes | `email-640.png` |

### L1. `design(landing): dark hero by default, theme toggle`
- **Scope:** `src/pages/MarketingPage.tsx`, `RootPage.tsx`, `src/lib/publicSeo.ts`, and `public/look/photos/*`. Replace the electrical-specific photo with trades-generic, licence-clear images, each with a light and a dark grade.
- **Changes:**
  - The hero is dark by default, whatever the theme.
  - A sun or moon toggle in the nav writes `grafter-theme`.
  - The light variant changes the hero only: a light image grade, ink type and the white page. Below the hero, both are identical.
  - Gradient stops use `color-mix(in srgb, var(--g-mk-bg) N%, transparent)`, so there are no raw colours.
  - Rebase on #384 (weekly price from `LANDING_PRICE`); do not change price copy here.
- **Acceptance:** §1 at 375, 390, 1024, 1280 and 1440. LCP image preloaded per theme. No layout shift on toggle.
- **LOOK:** `landing-1440-{dark,light}.png`, `landing-390-*`, `../compare-dark-vs-light-landing*.png`.

### C1–C11. Strip overrides, then lock it
- C1–C10 are as in `spec/implementation-plan.md` §(c). The selector groups and counts are on that baseline: 231 `!important`, 125 `.btn-primary` selectors and 28 look namespaces.
- Each C PR follows its area's P PR.
- Each C PR is now captured in both themes. Dark is where leftover overrides show: a scoped `.btn-primary{background:#2E75B6 !important}` reads as a blue button on black.
- **C11 `design(guard): raw-colour and override lint`** has no visual change. It adds:
  - stylelint `color-no-hex` and `declaration-no-important` everywhere except `src/styles/tokens.css` and `supabase/functions/_shared/emailShell.ts`.
  - eslint `no-restricted-syntax` banning hex, `rgb(` and palette colour classes in `className` and `style`.
  - a CI script that fails on a new `--*-look` namespace, a scoped `.btn-primary`, or the literal `Grafter` outside `brand.ts`.
  - a Playwright job that runs the stray-colour walk on the core walk in both themes.
  - The lint starts as warnings for one day, then becomes errors.

### Z1. `feat(theme): System follows the OS`
- **Scope:** the inline theme-init in `index.html` (`SYSTEM_DARK = true`) and `ProfileSettingsPage.tsx` (remove "Uses Light for now").
- **Gate:** every P and C PR is merged, and a full both-theme walk of all 67 pages passes §1.
- **Acceptance:** with `emulateMedia({colorScheme:'dark'})` and no stored choice, the app loads Dark with no flash. A stored `light` overrides. Portal, PDF and email are unaffected.
- **LOOK:** `../board-4-dark-light.png`, "Same system" strips.

---

## 5. Not a token swap (budgeted inside the PRs above)
- **Images:** each hero and editorial photo needs a light and a dark grade, chosen with `<picture>` plus `prefers-color-scheme`, or a `[data-theme]` CSS swap (L1, P1).
- **Charts:** chart colours are props, so each chart reads `getComputedStyle(document.documentElement).getPropertyValue('--g-chart-1')` at render time and re-renders on theme change (P1, P10).
- **Crew colours:** `src/lib/jobColors.ts` stores 12 hexes in data. Map them to `--g-crew-*` per theme, so a crew colour never comes from a stored hex (P2).
- **Logo marks:** BrandMark uses `currentColor`. Only the email and PDF lockups are files: an ink PNG plus SVG, and a white SVG for the dark landing (S1, D1, D3).
- **Company `report_theme`:** documents only, pending the decision in S2.

## 6. Size, time and the cost of both-theme QA (Coach c)

**PR count from S1 on: 38.** With A0 that is 39.

| Group | PRs |
|---|---|
| S1, S2, S3 | 3 |
| K1–K6 | 6 |
| P1–P13 | 13 |
| D1–D3 | 3 |
| L1 | 1 |
| C1–C11 | 11 |
| Z1 | 1 |
| A0 (counted in `BUILD-PLAN-A0.md`) | +1 |
| P0 | not counted |

- Compared with D1 or D2 alone (`spec/implementation-plan.md`, 36), the dual theme adds:
  - **S3:** Appearance plus a migration
  - **Z1:** the System flip
  - **P13:** split out so the internal tools still get a Dark check
  - **A0's themed layer:** more work than a flat token file
- Allowance: **+3 dark-only fix-up PRs**, for things like a missed hardcoded hex inside a component, or an image or chart. That makes **about 42 PRs** in total.

**Captures.** Each frame is 8 captures: 4 widths × 2 themes. With before and after, that is 16 per page state.

| PR type | Pages × states (typical) | Captures single-theme | Captures both themes |
|---|---|---|---|
| S2, K1–K6 (core walk, 11 routes) | 11 × 1.5 | 132 | 264 |
| P PR (avg 4 routes) | 4 × 2 | 64 | 128 |
| C PR (avg 4 routes) | 4 × 1.5 | 48 | 96 |
| D PR | A4 plus 3 portal or email states | 24 | 24 (fixed light; the Dark check is a pixel-identity diff) |
| Total across the plan | | ~2,100 | **~4,200** |

**Time.**
- **Machine time:** at about 3 s per DPR 2 capture plus the overflow, clip, contrast and stray walks, capture and checks cost about 13 min on a core-walk PR, 6 min on a P PR, and **about 3.5 h** for the whole plan. That's cheap. It needs one script (port `_src/render.js` into the repo's `scripts/` as `capture-dual-theme.mjs`) built in S2, so time it into S2: +0.5 day.
- **Human time** is the real cost:
  - Coach LOOK roughly doubles: about +15 min per K or S PR and +20 min per P PR.
  - Prover FUNCTION PASS adds about +10 min per PR to read the dark results.
  - Dark-only fixes found in review: about +1 h per P PR on average.
  - Across about 42 PRs, that is **roughly +35 to +45 hours** (about 41 h by the per-PR sums above, including about 9 h for the 3 allowance PRs and 4 h for the capture script) over a single-theme build. In calendar terms, about **+1.5 weeks** at the current review throughput.
- **Ongoing:** every future UI PR pays the 8-capture rule too. Budget about +15 min of review per UI PR, permanently.

## 7. Open decisions before S2
1. **`report_theme`:** documents only, or keep tinting the Light header? Recommendation: documents only.
2. **Token values:** Direction 4 values (§2, measured) vs the `handoff/tokens.css` blocks 3 and 4 values where they differ. This covers primary as inverse vs blue in Dark, the Light surface-2 well, focus as blue vs ink, and Dark ink-subtle.
3. **Mono family:** Geist only, as Coach required one family, vs Geist Mono for codes.
4. **Crew plum** (`--g-crew-2`) in Dark.
5. **Theme-init flags:** split `DARK_READY` (S3) and `SYSTEM_DARK` (Z1); A0 stream to confirm.
