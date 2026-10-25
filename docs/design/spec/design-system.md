# Grafter design system v1

**For:** the project lead implementing thin, token-first PRs against `TradeCRM01/BTS_INSPECT`.
**Baseline:** `origin/main` @ `1a33367` (19 Oct 2026). **Companion files:** `tokens.css` (drop-in tokens), `token-audit.md` (what exists today, with counts and file paths).
**Scope:** restyle existing surfaces only. No new modules, no new chrome, no new screens.

---

## 0. The idea in one paragraph

Grafter already has a good document language: the **Looplet** paper kit, with cream page, `#FFFDF8` sheet, navy ink, hairlines, Rajdhani titles and one blue action. It reads like a well-made quote on good paper. The 6/10 comes from execution, not concept. There are two design systems side by side, 26 font sizes, 17 shadows and 18 radii, and the paper kit is copied into 28 namespaces. Blue is spent on things that are not actions, focus rings are stripped, and legacy screens are still Inter on cool grey. Getting to 10/10 means **one token source, one of each component, and discipline**: blue only means "do this", navy is everything else, every number lines up, and nothing moves without a reason.

### Five rules that make it feel expensive
1. **Blue means "do this".** `#2E75B6` is used for the primary button, links and focus rings. Nothing else is blue: no status pill, tab underline, kicker or decoration. Selected and active states are navy.
2. **Paper, not boxes.** A page is cream. Content sits on one sheet per page. Inside a sheet, separate things with hairlines and space, not nested cards.
3. **Numbers line up.** Every amount, quantity, time and reference is tabular and right-aligned in columns. Totals are the loudest thing on financial screens.
4. **Few sizes, used strictly.** Seven text styles, five radii, three shadows and three icon sizes. If a value is not a token, it's a bug.
5. **Quiet motion, visible focus.** 120ms hover and 280ms sheets, no travel under reduced motion. A crisp 2px focus ring, never removed.

### Does the brand lock cap the score?
**No.** The lock is a strength: warm paper and navy ink is distinctive in a category full of white-and-orange admin tools, and it carries naturally into quotes and invoices. The audit shows the ceiling is execution. Two lock values need usage rules, not replacement:
- **`#2E75B6` as small text on cream is 4.26:1** and fails AA. As a button fill under white text it is 4.84:1 and passes. **Rule:** the button stays `#2E75B6`. Link and text-button colour uses its own hover shade `#296AA5` (5.00:1 on cream, 5.58:1 on sheet). That shade is already in the repo 31× as `color-mix(#2E75B6 86%, #0A2540)`, so it is the same colour, not a second primary.
- **Rajdhani below about 18px loses legibility** (condensed, small x-height). The repo uses it at 11px in 44 rules. **Rule (APPROVED and locked, D12):** Rajdhani 700 is used only at 20px and up. In the UI that means H3 and larger, plus hero money. In PDFs it means 15pt and up: the company name, the document number and the grand total or balance due. Every smaller label, kicker, table head or tile uses Source Sans 3.

So no alternative brand is proposed. One small non-lock change is proposed: success `#1B7F3A` becomes `#16703A` and warning `#B54708` becomes `#A4410A`, because the old values fail or nearly fail AA on cream (see §2).

---

## 1. Benchmarks: what to borrow, concretely

| Product | Borrow | Where it lands in Grafter | Don't borrow |
|---|---|---|---|
| **Linear** | Colour restraint (colour only for state); 1px low-contrast hairlines; crisp 2px focus rings; 120ms hover transitions; 32px dense secondary controls on desktop; one icon stroke across the app | §2 rule "blue = action", §5 borders, §6.1 button `sm`, §7 icons, §8 motion | Dark UI, gradients, glows (banned) |
| **Stripe Dashboard** | **Tabular, right-aligned money columns and quiet 1px borders**; sentence-case muted table headers; tinted status pills with text ("Paid", "Overdue"); a detail drawer that opens from a table row; amount-due-first hierarchy on invoices; skeletons that match the final layout row for row | §3.4 numbers, §6.6 table, §6.4 pills, §6.7 drawer, §11 PDF totals, §9 skeletons | Stripe's purple and its dense multi-tab chrome |
| **Notion** | Warm off-white neutrals; generous body line-height; row actions that appear on hover; plain-language empty states; one big calm page title | §2 paper ramp, §3 body 15/22, §6.6 hover actions, §9 copy tone | Emoji/icon-led pages, user-coloured chaos |
| **Superhuman** | Speed you can feel: 80ms press feedback, decelerating easing, toasts with an **Undo** action, dark compact toasts | §8 motion, §6.8 toast | Keyboard-command chrome or a palette (that would be new chrome) |
| **ServiceM8** (trade peer) | Phone-first job lists with big tap targets; the status is the thing you scan; one obvious next step per job | §6.6 stacked rows, §10 phone density; pairs with the existing `recommendQuoteAction` walk | Many saturated colours and icon badges per row |
| **Tradify** (trade peer) | A clear Quote → Job → Invoice status vocabulary; short forms with good defaults; a plain invoice with an obvious GST breakdown | §6.4 status mapping, §6.2 forms, §11 GST lines | Heavy coloured headers and banner bars |
| **Fergus** (trade peer) | Money clarity per job (quoted vs invoiced vs paid); compact desktop tables for office staff | §6.6 table density (52px rows, 32px actions), §3.4 money | Grey admin tables, small low-contrast text |

---

## 2. Colour

All values are in `tokens.css`. Ratios are WCAG 2.x, measured against **sheet `#FFFDF8` / cream `#F5F0E6`**.

### 2.1 Lock
| Token | Hex | Use |
|---|---|---|
| `--g-brand-cream` / `--g-bg-page` | `#F5F0E6` | Every page background, including the app shell root (today `#F9FAFB`). |
| `--g-brand-sheet` / `--g-bg-sheet` | `#FFFDF8` | Sheets, cards, inputs, popovers, dialogs, drawers, PDF page. Replaces every `#FFFFFF` surface. |
| `--g-brand-navy` / `--g-text` | `#0A2540` | Ink: titles, body, selected states, app header bar. **Never a page background.** |
| `--g-brand-blue` / `--g-primary` | `#2E75B6` | Primary button fill, focus ring. |

### 2.2 Neutrals
Two ramps. **Paper** = cream darkened warm (surfaces and lines). **Ink** = navy mixed into cream (text, icons, control borders).

| Token | Hex | Sheet | Cream | Use |
|---|---|---|---|---|
| `--g-paper-0` | `#FFFDF8` | — | — | sheet |
| `--g-paper-50` | `#FAF6EE` | | | row hover, quiet fills |
| `--g-paper-100` | `#F5F0E6` | | | page |
| `--g-paper-200` | `#EDE6D8` | | | pressed, disabled fill, skeleton |
| `--g-paper-300` | `#E2D9CC` | 1.37 | 1.23 | hairline (decorative: dividers, card edges) |
| `--g-paper-400` | `#D3C7B5` | 1.64 | 1.47 | strong line: table-head rule, hovered card edge |
| `--g-ink-900` | `#0A2540` | **15.28** | **13.68** | primary text |
| `--g-ink-700` | `#30455B` | 9.71 | 8.69 | strong secondary |
| `--g-ink-600` | `#4C5E6E` | 6.59 | 5.90 | secondary text |
| `--g-ink-500` | `#5B6B7C` | **5.38** | **4.82** | muted text, placeholders, default icons |
| `--g-ink-400` | `#717E89` | 4.09 | 3.66 | **disabled text only** (exempt), decorative icons |
| `--g-ink-300` | `#808A93` | **3.46** | **3.09** | input/select/checkbox borders (WCAG 1.4.11 ≥3:1) |

Retire: `#1A1A1A`, `#111827`, `#4A5568`, `#6B7280`, `#9CA3AF` (fails AA, 144 uses), `#E5E7EB`, `#D5DCE3`, `#D1D5DB`, `#CBD5E0`, `#F9FAFB`, `#F3F4F6`, `#F4F6F8`, `#FFFFFF` surfaces, and all Tailwind `gray-*`.

### 2.3 Primary
| Token | Hex | Ratio | Use |
|---|---|---|---|
| `--g-primary` | `#2E75B6` | white on it 4.84 | primary button fill, focus ring (4.76 / 4.26, ≥3:1 non-text) |
| `--g-primary-hover` | `#296AA5` | white 5.68 | primary hover |
| `--g-primary-active` | `#25629A` | white 6.38 | primary pressed |
| `--g-primary-text` | `#296AA5` | 5.58 / 5.00 | links, text buttons (`Open`, `Edit`) |
| `--g-primary-tint` | `#E3EDF8` | — | **only** for the selected option in a select list and a selected table row (selection is a consequence of an action) |
| `--g-primary-tint-text` | `#225A8D` | 6.08 on tint | text on the tint |

