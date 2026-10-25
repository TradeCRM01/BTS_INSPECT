# Grafter design system: implementation plan

**Status:** plan only. Nothing here has been opened as a PR. Direction approved by Jack on 19 Oct 2026, 12:57 AEST (see `../notes/decisions.md`).
**Source of truth:** `design-system.md` (spec), `tokens.css` (values) and `../after/` (approved mockups).
**Repo baseline:** `TradeCRM01/BTS_INSPECT` origin/main `1a33367` (19 Oct 2026, 08:51 AEST). Line numbers below refer to that commit. Re-check them when each PR is cut.
This plan replaces the PR table in `design-system.md` §13 and follows the order Jack asked for:
- (a) tokens and shared components
- (b) legacy page migration
- (c) stripping `!important` and per-page overrides
- (d) the invoice and quote PDF

| Phase | PRs | Scope |
|---|---|---|
| (a) Tokens and shared components | **9** | A1 zero-visual-change tokens, then one component per PR |
| (b) Legacy page migration | **13** | The 30 legacy pages in 11 area batches, plus the hybrid Dashboard widgets and the final base-layer flip |
| (c) Strip `!important` and overrides | **11** | 231 `!important`, 28 look namespaces, the scoped `.btn-primary` overrides and embedded TSX CSS, then guardrails |
| (d) Invoice and quote PDF | **3** | Fonts and figures, invoice, quote (plus PO parity) |
| **Total** | **36** | |

---

## 0. Rules for every PR

### 0.1 Shape
- **Thin.** Aim for about 300 changed lines or fewer, excluding deleted CSS and test snapshot updates. Each PR has one purpose and touches one component or one page batch.
- **Token-first.** No new hex, px font size, radius or shadow literals outside `src/styles/tokens.css`. Use `var(--g-*)` or the token-mapped Tailwind names.
- **Style only.** Allowed changes: `className` strings, CSS, CSS modules and embedded style blocks, plus wrapper markup that exists only for layout. Not allowed:
  - changes to handlers, hooks, queries, routes, permissions or copy logic
  - changes to money formatting or calculations (`src/lib/gst.ts`, `formatMoney`, job bill and invoice totals)
- **Look tests move with the style.** The repo pins literal CSS in about 40 `*Look.test.ts` and `*Theme.test.ts` files, for example `jobsListTheme.test.ts`, `invoicesPdfLook.test.ts` and `commercialTheme.test.ts`. A PR that changes a pinned value updates that assertion in the same PR, and nothing else in the test.
- **Revert = `git revert <merge>`.** No PR depends on a later one to look right. Where two PRs must ship as a pair, the plan says so.

### 0.2 Acceptance criteria that apply to every PR
A PR is not ready for LOOK until all five pass. The prover records the results in the PR body.
1. **Frames.** Before and after full-page frames at **375, 390, 1024 and 1280** for every touched page, named as in §0.4. For component PRs in phase (a), "touched pages" means the Core walk in §0.5 plus every page listed in that PR.
2. **No horizontal overflow.** On every frame, the largest element `rect.right` must be ≤ `window.innerWidth`. Run snippet A at each width, with no exceptions. A drawer parked off-screen must be `display:none` or `inert` with no box. If it still has a box, it fails.
3. **No clipped text.** Nothing is ellipsised, cut by `overflow:hidden`, hidden behind a fade mask, or pushed off-screen. Run snippet B; it must print `PASS`.
4. **Money unchanged.** Every money string on every touched page is identical before and after, in the same order. Run snippet C before and after and diff the outputs. Unit tests for `gst.ts`, the job bill and invoice totals must pass untouched.
5. **Behaviour and routes unchanged.** `src/App.tsx` routes are not modified, and `git diff` shows no edits to handlers, hooks or queries. The full test suite passes, the existing e2e smoke flows pass, and every link and button on the touched pages leads where it did before.

**Snippet A: overflow** (paste into the console at each width):
```js
(() => {
  const vw = window.innerWidth; let max = 0, worst = null;
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (r.right > max) { max = r.right; worst = el; }
  }
  const ok = max <= vw;
  console.log(ok ? 'PASS' : 'FAIL', { maxRight: +max.toFixed(2), innerWidth: vw, worst });
  return ok;
})();
```