**One primary per view.** Each screen, sheet or drawer has at most one `#2E75B6` filled button. Everything else is secondary or ghost.

### 2.4 Semantic
| Tone | Fg (text, icon, dot) | Tint (pill/banner bg) | Line | Fg on sheet / cream / tint |
|---|---|---|---|---|
| success | `#16703A` | `#E6F1E7` | `#B5D5BC` | 6.05 / 5.42 / 5.30 |
| warning | `#A4410A` | `#FBEBDD` | `#EBC3A1` | 6.19 / 5.54 / 5.40 |
| danger | `#B42318` (unchanged) | `#F9E4E0` | `#EBB7AF` | 6.47 / 5.79 / 5.39; white on fill 6.57; hover `#9A1E14` 8.17 |
| info | `#2C4F75` (navy-derived, **not** primary blue) | `#E5EBF2` | `#B9C8DA` | 8.32 / 7.45 / 7.05 |
| neutral | `#4A5A6B` | `#ECE6DA` | `#D3C7B5` | 6.96 / 6.23 / 5.70 |

Tints are tuned on cream, not mixed onto white, so they sit warm on the paper. On the navy inverse surface (toast only) use `--g-*-on-inverse` (all ≥7.8:1).
**Why the two changes:** `#1B7F3A` is 4.46:1 on cream (fails) and 4.31:1 on a green tint (fails). `#B54708` passes on cream but only reaches 4.62:1 on tint. The new values clear AA everywhere with margin and are visually the same family.

### 2.5 Colour usage rules
- Tabs, segmented filters and nav: active = **navy text + 2px navy underline**. Today it is a blue inset (27 uses).
- Avatars: navy-700 fill with sheet text. Today it is a blue circle in the header.
- Company `report_theme` (`appShellTheme.ts`, `styles.ts`) may still override **header navy and document accent**. It must never change the primary button colour, status tones or page/sheet.
- Crew colours are data, not chrome. They come only from the crew palette (§2.6) and never fill buttons, headers or status.
- Scrim: `rgb(10 37 64 / 0.40)` everywhere. Replaces `bg-black/50` and the 45% navy mix. No `backdrop-blur`.

### 2.6 Crew schedule palette (Phase 1b)
One restrained set of **six** muted tints for the week board, replacing the free hex picker (`EMPLOYEE_COLORS` in `EmployeeColorSwatch.tsx`, "Schedule colour"). No green or teal (green is reserved for status pills), no saturated fills. Each tint has three tokens: **tint** (block fill), **ink** (time, suburb and crew name text on the tint, and on the sheet) and **rule** (3px left edge and the 10px crew swatch).

| Key | Tint | Ink | Rule | Ink on tint | Navy title on tint | Rule on tint (non-text) |
|---|---|---|---|---|---|---|
| `harbour` | #E4ECF3 | #24486B | #5D86AE | 7.94 | 13.02 | 3.21 |
| `plum` | #EFE5EE | #5B3460 | #93708F | 8.13 | 12.66 | 3.45 |
| `clay` | #F5E3DA | #7A3A22 | #B0705A | 6.87 | 12.49 | 3.18 |
| `ochre` | #F3EAD3 | #664B10 | #977832 | 6.79 | 12.96 | 3.47 |
| `slate` | #E5E8EC | #3D4756 | #717B8A | 7.65 | 12.64 | 3.49 |
| `dusk` | #E8E6F3 | #3E3A72 | #7F79B0 | 8.30 | 12.61 | 3.24 |

Every text pair passes AA (most pass AAA); every rule passes the 3:1 non-text minimum. Tokens: `--g-crew-<key>-tint|ink|rule` in `tokens.css` §9b.

Rules:
- **Crew colour means who. Status is always a pill** (§6.4, 20px `xs` size inside a block) and never a fill or border colour. A block's look never changes with status.
- Desktop week board: block = tint fill, 3px rule left edge, radius 6, time and `#ref` in Caption 600 crew ink, title Small 600 navy (wraps, never truncates), suburb Caption crew ink, pill underneath.
- Phone agenda: no fills. A 3px rule left edge on the row body, 10px swatches before the crew names. One crew: names in crew ink. Two or more: names in `--g-text-secondary`, one swatch each.
- Unassigned has **no tint**: `--g-paper-50` fill, 1px dashed `--g-line-strong` border, 3px dashed `--g-ink-300` left edge, "No crew yet".
- Multi-crew jobs appear in each crew's lane (as the board does today).
- More than six crew: colours repeat in order and the lane label carries the name. Don't add a seventh tint.
- Migration: map each saved hex to the nearest tint by hue (blues → harbour, purples → plum/dusk, reds/oranges → clay, yellows/browns → ochre, greys/greens/teals → slate).
- Mockups: `after/schedule-1280.png`, `after/schedule-390.png`.

---

## 3. Typography

### 3.1 Families
- **Titles:** Rajdhani 700 (`--g-font-title`). Display, H1, H2, H3, document titles and the hero total only.
- **Everything else:** Source Sans 3 (`--g-font-ui`) at 400 / 500 / 600. 700 is not used in the UI.
- **Load:** Google Fonts request reduced to `Rajdhani:wght@700` and `Source Sans 3:ital,wght@0,400;0,500;0,600;1,400`. Inter, Newsreader and JetBrains Mono are removed from `index.html` once no rule uses them. Load the five signature script faces only on the signature-capture route.
- `font-display: swap`, plus a size-adjusted fallback so the 44px button label doesn't jump: `@font-face { font-family: 'Source Sans 3 Fallback'; src: local('Arial'); size-adjust: 93%; }`. Verify the value in the LOOK proof.

### 3.2 Scale
Mobile values apply below 1024px; desktop at 1024px and up. Line-heights are in px so they snap to the 4px grid.

| Style | Family / weight | Mobile size / line-height | Desktop size / line-height | Letter-spacing | Use |
|---|---|---|---|---|---|
| **Display** | Rajdhani 700 | 40 / 44 | 56 / 56 | 0 | Hero money only: quote/invoice total on the paper, dashboard "today" figure. Maximum one per screen. |
| **H1** | Rajdhani 700 | 32 / 36 | 40 / 44 | 0.01em | Page title (`.ops-page-title`). Replaces the 20/22/32/40/44/56px variants. |
| **H2** | Rajdhani 700 | 24 / 28 | 28 / 32 | 0.01em | Sheet/drawer title, record name in an open job/client. |
| **H3** | Rajdhani 700 | 20 / 24 | 20 / 24 | 0.01em | Section title in a sheet, card title, empty-state title. |
| **Body** | Source Sans 3 400 | 16 / 24 | 15 / 22 | 0 | Default text, table cells. Strong = 600. |
| **Small** | Source Sans 3 400 | 14 / 20 | 13 / 18 | 0 | Secondary lines, metadata, helper text. |
| **Caption** | Source Sans 3 500 | 12 / 16 | 12 / 16 | 0.01em | Timestamps, pill labels, footnotes. **Floor: nothing smaller than 12px, ever.** |
| Label | Source Sans 3 600 | 14 / 20 | 13 / 18 | 0 | Field labels, table headers, quiet eyebrows (sentence case, `--g-text-muted`). |
| Input | Source Sans 3 400 | 16 / 24 | 16 / 24 | 0 | Always 16 (iOS and iPadOS zoom). |
| Button | Source Sans 3 600 | 15 / 20 | 15 / 20 | 0 | All buttons. |

Rules:
- **Uppercase** is not used for PDF labels (sentence case, as in the approved mockup). It is allowed only in the 12px caption of the pill-less "eyebrow" if a page already uses one. Default is sentence case. This follows the repo's own latest rule at `index.css` L22313.
- Kill all `text-[9px]`, `text-[10px]`, `text-[11px]` (163 uses) and map them to Caption. Kill weight 650.
- Headings use `text-wrap: balance`; body paragraphs use `text-wrap: pretty`; measure is max 68ch.
- Implement as utility classes driven by tokens, for example:
  ```css
  .g-h1 { font: var(--g-weight-title) var(--g-h1-size)/var(--g-h1-lh) var(--g-font-title); letter-spacing: var(--g-h1-ls); color: var(--g-text); }
  ```
  (one class per row above: `.g-display .g-h1 .g-h2 .g-h3 .g-body .g-small .g-caption .g-label`).

### 3.3 Hierarchy on a typical list page
Eyebrow (Label, muted) → H1 → meta (Small, muted, e.g. "All · 3 jobs") → primary action → sheet. This is already the paper-kit order (`jobs-list-laptop-1280-document.png`). The spec only fixes sizes and removes the navy "List" strip from the top of the sheet. The sheet header becomes the H1 block itself, so no strip is needed.