**Snippet B: clipped text:**
```js
(() => {
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.closest('.sr-only,[aria-hidden="true"]')) continue;
    if (el.clientWidth <= 1 && el.clientHeight <= 1 && cs.position === 'absolute') continue; // visually-hidden labels
    const text = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const clips = ['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowX) || ['hidden', 'clip'].includes(cs.overflowY);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) bad.push(['ellipsis', el]);
    else if (clips && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && el.textContent.trim()) bad.push(['overflow', el]);
    if ((cs.webkitLineClamp && cs.webkitLineClamp !== 'none') || (cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none')) bad.push(['clamp/mask', el]);
    if (text && el.getBoundingClientRect().right > innerWidth + 0.5) bad.push(['off-screen', el]);
  }
  console.log(bad.length ? 'FAIL' : 'PASS', bad);
  return bad.length === 0;
})();
```
Scroll containers that are meant to scroll, such as the week board timeline or a long table body, are listed in the PR body with a frame showing the scrolled end. The Coach accepts or rejects each one. A container that scrolls only to fit a label (tabs, chips, nav) is never accepted; it must wrap or re-layout instead. The approved mockups turn the four phone job tabs into a 2×2 grid.

**Snippet C: money fingerprint** (run before and after, then diff):
```js
copy(JSON.stringify([...document.body.innerText.matchAll(/[−-]?\$\s?[\d,]+(?:\.\d{2})?/g)].map(m => m[0])));
```

### 0.3 Review gates
Every PR is opened as a **draft** and stays a draft until it passes the gates in order:
1. **FUNCTION PASS.** The prover runs criteria 2–5 (snippets A, B and C, tests, routes and behaviour) and posts the results.
2. **LOOK.** The Coach reviews the before and after frames from criterion 1 against the spec and the approved mockups.
3. **SIGN.** The Coach signs off in the PR.
4. **Merge.** The Lead marks the PR ready and merges it.

The Lead is the only one who merges. A failure at any gate sends the PR back to draft.

### 0.4 Frame naming
`{pr}-{page}-{state}-{before|after}-{width}.png`, stored under `proofs/{pr}/`.
- `pr` is the plan id in lowercase: `a1`, `b07`, `c03`, `d2`.
- `page` is the route slug: `dashboard`, `jobs`, `job-sheet`, `quotes`, `invoice-view`, `settings-profile`, `stock-detail`, `operator-companies`.
- `state` is `default`, or the state under test: `focus`, `hover`, `open`, `empty`, `error`, `loading`, `part-paid`.
- `width` is `375`, `390`, `1024` or `1280`. PDFs use `a4` and add the `.pdf` next to the PNG.
- Capture full-page frames at device scale factor 2 with a fixed clock and seed data (Northside Plumbing & Gas demo tenant).
- Use "phone" in prose, never the old phone-frame filename suffix.

Example: `b03-stock-detail-default-after-390.png`, `d2-invoice-pdf-part-paid-after-a4.png`.

### 0.5 Core walk (frames for every phase (a) PR)
`/` Dashboard, `/jobs`, `/jobs/:id` (job sheet), `/quotes` (list and editor open), `/invoices` (list and invoice view open), `/schedule`, `/clients/:id`, `/stock`, `/settings/company`, `/settings/profile` (legacy reference).

---

## (a) Tokens and shared components: 9 PRs

### A1. `design(tokens): add tokens.css (no visual change)`
- **Files:** new `src/styles/tokens.css`, copied from `spec/tokens.css` with approved values (success `#16703A`, warning `#A4410A`, control radius 10, control border `#808A93`, link `#296AA5`). `src/index.css` gets one `@import` at the top. `tailwind.config.js` gets new keys only (`g-*` colours, `rounded-g-*`, `shadow-g-*`, `font-title`). Existing keys stay. Add a lock test asserting the four brand values and the approved values.
- **Visual:** none. Nothing consumes the tokens yet.
- **Acceptance:** global criteria. Before and after frames of the Core walk must be pixel-identical (0 changed pixels in an image diff).
- **Risk:** very low. The only possible effect is a stray `--g-` name collision; `rg -- '--g-' src` must be empty before the PR.
- **Rollback:** revert. Nothing references the file.

### A2. `design(button): rebuild base .btn-* on tokens`
- **Files:**
  - `src/index.css`: `.btn-primary/-secondary/-ghost/-danger/-icon` at L47–65, and `.ops-next-control*` at L238–260.
  - `src/components/ui/PageError.tsx` (hand-rolled retry button).
  - `src/components/ui/ManagedSelect.tsx` L235 ("Add", 32px).
- **Pages:** Core walk, plus every legacy page with a primary, for example `/settings/profile`, `/price-books`, `/purchase-orders`.
- **Visual:**
  - The base primary changes from navy, 36px, radius 6 to `#2E75B6`, 44px, radius 10, with hover `#296AA5` and active `#25629A`.
  - No press scale. Disabled uses explicit colours, not 50% opacity.
  - Danger becomes `#B42318`. Icon buttons become 44px.
  - Paper-kit pages keep their scoped overrides until (c), so their buttons don't change yet.
- **Acceptance:** global criteria. Every primary on a touched page measures 44px tall (`getBoundingClientRect().height`). Each view has one primary.
- **Risk:** medium-low. Legacy pages that relied on a 36px button in tight rows may wrap; snippets A and B catch it.
- **Rollback:** revert. It is a single CSS block plus two small TSX class edits.

### A3. `design(input): inputs and selects on tokens`
- **Files:**
  - `src/index.css`: `.form-input`, `.form-input-sm` (L2141–2149), the global 44px min-height (L2158) and the select styles.
  - `src/components/ui/ManagedSelect.tsx` (popover), `TimeFieldInput.tsx`, `SearchBar.tsx`.
- **Pages:** Core walk, plus `/jobs/:id` schedule tab, `/settings/lists`, `/expenses`.
- **Visual:** a 44px field with a `#808A93` border (3.46:1) and radius 10. Focus shows a blue border plus a 1px inset, with no halo. Text is 16px. Placeholders are muted ink.
- **Acceptance:** global criteria. Focus frames (`-focus-`) for an input and a select at all four widths. No input renders below 16px (iOS zoom).
- **Risk:** medium. About 40 scoped re-skins (`.hub-*-chrome .form-input`, `#job-schedule .form-input`) still win until (c), so some inputs change now and others in (c). This is expected; record it in the PR body.
- **Rollback:** revert.

### A4. `design(card): one card surface`
- **Files:**
  - `src/index.css`: `.card*`, `.ops-card*`.
  - `src/components/ui/OpsCard.tsx`, `SummaryCard.tsx`, `EmptyState.tsx`.
  - `Skeletons.tsx`: surface only. Also remove the `Math.random()` widths so skeletons stop jittering. This is a render-only change with no data effect.
- **Pages:** Core walk, plus `/reports-advanced`, `/assets`, `/contracts`.
- **Visual:** white, radius 10 with Tailwind shadows becomes sheet `#FFFDF8`, a `#E2D9CC` hairline, radius 16 and elev-1 (warm umber). Skeletons use the same surface, with paper-200 shimmer and no pulse.
- **Acceptance:** global criteria. No pure-black shadow is left on touched pages: `getComputedStyle(el).boxShadow` contains no `rgba(0, 0, 0`.
- **Risk:** low.
- **Rollback:** revert.

### A5. `design(sheet): sheets, dialogs and drawers`
- **Files:**
  - `src/index.css`: `.overlay-panel(-sm/-md/-lg/-xl)`, `.overlay-backdrop`, `.hub-ops-form-sheet`.
  - `src/components/ui/Modal.tsx`, `AppDialog.tsx`, `ConfirmDialog.tsx`, `OverlayPortal.tsx`, `EditorStickyFooter.tsx`.
- **Pages:** Core walk with an overlay open (`-open-`): new job, invoice view, quote editor, confirm delete. Plus `/schedule` with the schedule sheet open.
- **Visual:**
  - The sheet surface gets a radius-16 top on phone, elev-3, and a warm navy 45% scrim instead of `bg-black/50`.
  - The close button grows from 32 to 44px. The footer becomes paper-50 with a hairline.
  - Drawer widths are tokenised.
- **Acceptance:** global criteria on open states. Focus is trapped and returns to the trigger as before; the existing `dialogKeyboard.test.tsx` must pass unchanged.
- **Risk:** medium. 69 `!important` declarations on `.overlay-panel` and `.overlay-backdrop` may beat the new rules; C1 removes them. Ship A5 and C1 back to back.
- **Rollback:** revert.