### 3.4 Numbers and money
- `font-variant-numeric: var(--g-numeric)` (tabular + lining) on **every** money, quantity, hours, date-in-table and reference (`#0042`) cell, and on totals. Add it once to a `.g-num` utility and to `td`, `.ops-money`, and totals rows.
- Money format: `$1,234.56`; negatives use a true minus `−$120.00`, not parentheses or a hyphen; zero is `$0.00`. Currency code is never shown (AUD implied).
- Money columns are right-aligned, and their header is right-aligned too.
- Cell money is Body 600. Totals row is Body 600. The **hero total** is Display Rajdhani with `tabular-nums` (harmless if the face ignores it).
- References (`#0042`) are Source Sans 3 600 tabular, not monospace.

---

## 4. Spacing and layout

### 4.1 Grid
A 4px base on an 8px rhythm. Tokens: `--g-space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 · `-12` 48 · `-16` 64 · `-20` 80. `--g-space-0-5` (2px) is for optical icon nudges only.
Semantic aliases: `--g-gap-inline` 8 (icon↔label, chip↔chip), `--g-gap-control` 12 (button↔button), `--g-stack-field` 16 (field↔field), `--g-stack-section` 24 (section↔section in a sheet), `--g-stack-page` 32 (page head↔sheet).
Tailwind half-steps (`*-0.5`, `*-1.5`, `*-2.5`, `*-3.5`: 598 uses) migrate to the nearest grid step.

### 4.2 Breakpoints
Collapse the 13 media widths to **four**: `600` (large phone landscape / small tablet), `768` (keeps the existing `md:` bottom-nav switch), `1024` (desktop type and gutters), `1280` (wide gutter). Always write `min-width` queries. Replace `max-width: 639px` with `(width < 600px)` or the Tailwind `max-sm` equivalent, never both 639 and 640.

### 4.3 Gutters, widths, padding
| Viewport | Page gutter `--g-gutter` | Sheet padding `--g-sheet-pad` | Card padding `--g-card-pad` | Page top / bottom |
|---|---|---|---|---|
| **375** | 16 | 16 | 16 | 16 / 32 + bottom nav |
| **390** | 16 | 16 | 16 | 16 / 32 + bottom nav |
| 600–1023 | 24 | 24 | 20 | 24 / 40 |
| **1024** | 32 | 32 | 24 | 32 / 48 |
| **1280** | 40 | 32 | 24 | 32 / 48 |

- **Max content width:** `--g-content-max: 1120px` (lists, dashboard, records), centred. Replaces 1100 / 1120 / 1400 / 1000. At 1280 that leaves 80px each side. The navy header's inner row aligns to the same 1120 so the logo sits over the sheet edge.
- Documents (quote/invoice paper): `--g-doc-max: 880px`. Forms in drawers: `--g-form-max: 720px` (two columns ≥600, one below).
- Dense card padding (e.g. dashboard widgets, schedule blocks): `--g-card-pad-dense` 12.
- Phone sheets keep a 16px gutter (they don't bleed) except bottom sheets and full-screen drawers.

---

## 5. Radius, borders, elevation

### 5.1 Radius
| Token | Value | Use |
|---|---|---|
| `--g-radius-xs` | 4 | checkbox, kbd, skeleton text bars, PDF boxes |
| `--g-radius-sm` | 8 | thumbnails, menu items (inner highlight), attachment chips |
| `--g-radius-md` | **10** | buttons, inputs, selects, popovers, toasts |
| `--g-radius-lg` | 16 | cards, sheets, dialogs, drawers, bottom-sheet top corners |
| `--g-radius-full` | 999 | status pills, filter chips, avatars |

Controls move from 12 to **10**. At 44px tall, 12 reads soft and consumer-ish, while 10 is crisper and closer to Stripe/Linear without going sharp. It is one token, so if Jack prefers 12, flip `--g-radius-md`; nothing else changes. Retire the Tailwind radius overrides (`2xl = 12px`) and map Tailwind `rounded-*` to the tokens (§12).
**No pill-shaped primary buttons** (the phone "Week board" button becomes r10).

### 5.2 Borders
- Always 1px. `--g-line` (`#E2D9CC`) for sheet/card edges and row dividers. `--g-line-strong` (`#D3C7B5`) for table-head rules and hovered card edges. `--g-line-control` (`#808A93`) for inputs, selects, checkboxes and secondary buttons (3:1 boundary).
- Navy rules (`--g-line-ink`) appear only in documents: the letterhead rule and the rule above the grand total.
- No `box-shadow` used as a border (the 27 `inset 0 -2px 0 #2E75B6` become `border-bottom: 2px solid var(--g-ink-900)` on tabs).

### 5.3 Elevation: flat + three levels, warm
Shadow colour is warm umber `rgb(62 44 21)`, never black or navy, so it reads as paper lifting off a cream desk. No glows, no coloured shadows, no inner highlights.

| Level | Token | Value | Use |
|---|---|---|---|
| Flat | `--g-elev-0` | none (1px line) | cards inside a sheet, inputs, table |
| 1 Raised | `--g-elev-1` | `0 1px 2px /.05, 0 2px 8px -2px /.06` | **the** page sheet on cream, hovered clickable card, sticky footer bar |
| 2 Overlay | `--g-elev-2` | `0 2px 4px /.05, 0 10px 24px -6px /.14` | popover, select menu, context menu, toast |
| 3 Modal | `--g-elev-3` | `0 4px 10px /.06, 0 24px 56px -12px /.22` | bottom sheet, drawer, dialog, PDF preview |

Replaces 17 CSS shadows + 6 Tailwind shadows, including the `inset 0 1px 0 #fff` highlight.

---

## 6. Components

Common to all interactive components:
- **Focus-visible:** `outline: 2px solid var(--g-focus-ring); outline-offset: 2px;` Inputs use the inset variant in §6.2. A global `:focus-visible` rule sets this, and **no component may remove it** (delete the 41 `box-shadow: none` focus rules). `:focus:not(:focus-visible)` shows nothing extra.
- **Disabled:** never `opacity: .5` on the whole control (it drops the label below AA and looks broken). Use the explicit disabled colours below, `cursor: not-allowed`, and keep `aria-disabled` focusable when the user needs a reason (tooltip/helper).
- **Loading:** the control keeps its width (`min-width` locked at the moment of click). The label is replaced by a 16px spinner + the same label at 0 opacity (so width holds), `aria-busy="true"`, and the control is not clickable.
- **Hit area:** minimum 44×44 on touch. Dense desktop controls (32px) extend with `::after { inset: -6px }` under `@media (pointer: coarse)`.

### 6.1 Button
Sizes: **md (default) 44px**: padding `0 16px`, icon 16, gap 8, Button text 15/20 600, radius 10, min-width 88. **sm 32px**: secondary/ghost only, desktop dense contexts (table row actions, toolbar), padding `0 12px`, text 14/20 600, icon 16. **Icon-only**: 44×44 (sm 32×32), icon 20 (sm 16), `aria-label` required. Primary is **always 44px** (lock) and never `sm`. Full-width on phone in sticky footers.

| State | Primary | Secondary | Ghost | Danger |
|---|---|---|---|---|
| Default | bg `--g-primary` `#2E75B6`, text `#FFF`, no border | bg `--g-bg-sheet`, text `--g-text`, 1px `--g-line-control` | bg transparent, text `--g-text` (icon `--g-text-muted`) | bg `--g-danger` `#B42318`, text `#FFF` |
| Hover (pointer: fine) | bg `--g-primary-hover` `#296AA5` | bg `--g-bg-hover` `#FAF6EE`, border `--g-ink-500` | bg `--g-bg-hover`, icon → `--g-text` | bg `--g-danger-hover` `#9A1E14` |
| Focus-visible | + 2px `#2E75B6` ring, offset 2 | same | same | same ring (blue, not red: focus is one colour) |
| Active / pressed | bg `--g-primary-active` `#25629A`; **no scale** | bg `--g-bg-pressed` `#EDE6D8` | bg `--g-bg-pressed` | bg `--g-danger-active` `#861A11` |
| Disabled | bg `--g-paper-200`, text `--g-text-disabled`, no shadow | bg `--g-paper-50`, border `--g-line`, text `--g-text-disabled` | text `--g-text-disabled` | as primary disabled |
| Loading | spinner 16 in `#FFF`, width locked | spinner in `--g-text-muted` | same | spinner in `#FFF` |
| Error | n/a. Buttons don't hold error state; the error shows next to the field or as a toast with **Retry** | | | |

Transitions: `background-color, border-color, color` at `--g-dur-fast` `--g-ease-standard`; pressed at `--g-dur-press`.
Danger is for **destructive confirmation only** (inside a confirm dialog or delete flow). In lists, "Delete" is a ghost button with danger-coloured text (`--g-danger`), never a red fill.
Replaces: `.btn-primary/-secondary/-ghost/-danger/-icon`, `.ops-next-control*` (`-sm` 32px primary is removed; use secondary sm), 55 scoped overrides, and the hand-rolled buttons in `PageError.tsx`, `ManagedSelect.tsx` and `Toast.tsx`.