### A6. `design(toast): toast on tokens`
- **Files:** `src/components/ui/Toast.tsx`, plus `.ops-toast-host` in `src/index.css`.
- **Pages:** Core walk with a success toast and an error toast showing (`-open-`).
- **Visual:**
  - If D7 is approved: a navy inverse toast, 44px action, no glow.
  - If not: a sheet toast with a hairline and elev-2.
  - Both versions are tokenised. A `warning` type is added. There is a polite live region, and the toast pauses on hover.
- **Acceptance:** global criteria. Screen-reader announcement is unchanged (`role="status"`). Toast copy and timing are unchanged unless the spec says otherwise.
- **Risk:** low. **Blocked on open question Q2 (D7).** It can merge only after Jack answers.
- **Rollback:** revert.

### A7. `design(status): status pills`
- **Files:** `src/components/ui/StatusBadge.tsx`; `.ops-status*`, `.badge` and `select.ops-status` (L223, L2172) in `src/index.css`.
- **Pages:** Core walk, plus `/compliance` and `/inspections`.
- **Visual:**
  - The 10px solid white-on-colour uppercase pill becomes a 24px pill: tinted, 12px weight 600, sentence case, with a 6px dot.
  - Uses the approved tones: success `#16703A` on `#E6F1E7`, warning `#A4410A` on `#FBEBDD`.
  - Green appears only here (D11).
  - "Cancelled" becomes neutral instead of danger.
- **Acceptance:** global criteria. Each of the 18 statuses maps to one of 5 tones (unit test). No status text changes.
- **Risk:** low. This PR is an addition to the brief's component list, because the approved colours need one owner.
- **Rollback:** revert.

### A8. `design(a11y): one focus-visible ring`
- **Files:** `src/index.css` gets a global `:where(a, button, input, select, textarea, [tabindex]):focus-visible` rule with a 2px `#2E75B6` outline and a 2px offset, and loses the 41 rules that remove outlines or rings.
- **Pages:** Core walk, `-focus-` state captured by tabbing to the primary, a tab, a row link and an input.
- **Visual:** visible keyboard focus everywhere. Nothing changes for mouse users.
- **Acceptance:** global criteria. Every interactive element on the touched pages shows a visible ring when tabbed to; the prover tabs through each page and records any that don't.
- **Risk:** low. A ring may clip inside an `overflow:hidden` parent; fix this with `outline-offset:-2px` on that component only.
- **Rollback:** revert.

### A9. `design(motion): reduced motion and motion tokens`
- **Files:** `src/index.css` gets motion tokens on transitions, plus a global `@media (prefers-reduced-motion: reduce)` net: animations, transitions and smooth scroll drop to 0.01ms or off, and the skeleton shimmer stops. `LoadingSpinner.tsx` keeps a static state.
- **Pages:** Core walk with OS reduced motion on and off.
- **Visual:** with motion on, durations unify at 120/200/280ms and press scale is removed. With motion off, nothing animates.
- **Acceptance:** global criteria. With `emulateMedia({ reducedMotion: 'reduce' })`, `document.getAnimations().length === 0` after load on every touched page.
- **Risk:** very low.
- **Rollback:** revert.

---

## (b) Legacy page migration: 13 PRs

These are the 30 page files still mostly on the legacy kit: Inter, cool greys, white cards and Tailwind palette classes.
- Reproduce the list with `spec/audit-scripts/legacy_pages.py`. It prints 31 files, and `DashboardPage.tsx` is a hybrid: its paper sheet is already migrated and only its widgets are legacy, so it gets its own PR (B01).
- In each page:
  - Replace grey and palette classes and legacy hex (`#6B7280`, `#E5E7EB`, `#1A1A1A`, …) with token classes.
  - Swap white cards and custom buttons, inputs and pills for the components from (a).
  - Map title sizes to H1/H2/H3, and keep Rajdhani at 20px and up only (D12).
  - Make no logic changes.
- Every PR in this phase adds two checks on top of the global criteria:
  - `rg -n '(gray|slate|zinc|neutral)-\d|#(6B7280|9CA3AF|E5E7EB|F9FAFB|1A1A1A|374151|111827|4B5563|D1D5DB|F3F4F6)' <files>` returns nothing for the touched files.
  - The page is cream with sheets at all four widths.
- Risk across the phase: mostly low. The usual failures are wrapping in tight rows and dense tables at 375; snippets A and B catch them. Rollback is always a revert of that batch.

| PR | Title | Page files (lines) | Routes |
|---|---|---|---|
| B01 | `design(dashboard): widgets on tokens` | `DashboardPage.tsx` widgets (1249), `widgets/WidgetComponents.tsx` | `/` |
| B02 | `design(financials): price books` | `PriceBooksPage.tsx` (582) | `/price-books` |
| B03 | `design(inventory): stock and scanner` | `StockPage.tsx` (609), `StockDetailPage.tsx` (314), `StockLocationPage.tsx` (250), `BarcodeScannerPage.tsx` (369) | `/stock`, `/stock/:id`, `/stock/locations/:locationKey`, `/barcode` |
| B04 | `design(inventory): suppliers and purchase orders` | `SupplierDetailPage.tsx` (354), `PurchaseOrdersPage.tsx` (836) | `/suppliers/:id`, `/purchase-orders` |
| B05 | `design(crm): assets, contracts, customer portal` | `AssetsPage.tsx` (431), `ContractsPage.tsx` (561), `CustomerPortalPage.tsx` (232) | `/assets`, `/contracts`, `/portal` |
| B06 | `design(field): inspection create and review` | `NewInspectionPage.tsx` (436), `InspectionReviewPage.tsx` (559) | `/inspections/new`, `/inspections/:id/review` |
| B07 | `design(field): JHA templates, crew sign, SWMS library` | `JhaTemplateEditorPage.tsx` (786), `JhaCrewSignPage.tsx` (232), `SwmsLibraryPage.tsx` (39) | `/jha-templates/:id`, `/jha-templates/new`, `/jha/crew-sign`, `/jha/swms-library` |
| B08 | `design(field): template editor` | `TemplateEditorPage.tsx` (921) | `/templates/:id`, `/templates/new` |
| B09 | `design(reports): report views and PDF viewer` | `AdvancedReportsPage.tsx` (844), `ReportPage.tsx` (806), `UploadedPdfViewerPage.tsx` (291) | `/reports-advanced`, `/inspections/:id/report`, `/uploaded-pdfs/:id` |
| B10 | `design(settings): profile, AI, lists, accounting` | `ProfileSettingsPage.tsx` (257), `AiSettingsPage.tsx` (313), `ManagedListsSettingsPage.tsx` (241), `AccountingSettingsPage.tsx` (351) | `/settings/profile`, `/settings/ai`, `/settings/lists`, `/settings/accounting` |
| B11 | `design(ai): assistant and console` | `AiAssistantPage.tsx` (302), `AiConsolePage.tsx` (375) | `/assistant`, `/ai-console` |
| B12 | `design(operator): operator and internal tools` | `operator/OperatorAuditPage.tsx` (65), `operator/OperatorBillingPage.tsx` (84), `operator/OperatorCompaniesPage.tsx` (154), `operator/OperatorCompanyDetailPage.tsx` (358), `FieldAuditPage.tsx` (982) | `/operator/audit`, `/operator/billing`, `/operator/companies`, `/operator/companies/:id`, `/__field-audit` |
| B13 | `design(base): flip the base layer` | `src/index.css` L28–41 (`body` font, colour, background), `.shell-root`; `tailwind.config.js` re-points legacy names (`navy`, `accent`, `ink`, `muted`, `rule`, `zebra`, `fontFamily.sans`) to tokens (spec §12); `index.html` drops Inter, Newsreader and JetBrains Mono (open Q7) | All |

Total: 30 legacy page files in B02–B12, plus the hybrid Dashboard in B01.

**Per-PR notes**
- **B01 (Dashboard widgets).**
  - Visual: widget cards become hairline-divided sections on the sheet, with tabular figures. Hero figures are navy, never green (D11). Cash Flow bars are navy and paper-400.
  - Extra acceptance: widget totals match snippet C exactly.
  - Risk: low. "Customize" layouts are user-saved, so test with two saved layouts.