### 6.2 Input (text, number, date, time, textarea, search)
- Height 44 (textarea min 96, grows to 240 then scrolls), padding `0 12px` (textarea `10px 12px`), radius 10, text Input 16/24, bg `--g-bg-sheet`, border 1px `--g-line-control`. Placeholder `--g-text-muted` (hint, never a label substitute).
- Label above: Label style, 8px gap to the field. Required marker = "(required)" in Small muted text after the label, not a red asterisk. Helper text below: Small, `--g-text-muted`, 4px gap.
- Leading icon (search): 20px at left 12, text padding-left 40. Trailing clear button: 32×32 ghost icon (16) inside a 44 hit.
- Number/money inputs: right-aligned text with `tabular-nums`; `$` prefix shown as a 12px-padded muted adornment inside the field.

| State | Spec |
|---|---|
| Default | border `--g-line-control` (3.46:1 on sheet) |
| Hover | border `--g-ink-500` |
| Focus (any) | border `--g-primary` + `box-shadow: inset 0 0 0 1px var(--g-primary)` (reads as a crisp 2px edge; **no blurred halo, no glow**) |
| Filled | text `--g-text` |
| Disabled | bg `--g-bg-disabled`, border `--g-line`, text `--g-text-disabled` |
| Read-only | bg transparent, no border, text `--g-text`. It looks like text and stays selectable. |
| Loading (async validation / lookup) | 16px spinner trailing at right 12 |
| Error | border `--g-danger` + inset 1px `--g-danger`; helper replaced by error text: Small, `--g-danger`, 16px `AlertCircle` icon, `aria-invalid="true"` + `aria-describedby`. The message says what to do ("Enter an email like name@business.com.au"). |

Remove: the 24px "inline chip inputs" forced to `12px !important` (`index.css` L2188). They become standard 44px fields in their row, or 32px **with 16px text** on desktop only.

### 6.3 Select
- **Native `<select>`** on phone and for short static lists. Same box as Input, padding-right 40, custom 16px `ChevronDown` at right 12 in `--g-text-muted`, `appearance: none`.
- **`ManagedSelect` popover** (desktop, searchable lists): trigger = Input box. Menu: bg `--g-bg-sheet`, 1px `--g-line`, radius 10, `--g-elev-2`, 4px inner padding, max-height 320, offset 4px from the trigger, same width as the trigger (min 220). Search field at top: 40px tall with 16px text, a flat field inside the menu (bottom hairline only). Options: 40px rows (44 under `pointer: coarse`), padding `0 12px`, radius 8 inner highlight. Hover and keyboard-active (`aria-activedescendant`) = `--g-bg-hover`; the focus ring stays on the listbox, not on each option. Selected = `--g-primary-tint` bg, `--g-primary-tint-text` text, 16px `Check` at the right. "Add new" footer row: text button `--g-primary-text`, 1px top hairline. Empty: "No matches for 'x'" Small muted. Loading: 3 skeleton rows.
- States for the trigger mirror Input (hover, focus, disabled, error). Open state keeps the focus edge on the trigger.