- **B03 (stock and scanner).** `/barcode` uses the camera; take frames with the permission-denied state as well. The `--stock-look` namespace stays until C10.
- **B04 (suppliers and POs).** Purchase orders also render through the commercial PDF; PO PDF frames are taken in D3, not here. The `--po-look` and `--suppliers-look` namespaces stay until C10.
- **B07 (JHA, crew sign, SWMS).** Crew sign is used on phones on site, so 375 frames are mandatory. Signature capture behaviour must not change (`SignatureCapture.tsx` is not touched).
- **B08 (template editor).** Template editor drag handles and inspector panels are dense. Use a 1024 frame with the inspector open.
- **B09 (reports).** `ReportPage` renders inspection report HTML; only the app chrome around it changes here, and the report PDF styles are out of scope. Mixed-trade report types must render unchanged.
- **B12 (operator and internal tools).** Internal-only pages. They are in scope because they share the CSS. Risk is lowest here.
- **B13 (base-layer flip).**
  - Visual: on paper pages, nothing changes, because they already override. On any page missed by B02–B12, the page warms. On auth and marketing pages, text becomes Source Sans 3 and navy ink.
  - Extra acceptance: Core walk plus `/login`, `/signup`, `/privacy`, `/terms` and `/p`. `rg "Inter'" src index.html` is empty.
  - Risk: medium. This is the one global flip, so it ships after B02–B12 to keep its diff near zero.
  - Rollback: revert, a three-file PR.

---

## (c) Strip `!important` and per-page overrides: 11 PRs

Baseline on `1a33367`:
- `src/index.css` has **231** `!important` declarations outside comments. The audit's 232 included one inside a comment.
- **28** look namespaces re-declare brand values. 19 live in `index.css` and 9 in embedded TSX style blocks: `BillingSettingsPage`, `CompanySettingsPage`, `ExpensesPage`, `PurchaseOrdersPage`, `StockPage`, `SuppliersPage`, `TeamSettingsPage`, `JobDetailPage`, and `components/ui/InstallPrompt.tsx`.
- The scoped `.btn-primary` overrides number **55** base selectors, or **125** counting the `:hover`, `:disabled` and `:focus` variants.

Method for each PR:
1. Delete the scoped override.
2. Confirm the shared component from (a) now produces the approved look.
3. Re-express any genuine page-specific layout with tokens, using `@layer components` and low specificity.
4. Move embedded TSX CSS into a named section of `index.css`.
5. Turn the namespace's variables into direct `var(--g-*)` uses and delete the namespace.

On paper pages this is the step where the approved mockup look lands: radius 10, the `#808A93` control border, one primary per view, `#296AA5` link text, pill statuses, and Rajdhani at 20px and up.

On top of the global criteria, every PR in this phase checks:
- `rg -c '!important'` for the targeted selector group drops to 0 (or to a listed, justified remainder).
- `rg -- '--<ns>-'` is empty for each deleted namespace.
- Primary buttons on the touched pages measure 44px tall with a 10px radius.

Rollback for every PR is a revert of that group.

| PR | Title | Selector groups and namespaces | `!important` removed | `.btn-primary` selectors removed | Pages to frame |
|---|---|---|---|---|---|
| C1 | `design(sheet): drop overlay !important` | `.overlay-panel*`, `.overlay-backdrop` | 69 | 0 | Core walk with overlays open |
| C2 | `design(dashboard): drop dashboard overrides` | `.dashboard-home*`; `--ops` brand duplicates | 19 | 3 | `/` |
| C3 | `design(quotes): drop quote overrides` | `.hub-quote*`, `.hub-quotes*`, `.hub-line*`; `--quote` | 26 | 19 | `/quotes` list and editor, line sheet |
| C4 | `design(invoices): drop invoice overrides` | `.hub-invoice*`, `.hub-invoices*`; `--invoice` | 13 | 18 | `/invoices` list, invoice view, record payment |
| C5 | `design(jobs): drop job overrides` | `.hub-jobs*`, `.hub-job*`, `.job-client*`, `.job-schedule*`, `.job-insp*`, `.job-cal*`, `.inspection-due*`; `--job`, `--job-look`, `--visit` (from `JobDetailPage.tsx`) | 23 | 39 | `/jobs`, `/jobs/:id` (all 4 tabs) |
| C6 | `design(crm): drop clients and compliance overrides` | `.hub-clients*`, `.hub-compliance*`; `--client`, `--compliance-look`, `--portal` | 17 | 6 | `/clients`, `/clients/:id`, `/compliance`, `/portal` |
| C7 | `design(schedule): drop schedule, timesheet and team overrides` | `.hub-week*`, `.hub-board*`, `.hub-schedule*`, `.hub-timesheets*`, `.hub-team*`; `--schedule`, `--ts-look`, `--team-look` (from `TeamSettingsPage.tsx`) | 14 | 6 | `/schedule`, `/timesheets`, `/settings/team` |
| C8 | `design(field): drop field-work overrides` | `.hub-inspections*`, `.hub-jha*`, `.hub-take5*`, `.hub-reports*`; `--insp-look`, `--jha-look`, `--take5-look`, `--report` | 32 | 25 | `/inspections`, `/inspections/:id`, `/jha`, `/jha/take5`, `/reports` |
| C9 | `design(settings): drop settings, auth and marketing namespaces` | `.accounting-settings*`; `--acct`, `--auth-look`, `--billing-look`, `--co-look`, `--legal`, `--mkt`, `--install-look`; embedded CSS from `BillingSettingsPage`, `CompanySettingsPage`, `InstallPrompt` | 0 | 5 | `/settings/company`, `/settings/billing`, `/settings/accounting`, `/login`, `/p`, `/privacy` |
| C10 | `design(inventory): drop inventory, expenses and ops namespaces` | `.operator-developers*`, `.hub-labour*`, `.ops-doc*`; base `input`/`body` `!important` (L28–41, L2158) and the 12px chip-input rule (L2188); `--po-look`, `--stock-look`, `--suppliers-look`, `--ex-look`, `--dev`, `--ops`; embedded CSS from `ExpensesPage`, `PurchaseOrdersPage`, `StockPage`, `SuppliersPage` | 10, plus the 8 remaining rules located by `rg` at cut time | 4 | `/expenses`, `/stock`, `/suppliers`, `/purchase-orders`, `/operator/operators` |
| C11 | `design(guard): lock it` | eslint `no-restricted-syntax` on hex and palette classes in `className`; stylelint `color-no-hex` and `declaration-no-important` outside `tokens.css`; a CI script that fails on a new `--*-look` namespace or a scoped `.btn-primary` | 0 | 0 | none (no visual change) |

The removals add up to the full baseline:
- **`!important`:** 69 + 19 + 26 + 13 + 23 + 17 + 14 + 32 + 0 + 18 = **231**.
- **`.btn-primary` selectors:** 125 in total. The table's column sums to 125 by selector prefix; the 55 base selectors are a subset.

**Per-PR notes**
- **Risk:**
  - C3–C5 carry the most risk. They are the busiest paper pages, and some `!important` there beats Tailwind utilities in the markup.
  - Mitigation: before deleting, list each `!important` with the utility it beats, and either remove that utility from the markup (a `className` change) or keep a single `:where()` rule.
  - Never re-add `!important`.
- **Visual:** see the method above; this is where the approved look lands on the paper pages. Example for C5: the job sheet gets the 40px navy head bar with ref, hours and status (D10, approved in the mockup), a Rajdhani title, hairline rows, one 44px primary, and pill lane statuses. Layout changes beyond the existing structure are out of scope.
- **C10:** removing the global `input { font-size:16px !important }` is safe only after A3, which sets 16px in the component. Ship C10 after A3 and B13.
- **C11:** zero visual change. Risk: a false positive in the lint rules blocks unrelated PRs, so start the rules as warnings for one day, then make them errors.

---

## (d) Invoice and quote PDF: 3 PRs

Target: `../after/invoice-pdf.pdf` and `invoice-pdf.png`, plus spec §11.
- Files: `src/reports/commercial/CommercialDocumentPdf.tsx`, `generateCommercialPdf.ts`, `src/reports/shared/fonts.ts`, and the in-app preview `src/components/invoicing/CommercialPdfPreviewModal.tsx`.
- Frames: A4 PNG plus `.pdf` for each state. The in-app preview modal gets frames at the four widths.
- Extra acceptance:
  - `pdftotext` of before and after gives the same money strings in the same order (snippet C equivalent: `grep -oE '[−-]?\$[0-9,]+\.[0-9]{2}'`).
  - `pdffonts` shows every font embedded.
  - `commercialTheme.test.ts`, `invoicesPdfLook.test.ts`, `letterheadLook.test.ts` and `fix6InvoicePdfPayment.test.ts` are updated only where they pin style values.

### D1. `design(pdf): fonts and figures`
- **Files:** `src/reports/shared/fonts.ts`. Bundle Rajdhani 700 and Source Sans 3 400/600/700 under `public/fonts/`, served from the app origin instead of jsDelivr. If Q5 shows proportional digits, register a `tnum`-frozen "Source Sans 3 Tab".
- **Visual:** weight 600 becomes available, and digits align in columns. No layout change.
- **Acceptance:** the D-phase checks above, with frames for quote, invoice and PO.
- **Risk:** low. Offline and CSP loading must keep working, so test a generation with the network blocked after app load.
- **Rollback:** revert.