### 6.4 Status pill and chip
**Status pill (read-only)**: height 24, padding `0 10px 0 8px`, radius full, Caption text 12/16 **600**, sentence case, 6px dot (`currentColor`) + 6px gap, bg = tone tint, text/dot = tone fg, no border. Phone: same size (it's not tappable).

| Status (from `StatusBadge.tsx`) | Tone |
|---|---|
| draft, closed, **cancelled** (was danger) | neutral |
| scheduled, sent, issued, open, active | info (navy-derived; was primary blue) |
| in progress, pending, expired | warning |
| accepted, approved, completed, paid | success |
| overdue, declined, rejected | danger |

One pill style replaces `.ops-status` (10px solid white-on-colour uppercase), `.badge`, the Rajdhani "TODAY" pill and plain-text statuses. The `select.ops-status` (a status you can change) becomes a pill-shaped trigger: same pill + 12px `ChevronDown`, opens the Select menu, with a 44 hit area.

**Filter chip (interactive)**: height 32 desktop / 36 phone (44 hit), padding `0 12px`, radius full, Small 600. Default: bg transparent, 1px `--g-line-control`, text `--g-text-secondary`. Hover: bg `--g-bg-hover`. **Selected: bg `--g-ink-900`, text `--g-text-inverse`, border navy** (navy = state; blue stays for actions). Focus-visible: ring. Disabled: text disabled, border `--g-line`. Optional count: "Overdue 3", count in tabular nums.
**Attachment chip** (`.ops-attach-chip`): height 32, radius 8, 1px `--g-line`, bg sheet, icon 16 muted, Small 500 truncated at 24ch, remove = 24px ghost icon inside a 44 hit.

### 6.5 Card
- bg `--g-bg-sheet`, 1px `--g-line`, radius 16, padding `--g-card-pad` (16/20/24), `--g-elev-0` when inside a sheet. A **page-level sheet** on cream uses `--g-elev-1`.
- Anatomy: optional eyebrow (Label muted) → title H3 → body (Body) → meta row (Small muted, items separated by ` · `) → footer actions (right-aligned on desktop, full-width stacked on phone) separated by a 16px gap, not a rule.
- **Clickable card**: whole card is the link (one `<a>`, inner buttons stop propagation). Hover: border `--g-line-strong` + `--g-elev-1` over 120ms. Pressed: bg `--g-bg-hover`. Focus-visible: ring. Disabled/archived: text secondary, no hover.
- Loading: card skeleton matching the anatomy (§9). Error: inline banner inside the card (§9).
- **No nested cards.** Inside a sheet, sections are separated by a hairline + 24px spacing. Dashboard widgets are cards on the cream page (the dashboard is the one page made of cards), each `--g-elev-1`.
- Photo "stamp" (`.ops-stamp`): keep. The empty stamp moves from navy to `--g-paper-200` with a 24px muted `Image` icon, so there are no navy blocks inside paper.

### 6.6 Table (desktop) and stacked list (phone)
**Desktop (≥768):**
- Lives directly in the page sheet. No container border of its own; the sheet edge is the border.
- **Title row (D14):** list sheets have no navy "List" strip. The sheet opens with a clean `--g-bg-sheet` title row (eyebrow, H1, whisper meta, primary action), then **one** 1px `--g-line` divider. The thin navy head bar is only for **open records** (job, quote in progress), so navy stays an accent. The Dashboard and Schedule follow the same title-row pattern.
- Header row: 40 high, Label style (13/18 600, sentence case), `--g-text-muted`, bottom border 1px `--g-line-strong`, sticky at top inside scroll containers (bg sheet).
- Body rows: 52 high (`--g-row-h`), padding `0 12px` per cell (first cell left padding = sheet padding), 1px `--g-line` divider, Body text. The first identifying column (customer/job name) is 600 `--g-text`; secondary columns `--g-text-secondary`; reference `#0042` 600 tabular.
- Numbers right-aligned, tabular, with the header aligned to match. Status column uses the pill. Dates are "12 Oct" this year and "12 Oct 2025" otherwise, tabular.
- Row hover: bg `--g-bg-hover`. Row actions (ghost sm 32 icon buttons, `MoreHorizontal`) are at 0 opacity until row hover or focus-within on `pointer: fine`, and always visible on touch. Selected row: `--g-primary-tint`. Focus-visible on a row link: inset 2px ring.
- Clickable rows open the record. The detail opens in the existing drawer/record surface, not a new one.
- Empty: the empty state renders inside the sheet below the header row (§9). Loading: header renders immediately; 6 skeleton rows at 52px. Error: banner replaces rows, header stays.
- Overflow: tables never scroll horizontally on desktop. Hide tertiary columns at 1024 (declare `priority` per column in `DataTable`).

**Phone stacked (<768):** each row becomes a 2-line list item in the same sheet.
```
┌───────────────────────────────────────────────┐
│ Northside Plumbing & Gas             $1,210.00│  ← Body 600 ink-900 · Body 600 tabular, right
│ #0042 · Kedron · 12 Oct             (● Paid)  │  ← Small muted, wraps · status pill
└───────────────────────────────────────────────┘
```
- Min height 64 (`--g-row-h-stacked`), padding `12px 16px`, gap 4 between lines, 1px `--g-line` divider inset 16 left. The whole row is the tap target (≥44). Pressed bg `--g-bg-pressed`.
- Line 1: primary label (wraps to a second line, never truncates) + money or time (never wraps). Line 2: up to **two** metadata items joined by ` · ` + status pill on the right. A row action (`MoreHorizontal`) is 44×44 at the far right, only when the list has row-level actions.
- Same `DataTable` columns drive both layouts: `primary`, `amount`, `meta[]`, `status`. One component replaces the per-page `@media (max-width: 639px)` collapses.

### 6.7 Sheet / drawer / dialog (existing overlays only)
Map existing surfaces (`.overlay-panel*`, `.hub-ops-form-sheet`, `Modal.tsx`, `AppDialog.tsx`, `ConfirmDialog.tsx`, `ScheduleJobSheet.tsx`, `JobBill*Sheet.tsx`, `LabourRatePickerSheet.tsx`, PDF preview) onto three presentations:

| Presentation | Phone (<768) | Tablet/desktop (≥768) |
|---|---|---|
| **Sheet** (forms: new job, time entry, send quote, pickers) | Bottom sheet: full width, top radius 16, max-height `calc(100dvh - 48px)`, grabber 36×4 `--g-ink-200` radius full, 8px from top | **Right drawer**: width 480 (`--g-drawer-w`) or 720 for two-column forms and PDF preview (`--g-drawer-w-lg`), inset 8px from the viewport edges, radius 16, full height minus 16 |
| **Dialog** (confirm, short decisions) | Bottom sheet, content height | Centred, width 440 (`--g-dialog-w`), radius 16 |
| **Full screen** (PDF preview, signature, photo viewer) | Full screen, no radius, safe-area padding | Drawer 720 or centred at 90vw/90vh max |

Anatomy: **header** 56 high (padding `0 8px 0 sheet-pad`): H2 title on mobile/desktop sheet, H3 for dialogs, optional Small muted subtitle under it, close = 44×44 ghost icon (`X` 20) at the right (replaces the 32px close in `Modal.tsx`). Header has a 1px `--g-line` bottom border **only once the body scrolls** (scroll-linked; looks calmer at rest). **Body:** padding `--g-sheet-pad`, fields stacked at 16, sections at 24, form max 720. **Footer:** sticky, bg `--g-bg-sheet`, 1px top `--g-line`, padding `12px sheet-pad` + `env(safe-area-inset-bottom)`. Actions: right-aligned on desktop (Cancel ghost/secondary left of the primary); on phone, the primary is full-width and secondary is a full-width ghost above it, or one row of two equal buttons.
Surface: bg `--g-bg-sheet`, `--g-elev-3`, scrim `--g-scrim`. No black shadows, no blur.
States: **opening** (§8), **loading** (body skeleton, footer primary disabled), **submitting** (primary loading, the rest of the sheet stays interactive except inputs `aria-busy`), **error** (danger banner pinned under the header, focus moves to it, plus field errors), **dirty-close** (tapping scrim or Esc on a dirty form opens a Dialog: "Discard changes?" with "Keep editing" secondary and "Discard" danger).
Behaviour: focus trap; Esc closes; scrim click closes (unless dirty); return focus to the trigger; body scroll locked; swipe-down to close on phone only from the grabber/header.

### 6.8 Toast (D13, approved)
- **A small navy floating chip**: bg `--g-bg-inverse` (#0A2540), cream text `--g-text-inverse` (15/20), radius 10, `--g-elev-2`, min-height 48, padding `6px 6px 6px 16px`, width fits the message up to 420 (`--g-toast-max-w`). It is a chip, not a bar: never full width.
- **Position:** phone bottom-centre, 12 above the tab bar and the safe area; laptop bottom-right, 24 from the edges. Max 3 stacked (8 gap); a 4th replaces the oldest.
- **One action at most** (Open, Undo, Retry, View): text button 36 high inside a 44 hit area, `--g-primary-on-inverse` 600. Success and info chips have no close button (they time out); error chips add a 44 hit `X`.
- **No icons and no green.** The message says what happened. **Errors** use the same navy chip with a 4px `--g-warning` (#A4410A) left accent (`box-shadow: inset 4px 0 0`), never a red chip.
- **Timing:** 5s without an action; **15s when it carries Open or Undo**, which stay tappable the whole time; errors stay until dismissed. Timers pause on hover, focus-within and when the page is hidden.
- ARIA: one persistent `aria-live="polite"` region for success/info; `role="alert"` for errors. Copy is one past-tense sentence naming the thing: "Invoice #0112 sent to Sarah Whitfield." Never "Success!".
- Motion: `motion.md` §2.2. Mockups: `after/motion/toast-in-strip.png`, `toast-in-laptop-strip.png`.

### 6.9 Section chips on Company settings (Phase 1b)
Phones **wrap** the section chips instead of scrolling them (`after/settings-375.png`, `after/settings-390.png`).
- Chips 36 high (44 hit via a 4px `::after` above and below), 8 row gap, 6 column gap, active chip navy-filled (§6.4). Accounting keeps a 16px `ArrowUpRight` because it is a separate route.
- Below 600px the chip block is a **section index at the top of the page**, not sticky. From 600px it is one sticky row (60, as today) under the header.
- Why wrap, not a scroll cue: all 7 sections (8 when Texting goes live) stay visible, so nobody has to discover a hidden chip (live, "Email" was cut and Team, Company and Accounting were off-screen). Nothing is clipped, which the lock now forbids. Wrapping takes 2 rows at 375–390 (3 at 320, or with Texting). Keeping that sticky would take 101–145px, which is 15–22% of an iPhone SE screen, so on phones it scrolls away with the page instead.
- Repo note for the later PR: `COMPANY_SETTINGS_NAV_ROW_PX = 60` stays for ≥600; phones use auto height.

---

## 7. Icons
- **One library: Lucide** (`lucide-react`, already the only icon set: 124 files, ~160 icons). Upgrade from `^0.344.0` to current in its own PR (some icon names were renamed; codemod the imports).
- **Sizes: 16, 20, 24 only.** 16 sits inline with Small/Body text, in buttons, pills and table actions. 20 for standalone icon buttons, nav, inputs and toasts. 24 for empty and error states (inside a 48px `--g-paper-200` circle). Map the current 17 sizes: 8–15 → 16, 18–22 → 20, 24–48 → 24 (the 40/48 "hero" icons in empty states become 24-in-a-48-circle).
- **Stroke: 1.75** at 16 and 20; **1.5** at 24. Set globally with CSS, because CSS beats SVG presentation attributes: `svg.lucide { stroke-width: var(--g-icon-stroke); } svg.lucide[width="24"] { stroke-width: var(--g-icon-stroke-lg); }`. Remove the 1.2/1.5/3 one-offs.
- Colour: `currentColor`. Default `--g-text-muted`; `--g-text` on hover/active; semantic fg only inside pills, banners and toasts. Icons never carry meaning alone; pair with text or `aria-label`.
- Brand mark (`BtsMark.tsx`) and the 2 bespoke receipt SVGs in `ExpensesPage.tsx` stay custom.

---

## 8. Motion

> **Superseded in detail by `spec/motion.md` (Phase 1b)**, which has exact properties, the save-feedback sequence, toast lifetimes (D13), frame strips and reduced-motion behaviour. The table below stays as a summary.

| Interaction | Duration | Easing | Properties |
|---|---|---|---|
| Hover (bg, border, colour) | 120ms `--g-dur-fast` | `--g-ease-standard` `cubic-bezier(.2,0,0,1)` | `background-color, border-color, color, box-shadow` (never `transition: all`) |
| Press | 80ms `--g-dur-press` | standard | background only. **No scale** (scaling blurs text and fights the 44px lock). |
| Focus ring | 0ms | — | appears instantly |
| Popover / select menu open | 160ms | `--g-ease-enter` `cubic-bezier(.16,1,.3,1)` | opacity 0→1, translateY(−4px × distance)→0 |
| Popover close | 100ms | `--g-ease-exit` `cubic-bezier(.4,0,1,1)` | opacity |
| Sheet open (phone bottom sheet) | 280ms `--g-dur-slow` | enter | translateY(100%)→0; scrim opacity 0→1 over 200ms |
| Drawer open (desktop) | 240ms | enter | translateX(24px × distance)→0 + opacity |
| Sheet / drawer close | 180ms `--g-dur-exit` | exit | reverse; scrim 150ms |
| Toast enter | 200ms `--g-dur-base` | enter | translateY(8px × distance)→0 + opacity |
| Toast exit | 150ms | exit | opacity + translateY(4px) |
| Toast stack shift | 200ms | standard | transform |
| Page / route change | 150ms | standard | **opacity crossfade of the content area only** (no slide, header never animates) |
| Skeleton → content | 150ms | standard | opacity crossfade |
| Skeleton shimmer | 1400ms linear infinite | — | background-position sweep, starts after a 300ms delay |
| Spinner | 800ms linear infinite | — | rotate |

Distances multiply by `--g-motion-distance` (1 normally).
**`prefers-reduced-motion: reduce`** (tokens already switch): `--g-motion-distance: 0` (no travel; sheets and toasts fade in place), durations ≤120ms, no skeleton shimmer (static `--g-paper-200`), `scroll-behavior: auto`. The spinner keeps rotating (it conveys progress) but at 1200ms. Add one safety net in the base layer for any stray animation: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-iteration-count: 1 !important; scroll-behavior: auto !important; } .g-spinner { animation-iteration-count: infinite !important; } }`.

---

## 9. Loading, empty and error states

### 9.1 Skeletons
- Show only if loading exceeds **300ms** (`--g-skeleton-delay`), so fast loads never flash. Once shown, keep it at least 300ms so it doesn't flicker.
- **Match the final layout exactly:** same sheet, same header, same row heights (52 desktop, 64 phone), same paddings. Real static text (page title, table headers, labels) renders immediately; only data is skeleton.
- Blocks: bg `--g-paper-200` on sheet (or `--g-paper-50` on paper-200 surfaces), radius 4 for text bars, full for pill/avatar placeholders, 10 for buttons. Bar height = font-size (e.g. 15 for Body, 12 for Caption), vertically centred in its line-height.
- Widths are **deterministic** (cycle 72%, 48%, 64%, 56%… by row index), never `Math.random()` (today's `SkeletonRow` jitters on every render).
- Shimmer: a 1400ms linear sweep of a `--g-paper-50` highlight at 30% width across `--g-paper-200`; off under reduced motion.
- Counts: list/table 6 rows; dashboard card 3 lines; drawer form = real labels + skeleton fields.
- `aria-busy="true"` on the region, plus a visually hidden "Loading jobs…" live message.

### 9.2 Empty states
Inside the sheet, centred in the table body area, max-width 360, padding 48 top / 48 bottom (32 on phone):
- 48px circle `--g-paper-200` with a 24px Lucide icon in `--g-text-muted` (stroke 1.5) → 16 gap → **H3** title → 4 gap → Body `--g-text-secondary` explanation (one or two sentences) → 24 gap → one primary button **only if creating is the natural next step**, otherwise a secondary.
- **First-use empty:** "No jobs yet" / "Jobs you book from a quote, or add here, will show up in this list." [New job]
- **Filtered empty:** "No overdue invoices" / "Nothing is past due right now." [Clear filter] (secondary).
- **Search empty:** "No clients match 'harbr'" / "Check the spelling, or search by phone or suburb." (no button).
- Copy tone: see §9.5.

### 9.3 Error states
Three sizes, all saying **what happened + what to do**, with a technical detail behind a "Details" disclosure (error code, request id) for support:
- **Field:** under the input (§6.2). "Enter a valid ABN (11 digits)."
- **Section / banner** (inside a sheet, a card, or under a drawer header): bg `--g-danger-tint`, 1px `--g-danger-line`, radius 10, padding 12 16, 20px `AlertCircle` `--g-danger`, Body `--g-text` message, trailing secondary sm **Retry**. Warnings use the same anatomy in warning tones (e.g. "Xero sync is off. Payments won't push until you turn it back on.").
- **Page** (load failed): replaces the sheet body. Same layout as the empty state with a `--g-danger-tint` circle and `WifiOff`/`AlertCircle` icon in `--g-danger`. "Couldn't load invoices" / "Check your connection, then try again. Your work is saved." [Try again] (primary). This replaces `PageError.tsx`'s `red-50/red-400` and navy button.
- Errors never use toast alone when the user must act. Toast errors are for background failures ("Couldn't send the reminder SMS. [Retry]").
- Offline: a single neutral banner under the header, "You're offline. Changes will sync when you're back." (existing PWA path; restyle only).

### 9.4 State mockups and the one-primary rule (Phase 1b)
Boards (empty, loading, error side by side): `after/states/{dashboard,jobs,schedule,invoice,clients}-{390,1280}.png`.
- **One primary per screen, in every state.** When an error shows **Try again**, the page's usual primary (New job, New client, Week board) steps down to secondary for as long as the error shows. Empty states use a secondary button when the title row already has the primary (e.g. "Start from a quote" under New job).
- **Fail small.** If only one section fails, only that section shows the error (Dashboard: "Couldn't load today's schedule"; reminders and widgets still render). Whole-page errors are for when the page has nothing to show.
- Every error ends with a support reference in Caption muted ("Error 503 · ref 7F2K-91QD") so a user can read it out on the phone.
- Loading keeps real titles, labels, column heads, filter chips and totals labels; only data becomes skeleton. Whisper meta says "Loading jobs…".
- Empty states never show $0.00 tables or empty grids with headers alone. A widget can show its $0.00 figure plus one quiet line ("Nothing owing. Sent invoices show here until they're paid.").

**First run** (`after/dashboard-firstrun-390.png`, `-1280.png`): a brand-new company sees a setup guide on the Dashboard sheet instead of empty widgets.
- Eyebrow = company name, H1 "Get ready to quote and invoice", whisper "Three steps left, about five minutes. Do them in any order."
- Progress: "1 of 4 done" + "Next: add your ABN", a 6px navy bar on `--g-paper-200` (no green), `role="progressbar"`.
- Checklist: Create your company (done: navy tick on a `--g-paper-50` tile with a hairline, per D11), **Add your ABN** (current step: navy number disc, the **only primary button**), Add bank details for invoices, Create your first quote (secondary buttons). Each step has one sentence on why it matters.
- "Not ready yet? Hide this guide." The guide disappears for good once all four are done. On laptop, a quiet aside shows Today's schedule and Reminders as one-line empties.
- The steps read real fields: `abn`, `payment_methods[]`, and the first quote. No new settings.

### 9.5 Copy tone (all states, toasts and guides)
1. **Plain Australian English**, sentence case, Australian spelling (licence, organise, colour, cheque). Read it aloud; if it sounds like a form, rewrite it.
2. **Say what happened, then what to do.** "Couldn't load invoices. Check your connection, then try again." Never just "Error".
3. **Name the thing.** "invoices", "today's schedule", "Invoice #0112", not "items", "data" or "content".
4. **Reassure only with facts.** "Nothing you've saved is lost." Only say it when it's true for that failure.
5. **No blame, no jokes, no exclamation marks, no "Oops", no "Whoops", no emoji.** Don't say "simply" or "just".
6. **Verb-first buttons, two or three words**: Add your ABN, Try again, New job, Place, Record payment. A button says what happens when you tap it, never "OK", "Submit" or "Click here".
7. **Short.** Titles ≤ 5 words; body ≤ 2 sentences (≈ 25 words); toast = one sentence in past tense.
8. **Every trade.** Use job, quote, invoice, client, crew, site, booking. No trade-specific jargon in UI chrome; trade detail lives in the data (titles, line items). Never "ute"; say "vehicle" if it's ever needed. No Relovi.
9. **Numbers are exact**: money with cents and tabular figures, dates "Fri 30 Oct", times 24-hour "07:30" to match the board, counts as digits ("3 jobs").
10. **Empty states point forward**: what will appear here, and the one action that makes it appear. **First run** speaks to the owner ("Get ready to quote and invoice") and says how long it takes.
11. **Errors carry a reference** for support; **toasts carry one action** (D13).

---

## 10. Phone density rules (375 and 390)
1. Touch targets ≥44×44, with ≥8px between adjacent targets.
2. Type: Body 16, Small 14, Caption 12 minimum, H1 32. Display only for document totals (40).
3. **One primary action per screen**, in a sticky footer (thumb zone) when the screen is a form or document. Full width, 44 high, 12px padding + safe area. The footer has a top hairline, not a shadow.
4. Page gutter 16; sheet padding 16; stack between sections 24, between fields 16, inside rows 4.
5. Lists use the stacked row (64 min): line 1 = name + money/time; line 2 = at most two meta items + status. Everything else lives in the record.
6. Never horizontal-scroll content. Filter-chip and section-chip rows **wrap** (§6.9). Tabs that don't fit become the 2×2 segmented control. Nothing scrolls sideways at 375 or 390.
7. Forms: one field per row, except short pairs (Qty + Unit price, Start + End) at ≥360 width.
8. **Nothing clips and nothing ellipsises.** Text wraps (up to two lines in rows; record headers can take more). Never shrink text to fit. If a placeholder doesn't fit, shorten the copy ("Add a reminder").
9. Hide tertiary metadata rather than squeezing it; reveal it in the record.
10. Bottom nav (existing, 56 + safe area) stays. Toasts and sticky footers sit above it.
11. Dashboard widgets stack full-width at 16 gaps; widget internal padding 12 (dense).
12. Keyboard: inputs set `inputmode` and `autocomplete` (tel, email, numeric for money and qty) so the right keypad appears.

---

## 11. Quote and invoice PDF (`src/reports/commercial/CommercialDocumentPdf.tsx`)
Goal: the PDF is the **same document** as the in-app paper (`docs/look/quote-paper-reference.png`), so the client sees what the tradie saw. This is a restyle of the existing Looplet document; content and order are unchanged.

**Page:** A4 (595×842pt). Margins: 40 sides, 36 top, 56 bottom (footer zone). Background **`#FFFDF8`** (the sheet). In a PDF the page *is* the paper; a `#F5F0E6` fill (today's value) prints as a beige wash on office printers. No coloured bands.

**Fonts:** Rajdhani 700 + Source Sans 3 **400, 600, 700** (register 600; today only 400/700). Bundle the TTFs under `public/fonts/` and register from the app origin instead of jsDelivr at render time. Purchase orders use the same faces (today Roboto).

**Type (pt), six sizes only:**
| Element | Font | Size / leading | Colour | Notes |
|---|---|---|---|---|
| Doc kind "Quote" / "Tax invoice" | Source Sans 3 600 | 10 / 13 | ink-600 | top right, above the number |
| Doc number "#0112" | Rajdhani 700 | 22 / 24 | ink-900 | top right; navy, never blue |
| Company name | Rajdhani 700 | 20 / 22 | ink-900 | letterhead, left |
| Section label (Prepared for, Scope of works, Variations, How to pay, column heads) | Source Sans 3 600 | 9 / 12, sentence case | ink-500 | (D12: no Rajdhani below 15pt) |
| Body, table cells, party detail, notes | Source Sans 3 400 | 9 / 13 | ink-900 (secondary ink-600) | party name 600 at 10 |
| Meta (ABN, licence, contact, dates, footer) | Source Sans 3 400 | 7.5 / 10 | ink-500 | floor: 7.5pt |
| Grand total value | Rajdhani 700 | 20 / 22 | ink-900 | right-aligned |
Five sizes in use (7.5, 9, 10, 20, 22), within the six-size cap. The doc number is navy, not blue: nothing on paper is an action. The only blue on paper is a "View and accept online" portal link if present.

**Letterhead:** logo (existing `logo_letterhead_size` logic unchanged) + company block left; title, number, dates right; a **1pt navy rule** under it (was 2.5pt), 14pt below.

**Line-item table:**
- Header: no fill. Section-label style (Source Sans 3 600 9, sentence case, ink-500), 6pt bottom padding, **0.75pt navy rule** under it. Numeric headers right-aligned.
- Columns: Type 14% (ink-500, Source Sans 400 9) · Description 51% · Qty 9% · Unit 13% · Amount 13%. If no line has a `charge_type`, drop the Type column and give Description 65%.
- Rows: 6pt vertical padding, **0.5pt `#E2D9CC` hairline** between rows, no zebra. `wrap={false}` per row (existing). Amount 600 (was 700).
- Digits: react-pdf can't switch on `tnum`. **Verify Source Sans 3's default figures**; if they are proportional, register a second family "Source Sans 3 Tab" built with `pyftfeatfreeze -f tnum` and use it for Qty/Unit/Amount and totals so decimals align.
- Money `$1,234.56`; credits/discount lines `−$120.00`.

**Totals block** (right-aligned, 240pt wide, 12pt above):
```
Subtotal (ex GST)                         $1,100.00   ← 9pt ink-600 · 9pt ink-900 tabular
GST (10%)                                   $110.00   ← label from gstDocumentLabel(): "GST (10%)" or "GST" for mixed rates
───────────────────────────────────────────────────   ← 0.75pt navy rule, 6pt above / 8pt below
Total (inc GST)                          $1,210.00    ← Source Sans 600 10 ink-900 · Rajdhani 20 ink-900
```
- **No navy band** (today a filled `#0A2540` box). The big number on paper is the hierarchy, as in the in-app paper.
- **Invoice with payments:** after the total, add `Payments to date  −$500.00` (9pt) and then **`Balance due  $710.00`** in the grand style (APPROVED, D8). The total above it drops to a 9pt 600 row. The amount the client must pay is always the biggest number on the page (Stripe's amount-due-first rule). Add the due date beneath it in meta style: "Due 26 Sep 2026".
- GST rules: always print the GST line, even at $0.00, when the business is GST-registered. Keep the existing labels `Subtotal (ex GST)`, `GST (10%)`/`GST`, `Total (inc GST)` exactly (`src/lib/gst.ts`). ABN in the letterhead is mandatory on a tax invoice (already present). *Open question for Jack, not a style change:* a business that is not GST-registered shouldn't title the document "TAX INVOICE".

**Variations (Included / Not included):** two columns as today, but headers in the section-label style with no fill. "Included" is ink-900 and "Not included" is `--g-warning` `#A4410A` (replaces the `#92400E` band). Bullets are an en dash in ink-500, 9/13 body.

**How to pay:** a 0.5pt `#E2D9CC` box, radius 4, padding 10. Method name Source Sans 600 9, details 9/13 tabular (BSB, account number).

**Footer** (fixed): 0.5pt hairline, then 7.5pt ink-500: left "Northside Plumbing & Gas · Tax invoice #0112", right "Page 1 of 2". Replaces the lower-cased "company — tax invoice".

**Other PDFs** (inspection, JHA, Take 5, electrical test report): a later PR maps `defaultPdfColors` in `src/reports/shared/styles.ts` to these tokens (ink `#0A2540`, muted `#5B6B7C`, line `#E2D9CC`, semantic fg values above) and switches Roboto to Source Sans 3. Roboto was chosen for the technical glyphs Ω µ ° ² ³; Source Sans 3 includes Latin-1 and Greek, so it should cover them, but render a test page with all five before dropping Roboto.

---

## 12. Tailwind mapping (so utilities and tokens agree)
`tailwind.config.js` `theme.extend`:
```js
fontFamily: { sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'], title: ['Rajdhani', '"Source Sans 3"', 'sans-serif'] },
colors: {
  navy: 'var(--g-ink-900)', accent: 'var(--g-primary)', cream: 'var(--g-bg-page)', sheet: 'var(--g-bg-sheet)',
  ink: 'var(--g-text)', muted: 'var(--g-text-muted)', rule: 'var(--g-line)', zebra: 'var(--g-bg-hover)',
  pass: 'var(--g-success)', fail: 'var(--g-danger)', warning: 'var(--g-warning)',
},
borderRadius: { DEFAULT: 'var(--g-radius-md)', sm: 'var(--g-radius-xs)', md: 'var(--g-radius-md)', lg: 'var(--g-radius-lg)', xl: 'var(--g-radius-lg)', '2xl': 'var(--g-radius-lg)', full: 'var(--g-radius-full)' },
boxShadow: { sm: 'var(--g-elev-1)', DEFAULT: 'var(--g-elev-1)', md: 'var(--g-elev-2)', lg: 'var(--g-elev-2)', xl: 'var(--g-elev-3)', '2xl': 'var(--g-elev-3)' },
```
Keeping the existing names (`navy`, `accent`, `ink`, `muted`, `rule`, `zebra`) means 760+ utility uses re-point at once. `ink` moves from `#1A1A1A` to navy and `rule` from cool grey to warm hairline; that is the intended visible change, made in one PR. Then add lint rules (eslint `no-restricted-syntax` on `className` strings matching `#[0-9a-fA-F]{3,6}` and `(gray|slate|red|blue|green|amber)-\d`; stylelint `color-no-hex` outside `tokens.css`) so drift can't return.

---

## 13. Implementation order: token-first, thin, reversible
> **Superseded by `implementation-plan.md` (19 Oct 2026).** That file is the authoritative PR list. The table below is kept for history.

Every PR: ≤ ~300 changed lines where possible; LOOK proof per `AGENTS.md` (laptop 1280 + phone 390 frames, plus 375 where layout-sensitive) compared to `docs/look/quote-paper-reference.png`; update the look tests that assert literal CSS in the same PR; revert = `git revert` of that PR alone.

| # | PR | What changes | Visible diff | Reversible because |
|---|---|---|---|---|
| 1 | **tokens: add `src/styles/tokens.css`** | Add the file + `@import` at the top of `index.css`. Add a lock test asserting the four brand values. | None | Nothing references it yet |
| 2 | **tokens: alias look namespaces** | The 28 namespaces' identical values (`--x-page/-sheet/-ink/-muted/-line/-action`) become `var(--g-…)`. `--ops-*` likewise. Values identical. | None | Pure indirection |
| 3 | **base: page, ink, font** | `body`/`.shell-root` bg → `--g-bg-page`; `body` colour → `--g-text`; font → Source Sans 3; Tailwind `fontFamily.sans`. | Legacy pages go cream + Source Sans | 3 files |
| 4 | **tailwind: colours, radius, shadow → tokens** (§12) | Config only. | Legacy greys warm up, ink → navy | Config-only |
| 5 | **focus: one `:focus-visible` system** | Global ring; delete 41 ring-removing rules. | Keyboard focus visible | Additive + deletions |
| 6 | **type: utilities + scale** | `.g-display … .g-label`; `.ops-page-title` → H1 tokens; remove the 6 title sizes; map 9/10/11px → Caption; drop 650. | Title sizes unify | CSS-only |
| 7 | **button: rewrite base `.btn-*`** to §6.1 | Base classes become brand-correct (primary blue 44 r10, no scale, explicit disabled, loading). | Legacy navy primaries → blue | One block |
| 8 | **button: delete the 55 scoped overrides** | Pure deletion. | **None** (proves #7) | Deletion |
| 9 | **radius: controls 12 → 10** | Flip `--g-radius-md` usage in the aliased namespaces. | Slightly crisper controls | One token |
| 10 | **input + select** (§6.2, §6.3) | `.form-input*`, global input rule, `ManagedSelect` popover; remove 24px/12px chip inputs. | Inputs get 3:1 borders and a crisp focus edge | Component-scoped |
| 11 | **status pill + chips** (§6.4) | `StatusBadge`, `.ops-status*`, `.badge`, paper pills; status → tone map. | Pills tinted, 12px, sentence case | One component |
| 12 | **surfaces: cards, sheets, elevation** (§5, §6.5) | Replace 17 + 6 shadows with `--g-elev-*`; white → sheet; remove the navy "List" strip and navy empty stamp. | Warmer, quieter depth | Token swaps |
| 13 | **table + stacked rows** (§6.6) | `DataTable` gains `primary/amount/meta/status` + stacked layout; unify list-grid heads. | Tables align, phone lists unify | Component + per-page opt-in |
| 14 | **overlays** (§6.7) | `.overlay-panel*`, `Modal`, `AppDialog`, scrim, 44px close, drawer widths, grabber. | Sheets/drawers consistent | Component-scoped |
| 15 | **toast** (§6.8) | Navy toast, warning type, live region, pause on hover, timings. | Toast restyle | One file + CSS |
| 16 | **motion** (§8) | Motion classes, keyframes, reduced-motion net. | Calmer, consistent | CSS-only |
| 17 | **loading/empty/error** (§9) | `Skeletons`, `EmptyState`, `PageError`, banner. | States match brand | 3–4 components |
| 18 | **icons** (§7) | Global stroke rule, codemod sizes to 16/20/24, then a separate Lucide upgrade PR. | Icons consistent | Codemod is mechanical |
| 19 | **PDF: quote / invoice / PO** (§11) | `CommercialDocumentPdf.tsx`, `fonts.ts` (bundle + 600 + tnum family). | PDF matches paper | One template |
| 20+ | **legacy page sweeps** | 30 legacy pages in batches of 3–5 (start with the plumber walk: quotes → jobs → invoices → schedule, then settings, stock and the rest). Replace raw hex/Tailwind greys with tokens; move embedded TSX CSS into `index.css` sections. | Per page | Per batch |
| last | **cleanup + guardrails** | Remove Inter/Newsreader/JetBrains loads; delete dead CSS (`.auth-navy`, `.card-accent`, `text-shadow: none` resets); collapse aliased namespaces into direct token use; add eslint/stylelint rules; map other PDFs' `defaultPdfColors`. | None / perf | Deletions |

Sequencing notes: 1–2 are safe to merge the same day. 3–4 are the "whole app turns warm" moment; ship them together behind one LOOK review. 7→8 must be consecutive. 9 is isolated so the radius call can be reverted on its own.

---

## 14. Notes for the next phase
- Live screenshots go in `../screenshots/live/` named `{surface}-{state}-{laptop-1280|phone-390|phone-375}.png`. Use "phone", never the legacy filename suffix used in `docs/look`.
- Before/after mockups go in `../before/` and `../after/` with matching names.
- `../notes/` holds decisions and open questions (see `notes/open-questions.md`).


## 15. Phase 1c pointers (mockups, 19 Oct 2026)
Each item points to its mockup. Where an item needs a logic change, it is marked; those are proposals, not part of the style PRs.

- **Quote view and editor** (`after/quote-{390,1280}.png`, `after/quote-edit-{390,1280}.png`):
  - Line items are 2-line stacked rows on phone. GST is set per line (`gst_rate`).
  - "Add from price book" opens an inline picker with search, category chips and at most 3 results visible. Enter adds the top result (the hint shows on desktop only).
  - The editor has a sticky save bar: "Unsaved changes", then Cancel, Send, and **Save** (the one primary).
  - A quiet nudge, "No reply in 6 days · Chase quote", appears only on sent quotes. There's no "opened" tracking, because the app doesn't record it.
- **PDF kit** (`after/html/src/pdfkit.py`, `after/pdf/`):
  - The quote PDF reuses the invoice template, with a GST column.
  - Pagination follows D22. The non-GST variant follows D21.
  - Footer clearance is checked per page by `pdfshoot.js`.
- **Record payment** (`after/invoice-payment-{390,1280}.png`):
  - Uses the repo's labels.
  - It's a bottom sheet below 768px and a 520px dialog from 768px. On phone the body scrolls and Cancel / **Confirm payment received** stay pinned.
  - "Use balance ($X)" fills the amount.
  - The Balance after and Status after preview uses a status pill (the only green).
- **Job records and bill sheet** (`after/job-records-*.png`, `after/job-bill-sheet-*.png`, `after/states/job-*.png`):
  - Photo placeholders are neutral line art.
  - The bill sheet offers "Add logged hours as extra" and shows the exact extra amount.
- **Dashboard widgets and Customize** follow D23.
- **Schedule Day view** (`after/schedule-day-*.png`):
  - Desktop shows a 7 AM–5 PM hour track with one row per person. Blocks grow to fit their text. The now-line is navy and sits behind the blocks.
  - Phone shows per-person lanes with an occupancy bar and "Free 10:30–13:00" gaps.
  - Drag and the phone place flow follow D20.
- **Settings** (`after/settings-full-*.png`): D19 save bar. Team has the D15 crew-colour picker (six tints with "Used by …", plus Auto).
- **Clients** (`after/clients-*.png`, `after/client-*.png`):
  - Stacked rows on phone, an Overdue pill, and filter chips with counts.
  - The record leads with a money strip (Outstanding, Overdue, Open jobs, Billed in 2026).
  - Emails break after the @, never with an ellipsis.
- **Checks:** `shoot2.js` now also flags SPILL, meaning text sticking out of its card, sheet or panel even when nothing clips it. This is the bug the first Customize mockup had.

## 16. Schedule full-pane rule and time-axis geometry (D24, Phase 1d)
**Scope:** Schedule only. Lists, records, settings and documents keep the sheet (§4).

1. **Full-pane.**
   - `body.pane`: `main.page` has no max-width, margin or padding. The `.sheet` has no border, radius or shadow, with `flex: 1` so it fills to the bottom of the screen.
   - `.shell-in` goes full width.
   - The gutter is `--g-sheet-pad` (16, or 24 from 1024) and must never exceed 24px. Nothing sits in cream around the board.
2. **Week columns:** `var(--crew-col) repeat(5, 1fr) repeat(2, .55fr)`, where `--crew-col` is 148px, or 200px from 1440.
3. **Day axis:** `H0 = 6`, `H1 = 18`. The minimum hour width is `--hour-min: 88px`.
   - The board's inner width is `crew + 12 × hour-min + 2 × gutter`. When the pane is narrower, the board scrolls sideways (`[data-hscroll]`), the crew column is sticky, and a visible `.scroll-cue` is required.
   - Hour labels anchor on their line: centred, except 6 AM (left) and 6 PM (right).
   - The now label lives in a 28px now lane under the hours and never overlaps an hour label. The now line is 2px navy, behind the blocks.
4. **Blocks:** each track is a CSS grid of `(H1 − H0) × 12` equal columns. A block is `grid-column: slot(start) / slot(end)`, with no margins or insets, so its edges are its times. Blocks grow to fit their text and the row grows with them; nothing is absolutely positioned against a fixed height.
5. **Phone day:** the occupancy bar and tick labels use the same `[data-axis]` contract (6 AM, 9, 12 PM, 3, 6 PM).
6. **Long text:** names and titles wrap and are never truncated. In crew lists each person is one unit (`.who`), so a line break falls between people. Single long words may break as a last resort (`overflow-wrap: anywhere`).
7. **Checks (`after/html/src/shoot2.js`):**
   - **ALIGN:** every `[data-start]`/`[data-end]` child of a `[data-axis]` must have its left and right edges within ±1px of its time position, and must stay inside its row. Every `[data-h]` label must sit on its hour (by its anchor). The now line must sit on `data-now`. All axes in one view must share left and width. `[data-row]` cells must have equal heights.
   - **NOW LABEL:** the now label may not intersect any hour label.
   - **HSCROLL:** a sideways scroller must fit the viewport and, when it overflows, must show a visible `.scroll-cue`.
   - **OVERLAP:** no two app-bar items may intersect.

   Self-tests: a block nudged 4px, an hour label moved 1%, and the now label lifted onto the hours lane all fail. So does the old 1024 app bar.

8. **Status pill on day blocks (Phase 1e):** blocks of 1 h or longer end with the same `pill xs` as the week chips; blocks under 1 h have none. When a block is 120px or narrower (container query on `.dv-blk`), the pill drops its dot, uses 6px side padding and may wrap to two lines. Status labels come from the seed rules (`demo-seed.md` §6): Done, Ready to invoice, In progress, Scheduled.