### D2. `design(pdf): invoice`
- **Files:** `CommercialDocumentPdf.tsx`, invoice branch only.
- **Visual (approved D8, D11, D12):**
  - Page `#FFFDF8` with no navy bands.
  - Company name in Rajdhani 20pt. A "Tax invoice" kicker in Source Sans 10pt, and the doc number in navy Rajdhani 22pt.
  - Hairline meta strip. The table header has no fill and a 0.75pt navy rule; rows have 0.5pt hairlines.
  - Totals block 240pt wide: `Subtotal (ex GST)`, `GST (10%)`, `Total (inc GST)`, then `Payments to date`, then **`Balance due`** as the biggest figure, with the due date.
  - How to pay box. Footer "Company · Tax invoice #… / Page 1 of 1".
  - Six or fewer pt sizes (7.5, 9, 10, 20, 22). No green anywhere.
- **States to frame:** draft, sent, part paid, paid, overdue, a two-page invoice, and a non-GST line mix.
- **Acceptance:** the D-phase checks above. The balance due is the largest text run on page 1. The ABN is present on every tax invoice.
- **Risk:** medium. react-pdf page breaks (`wrap={false}` rows) and two-page totals need checking; frame a 30-line invoice.
- **Rollback:** revert.

### D3. `design(pdf): quote and PO parity`
- **Files:** `CommercialDocumentPdf.tsx`, quote branch. The PO branch shares the template and gets the same treatment.
- **Visual:**
  - Same letterhead, table and totals as D2. There is no payments block; `Total (inc GST)` is the biggest figure.
  - Variations: the "Included" and "Not included" headers lose their fill and use the section-label style. "Not included" is warning `#A4410A`. The only blue on the page is the "View and accept online" link, if present.
- **States to frame:** a quote with variations, a quote without them, a long quote, and a PO.
- **Acceptance:** the D-phase checks above. Quote acceptance links still resolve.
- **Risk:** medium-low. Purchase orders currently use Roboto; check that supplier codes with symbols still render.
- **Rollback:** revert.

---

## Sequencing and dependencies
- A1 merges first, then A2–A9 in any order, except A6, which waits on Q2. A5 is paired with C1, which follows immediately.
- (b) can start once A2–A5 are merged. B02–B12 can run in parallel; B13 comes after all of them.
- (c) follows (b) per area: C3 after the quote-area work, C5 after A2/A3/A7, and C10 after A3 and B13. C11 is last.
- (d) is independent of (b) and (c). It needs A1 only, so it can run in parallel with (b).

## Out of scope for this plan
Layout features shown in the mockups that don't exist today stay out: for example, the dashboard's three-widget row arrangement goes only as far as existing widget settings allow.

Logic questions also stay out, including the non-GST "Invoice" title (Q4) and `report_theme` limits (Q6).

The other PDFs (inspection, JHA, Take 5, test reports) are a later follow-up, per spec §11 "Other PDFs".

## Appendix: Phase 1b additions to fold into the phases (19 Oct 2026)
These came from Phase 1b (mockups and spec only). They don't change the PR counts above; each attaches to an existing PR or becomes a follow-up in the same phase once Coach signs D15–D17.
- **Crew palette (D15):** tokens are already in `tokens.css` §9b, so they ride on the zero-visual-change token PR. Applying them to `EmployeeColorSwatch.tsx` and `BoardViews.tsx` (status as pill, unassigned dashed) is one PR in phase (b), Schedule batch. Mockups: `after/schedule-{1280,390}.png`.
- **Toast (D13):** the toast PR in phase (a) follows spec §6.8 and `motion.md` §2.2 (no icons, warning accent for errors, 15s for Open/Undo).
- **States and first run:** the skeleton, empty and error components in phase (a) follow spec §9.4–9.5; the dashboard setup guide is a phase (b) Dashboard PR. Boards: `after/states/`.
- **Motion:** every component PR in phase (a) attaches its frame strip from `motion-prototype.html` (`motion.md` §4).
- **Settings chips (D16):** a phase (b) Settings PR; update `companySettingsNavLook.test.ts` expectations for phones (auto height below 600px).
- **Dashboard bar removal (D17):** part of the phase (b) Dashboard PR.
- **Demo seed:** owned by CoS (`spec/demo-seed.md`, `demo-seed.json`); not a code PR.
