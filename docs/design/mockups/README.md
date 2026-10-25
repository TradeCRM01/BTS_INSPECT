# Direction 4: Grafter Dark + Light

One system, two themes. Black or white, one blue, the same product.

Dark is Mission Dark. Light is Monochrome Light with the ink active state. Everything except colour values is shared: the Geist type ramp, spacing, radii, motion, components, icons (Phosphor Regular, Fill when active) and the Mitre mark. A user picks System, Light or Dark in Settings > Appearance. System is the default.

- Board: `../board-4-dark-light.png` (every required frame paired dark | light, the fixed-light documents, the paired kit, and the "same system" strip in both themes)
- Pair sheets: `../compare-dark-vs-light-<screen>.png` for landing, landing-390, dashboard-1280, dashboard-390, schedule-1280, job-390, quote-390, invoice-view-390, settings-1280 (Appearance), appearance-390, clients-390, signin-390, nav-390, nav-1280
- Kit: `kit-4-dark-light.png` (light half | dark half, including native date, time, select and checkbox)
- Tokens: `tokens.css` (the only file with raw colours). Contrast data: `contrast.json`
- Build plan: `BUILD-PLAN.md` (A0 lives in `BUILD-PLAN-A0.md`, written by a separate stream). Brand assets: `handoff/brand/`

## Rationale
- **Jack liked both.** Mission Dark and Mono Light were the two favourites. They were already close: same grid, same type scale, one blue. Merging them costs one token layer, not two products.
- **Light is the working default outdoors.** A phone in full sun on site reads black on white best. Dark is valid indoors, at night and in the office, and holds body text at 7:1 or better too.
- **One primary action style for both.** The primary button is the inverse pair: black on light, white on dark. That unifies Mission's white CTA and Mono's black button. The accent blue (hue 225 in both themes) is used only for links, focus, selection and indicators, so it never competes with the primary.
- **One font family: Geist (OFL).** It carries the Mission heritage, has true tabular figures for money columns, a wide weight axis for the display sizes, and it is free to self-host. Dropping the second family removes a font request and a class of mismatch bugs.
- **Green only on pills.** Money is ink. The balance due is the biggest figure on every invoice surface (56px in the app and portal, the largest run on the PDF).

## Semantic tokens, both themes
Component CSS uses names only (`--surface`, `--ink`, `--action` and friends), which alias to these `--g-*` values. The stray check (computed colours must come from tokens.css) passes in both themes with 0 strays, and a static scan of every D4 page's component CSS finds 0 raw colours. Contrast is measured against the surface each token actually sits on; the full pair list follows in the next section.

| Token | Role | Light | Dark | Contrast (light / dark) |
|---|---|---|---|---|
| `--g-bg` | Page | `#F5F5F7` | `#0A0A0B` |  |
| `--g-surface` | Cards, sheets, inputs | `#FFFFFF` | `#121214` |  |
| `--g-surface-2` | Wells, segmented, hover rows | `#EBEBEE` | `#1C1C1F` |  |
| `--g-ink` | Body text, headings, figures | `#0A0A0B` | `#FAFAFA` | 18.18:1 / 18.96:1 on `bg` |
| `--g-ink-2` | Secondary text | `#3F3F46` | `#D4D4D8` | 9.59:1 / 13.39:1 on `bg` |
| `--g-ink-muted` | Labels, meta | `#4A4A52` | `#ADADB5` | 8.06:1 / 8.88:1 on `bg` |
| `--g-line` | Hairlines | `#E4E4E7` | `#27272A` |  |
| `--g-line-strong` | Strong dividers, chart grid | `#A1A1AA` | `#52525B` | 2.56:1 / 2.42:1 on `surface` |
| `--g-input-line` | Input borders (3:1) | `#808A93` | `#7A7A83` | 3.51:1 / 4.4:1 on `surface` |
| `--g-accent` | Links, focus, selection, indicators | `#183FB8` | `#8FABFF` | 7.9:1 / 8.89:1 on `bg` |
| `--g-accent-ink` | Text on accent | `#FFFFFF` | `#0A0A0B` | 8.6:1 / 8.89:1 on `accent` |
| `--g-accent-tint` | Selected row tint | `rgba(24,63,184,.05)` | `rgba(143,171,255,.07)` |  |
| `--g-inverse` | Primary button, active nav, active tab | `#0A0A0B` | `#FAFAFA` |  |
| `--g-inverse-ink` | Text on inverse | `#FFFFFF` | `#0A0A0B` | 19.79:1 / 18.96:1 on `inverse` |
| `--g-inverse-hover` | Primary hover | `#27272A` | `#E4E4E7` |  |
| `--g-inverse-press` | Primary pressed | `#3F3F46` | `#D4D4D8` |  |
| `--g-mk-bg` | Landing page | `#FFFFFF` | `#0A0A0B` |  |
| `--g-nav-bg` | Top nav glass | `rgba(255,255,255,.92)` | `rgba(10,10,11,.92)` |  |
| `--g-tab-bg` | Tab bar glass | `rgba(255,255,255,.94)` | `rgba(18,18,20,.94)` |  |
| `--g-glass-bar` | Sticky bars | `rgba(245,245,247,.92)` | `rgba(10,10,11,.92)` |  |
| `--g-glass` | Floating glass | `rgba(255,255,255,.86)` | `rgba(18,18,20,.72)` |  |
| `--g-glass-line` | Glass edge | `rgba(10,10,11,.08)` | `rgba(255,255,255,.12)` |  |
| `--g-press` | Press overlay | `rgba(10,10,11,.08)` | `rgba(255,255,255,.12)` |  |
| `--g-scrim` | Sheet scrim | `rgba(10,10,11,.42)` | `rgba(0,0,0,.6)` |  |
| `--g-skeleton` | Skeleton | `#E4E4E7` | `#27272A` |  |
| `--g-skeleton-hi` | Skeleton shimmer | `#F4F4F5` | `#1C1C1F` |  |
| `--g-toast-bg` | Toast | `#0A0A0B` | `#FAFAFA` |  |
| `--g-toast-ink` | Toast text | `#FFFFFF` | `#0A0A0B` | 19.79:1 / 18.96:1 on `toast-bg` |
| `--g-toast-action` | Toast action | `#8FABFF` | `#183FB8` | 8.89:1 / 8.24:1 on `toast-bg` |
| `--g-danger` | Destructive | `#9F1C14` | `#F48A83` | 7.92:1 / 7.85:1 on `surface` |
| `--g-danger-ink` | Text on danger | `#FFFFFF` | `#0A0A0B` | 7.92:1 / 8.3:1 on `danger` |
| `--g-danger-hover` | Danger hover | `#8A170F` | `#F6A39D` |  |
| `--g-danger-press` | Danger pressed | `#74130C` | `#F8B9B4` |  |
| `--g-disabled-bg` | Disabled fill | `#ECECEE` | `#1C1C1F` |  |
| `--g-disabled-ink` | Disabled text | `#71717A` | `#71717A` | 4.1:1 / 3.52:1 on `disabled-bg` |
| `--g-ok` | Pill text: ok | `#0E5A2C` | `#7DD3A0` | 7.2:1 / 8.56:1 on `ok-bg` |
| `--g-ok-bg` | Pill fill: ok | `#E3F2E8` | `#0F2A1A` |  |
| `--g-ok-dot` | Pill dot: ok | `#16703A` | `#3FB871` | 5.31:1 / 6.08:1 on `ok-bg` |
| `--g-warn` | Pill text: warn | `#7A2E03` | `#FDBA8C` | 8.15:1 / 10.19:1 on `warn-bg` |
| `--g-warn-bg` | Pill fill: warn | `#FCEBDF` | `#2E1607` |  |
| `--g-warn-dot` | Pill dot: warn | `#A4410A` | `#F08A4B` | 5.42:1 / 6.84:1 on `warn-bg` |
| `--g-bad` | Pill text: bad | `#8A170F` | `#FCA5A0` | 8.1:1 / 9.3:1 on `bad-bg` |
| `--g-bad-bg` | Pill fill: bad | `#FBE9E7` | `#2D0F0D` |  |
| `--g-bad-dot` | Pill dot: bad | `#9F1C14` | `#F0645A` | 6.76:1 / 5.63:1 on `bad-bg` |
| `--g-sent` | Pill text: sent | `#1E3A8A` | `#A9C1FF` | 8.81:1 / 8.96:1 on `sent-bg` |
| `--g-sent-bg` | Pill fill: sent | `#E6EDFB` | `#132042` |  |
| `--g-sent-dot` | Pill dot: sent | `#2F5BD3` | `#6F95FF` | 5.02:1 / 5.65:1 on `sent-bg` |
| `--g-sched` | Pill text: sched | `#4C1D95` | `#C9B8FF` | 9.3:1 / 9.16:1 on `sched-bg` |
| `--g-sched-bg` | Pill fill: sched | `#EFEAFB` | `#231A3D` |  |
| `--g-sched-dot` | Pill dot: sched | `#6D4BD8` | `#9B82F0` | 4.89:1 / 5.32:1 on `sched-bg` |
| `--g-draft` | Pill text: draft | `#3F3F46` | `#D4D4D8` | 8.93:1 / 10.6:1 on `draft-bg` |
| `--g-draft-bg` | Pill fill: draft | `#EDEDEF` | `#232326` |  |
| `--g-draft-dot` | Pill dot: draft | `#71717A` | `#A1A1AA` | 4.13:1 / 6.12:1 on `draft-bg` |
| `--g-live` | Pill text: live | `#FFFFFF` | `#0A0A0B` | 19.79:1 / 18.96:1 on `live-bg` |
| `--g-live-bg` | Pill fill: live | `#0A0A0B` | `#FAFAFA` |  |
| `--g-live-dot` | Pill dot: live | `#8FABFF` | `#183FB8` | 8.89:1 / 8.24:1 on `live-bg` |
| `--g-chart-1` | Chart series 1 | `#0A0A0B` | `#FAFAFA` | 19.79:1 / 17.93:1 on `surface` |
| `--g-chart-2` | Chart series 2 | `#A1A1AA` | `#52525B` | 2.56:1 / 2.42:1 on `surface` |
| `--g-crew-harbour` | Crew colour: harbour (schedule only) | `#5D86AE` | `#8FB3D6` | 3.83:1 / 8.54:1 on `surface` |
| `--g-crew-clay` | Crew colour: clay (schedule only) | `#B0705A` | `#D49A84` | 3.95:1 / 7.8:1 on `surface` |
| `--g-crew-ochre` | Crew colour: ochre (schedule only) | `#977832` | `#C9A85C` | 4.16:1 / 8.23:1 on `surface` |
| `--g-crew-dusk` | Crew colour: dusk (schedule only) | `#7F79B0` | `#ABA6D9` | 3.99:1 / 8.19:1 on `surface` |
| `--g-crew-slate` | Crew colour: slate (schedule only) | `#717B8A` | `#A3ACB9` | 4.28:1 / 8.16:1 on `surface` |
| `--g-sh-1` | Elevation 1 | `0 1px 2px rgba(10,10,11,.06)` | `0 1px 2px rgba(0,0,0,.4)` |  |
| `--g-sh-2` | Elevation 2 | `0 12px 32px -8px rgba(10,10,11,.18), 0 2px 6px rgba(10,10,11,.06)` | `0 12px 32px -8px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.06)` |  |


## Contrast, every token pair, both themes
Method: WCAG 2.x relative luminance. Translucent tokens are composited over the surface they sit on (nav-bg over bg, tab-bg over surface, glass over bg). Targets: body text and labels 7:1; pills 4.5:1 minimum per Coach, 7:1 achieved; non-text UI 3:1 (WCAG 1.4.11). Result: 0 fails. Lowest text pair 7.23:1, lowest pill 7.2:1.

| Foreground | Background | Kind | Target | Light | Dark |
|---|---|---|---|---|---|
| `--g-ink` | `--g-bg` | text | 7:1 | 18.18:1 | 18.96:1 |
| `--g-ink` | `--g-surface` | text | 7:1 | 19.79:1 | 17.93:1 |
| `--g-ink` | `--g-surface-2` | text | 7:1 | 16.63:1 | 16.29:1 |
| `--g-ink-2` | `--g-bg` | text | 7:1 | 9.59:1 | 13.39:1 |
| `--g-ink-2` | `--g-surface` | text | 7:1 | 10.44:1 | 12.66:1 |
| `--g-ink-2` | `--g-surface-2` | text | 7:1 | 8.78:1 | 11.5:1 |
| `--g-ink-muted` | `--g-bg` | text | 7:1 | 8.06:1 | 8.88:1 |
| `--g-ink-muted` | `--g-surface` | text | 7:1 | 8.78:1 | 8.39:1 |
| `--g-ink-muted` | `--g-surface-2` | text | 7:1 | 7.38:1 | 7.63:1 |
| `--g-accent` | `--g-bg` | text | 7:1 | 7.9:1 | 8.89:1 |
| `--g-accent` | `--g-surface` | text | 7:1 | 8.6:1 | 8.41:1 |
| `--g-accent` | `--g-surface-2` | text | 7:1 | 7.23:1 | 7.64:1 |
| `--g-accent-ink` | `--g-accent` | text | 7:1 | 8.6:1 | 8.89:1 |
| `--g-inverse-ink` | `--g-inverse` | text | 7:1 | 19.79:1 | 18.96:1 |
| `--g-inverse-ink` | `--g-inverse-hover` | text | 7:1 | 14.89:1 | 15.6:1 |
| `--g-inverse-ink` | `--g-inverse-press` | text | 4.5:1 | 10.44:1 | 13.39:1 |
| `--g-toast-ink` | `--g-toast-bg` | text | 7:1 | 19.79:1 | 18.96:1 |
| `--g-toast-action` | `--g-toast-bg` | text | 7:1 | 8.89:1 | 8.24:1 |
| `--g-danger-ink` | `--g-danger` | text | 7:1 | 7.92:1 | 8.3:1 |
| `--g-danger-ink` | `--g-danger-hover` | text | 7:1 | 9.5:1 | 10.03:1 |
| `--g-danger-ink` | `--g-danger-press` | text | 7:1 | 11.41:1 | 11.86:1 |
| `--g-danger` | `--g-surface` | text | 7:1 | 7.92:1 | 7.85:1 |
| `--g-danger` | `--g-bg` | text | 7:1 | 7.28:1 | 8.3:1 |
| `--g-ink` | `--g-nav-bg` | text | 7:1 | 19.62:1 | 18.96:1 |
| `--g-ink-muted` | `--g-nav-bg` | text | 7:1 | 8.7:1 | 8.88:1 |
| `--g-ink` | `--g-tab-bg` | text | 7:1 | 19.79:1 | 17.93:1 |
| `--g-ink-muted` | `--g-tab-bg` | text | 7:1 | 8.78:1 | 8.39:1 |
| `--g-ink` | `--g-glass` | text | 7:1 | 19.62:1 | 18.22:1 |
| `--g-ok` | `--g-ok-bg` | pill | 4.5:1 | 7.2:1 | 8.56:1 |
| `--g-warn` | `--g-warn-bg` | pill | 4.5:1 | 8.15:1 | 10.19:1 |
| `--g-bad` | `--g-bad-bg` | pill | 4.5:1 | 8.1:1 | 9.3:1 |
| `--g-sent` | `--g-sent-bg` | pill | 4.5:1 | 8.81:1 | 8.96:1 |
| `--g-sched` | `--g-sched-bg` | pill | 4.5:1 | 9.3:1 | 9.16:1 |
| `--g-draft` | `--g-draft-bg` | pill | 4.5:1 | 8.93:1 | 10.6:1 |
| `--g-live` | `--g-live-bg` | pill | 4.5:1 | 19.79:1 | 18.96:1 |
| `--g-ok-dot` | `--g-ok-bg` | ui | 3:1 | 5.31:1 | 6.08:1 |
| `--g-warn-dot` | `--g-warn-bg` | ui | 3:1 | 5.42:1 | 6.84:1 |
| `--g-bad-dot` | `--g-bad-bg` | ui | 3:1 | 6.76:1 | 5.63:1 |
| `--g-sent-dot` | `--g-sent-bg` | ui | 3:1 | 5.02:1 | 5.65:1 |
| `--g-sched-dot` | `--g-sched-bg` | ui | 3:1 | 4.89:1 | 5.32:1 |
| `--g-draft-dot` | `--g-draft-bg` | ui | 3:1 | 4.13:1 | 6.12:1 |
| `--g-live-dot` | `--g-live-bg` | ui | 3:1 | 8.89:1 | 8.24:1 |
| `--g-input-line` | `--g-surface` | ui | 3:1 | 3.51:1 | 4.4:1 |
| `--g-input-line` | `--g-bg` | ui | 3:1 | 3.23:1 | 4.65:1 |
| `--g-line-strong` | `--g-surface` | ui | 2.0:1 | 2.56:1 | 2.42:1 |
| `--g-accent` | `--g-surface` | ui | 3:1 | 8.6:1 | 8.41:1 |
| `--g-chart-1` | `--g-surface` | ui | 3:1 | 19.79:1 | 17.93:1 |
| `--g-chart-2` | `--g-surface` | ui | 2.0:1 | 2.56:1 | 2.42:1 |
| `--g-crew-harbour` | `--g-surface` | ui | 3:1 | 3.83:1 | 8.54:1 |
| `--g-crew-clay` | `--g-surface` | ui | 3:1 | 3.95:1 | 7.8:1 |
| `--g-crew-ochre` | `--g-surface` | ui | 3:1 | 4.16:1 | 8.23:1 |
| `--g-crew-dusk` | `--g-surface` | ui | 3:1 | 3.99:1 | 8.19:1 |
| `--g-crew-slate` | `--g-surface` | ui | 3:1 | 4.28:1 | 8.16:1 |
| `--g-disabled-ink` | `--g-disabled-bg` | disabled | exempt | 4.1:1 | 3.52:1 |


Notes:
- `--g-line-strong` and `--g-chart-2` sit at about 2.5:1. They are dividers and the secondary chart series, never the only carrier of meaning: every bar has a value label and the legend names the series.
- `--g-disabled-ink` is exempt under WCAG 1.4.3. It still reads at 3.5:1 or better.
- The light accent was darkened from `#1A44C2` to `#183FB8` in this pass so links on `--g-surface-2` reach 7.23:1 (they were 6.66:1).

## Theme choice and persistence
- **Key:** `grafter-theme`. **Values:** `system | light | dark`. Default `system`.
- **Resolution order:** stored choice, then `prefers-color-scheme`, then light.
- **Persistence:** `localStorage` for first paint, and the user profile (`profiles.theme_preference`) so the choice follows the user to a new device. On sign-in the profile value wins and is written back to `localStorage`.
- **Live system changes:** a `matchMedia('(prefers-color-scheme: dark)')` listener re-resolves only while the choice is `system`.

No-flash inline head script, placed straight after `<meta charset>` and before any stylesheet (as used in every frame here; the production version is `handoff/theme-init.js`, owned by the A0 stream):

```html
<script>/* theme-init: runs before first paint. Choice: localStorage then prefers-color-scheme then light. */(function(){var d=document.documentElement;if(d.hasAttribute('data-theme-fixed')||d.hasAttribute('data-theme-proof'))return;var K='grafter-theme',m=window.matchMedia('(prefers-color-scheme: dark)');function pick(){var c='system';try{c=localStorage.getItem(K)||'system'}catch(e){}return c==='dark'||c==='light'?c:(m.matches?'dark':'light')}d.setAttribute('data-theme',pick());m.addEventListener('change',function(){var c='system';try{c=localStorage.getItem(K)||'system'}catch(e){}if(c==='system')d.setAttribute('data-theme',pick())})})();</script>
```

`data-theme-fixed` (documents, portal, email) and `data-theme-proof` (these mockups) opt a page out.

## Theme switch
- Instant by default. When the user changes Appearance, the app adds `html.theme-switching` for one frame pair, which crossfades `background-color`, `color`, `border-color` and `fill` over `--dur-theme` (150ms, `--ease-standard`). Nothing else animates; layout never moves.
- Under `prefers-reduced-motion: reduce`, `--dur-theme` is 0ms.
- First load never flashes, because the head script sets `data-theme` before first paint.

## Settings > Appearance
Frames: `appearance-1280-{dark,light}.png`, `appearance-390-{dark,light}.png`. Three radio cards (System, Light, Dark) with live previews of a job card in each theme, and the note: "Working outside? Light is easiest to read in direct sun. Dark is fully supported too: every screen keeps body text at 7:1 or better in both themes. Quotes, invoices, emails and the client portal always print on white." Where it lives in the app: the per-user profile settings page, not company settings, because the choice belongs to the person, not the business.

## Fixed light: PDFs, emails, client portal
Clients see paper. These never follow the user's theme and set `data-theme="light" data-theme-fixed`:
- `invoice-pdf.png` / `.pdf` (A4)
- `portal-invoice-390.png` (client portal invoice view on white, balance due 56px, pay and download actions)
- `email-640.png` (invoice email, 600px body inside a 640 frame)

## Native controls
`color-scheme: light` on the light theme and `color-scheme: dark` on the dark theme, so date and time pickers, selects, checkboxes, scrollbars and autofill follow the theme. They appear in both halves of the kit.

## Landing
The dark hero is the default (`landing-1440-dark.png`, `landing-390-dark.png`) with a sun or moon toggle in the nav. The light variant (`landing-*-light.png`) changes the hero only: a light photo variant swapped in by CSS (`d2-hero-wide.jpg`, `d2-fittings.jpg`), ink type, white page. Below the hero the page is the same in both. Marketing pages follow the same `grafter-theme` key.

## Mitre logo
White on dark, ink on light. `handoff/brand/mark-mono-dark.svg` is the white mark for dark backgrounds; `mark-mono-light.svg` is the ink mark for light backgrounds. The favicon switches itself with an embedded `prefers-color-scheme` rule. The app icon is a white mark on an ink tile and does not change with the theme.

## Rollout note
- **A0 `[data-theme]` layer.** A separate stream owns A0 (`BUILD-PLAN-A0.md`, `handoff/tokens.css`, `handoff/theme-init.js`). Per Coach, A0's light map equals today's live cream and navy values, so A0 lands with zero visual change, proven by pixel-diff at 375, 390, 1024 and 1280. The dark map ships in the same layer but is not reachable until the shell PR and Appearance setting land. The visual switch to the new light values happens in the shell PR, so the handoff carries two light maps (live and new).
- **Extra PRs over D1 or D2 alone:** A0 as a themed layer instead of a flat token file, the Appearance setting with profile persistence (one small migration), and a final PR that lets `system` resolve to dark once every page is migrated. Plus an allowance for dark-only fix-ups found during page batches. `BUILD-PLAN.md` counts them.
- **Not a token swap:**
  - Images: every hero and editorial photo needs a light and a dark crop or grade (here: `d2-hero-wide.jpg` and `d2-fittings.jpg` for light).
  - Charts: series colours are per-theme tokens, but chart libraries often take colours as props, so each chart needs a token read at render time.
  - Logo marks: the white and ink Mitre marks are separate SVG files; outlined lockups (with the wordmark as paths) are only for email and PDF, where live text isn't possible.
  - Email and PDF assets are fixed light and never consume the theme layer.
  - Company `report_theme` colours: today they tint the app header. In the new system they should only tint documents. That is a product decision, listed as open in `BUILD-PLAN.md`.
- **QA cost:** from A0 on, every frame is captured at 375, 390, 1024 and 1280 in both themes: 8 captures per frame per state, 16 with before and after. `BUILD-PLAN.md` prices it per PR.

## Frames (both themes unless marked)
| Frame | Files |
|---|---|
| Landing 1440 and 390 | `landing-1440-{dark,light}.png`, `landing-390-{dark,light}.png` |
| Dashboard 1280 and 390 | `dashboard-1280-*.png`, `dashboard-390-*.png` |
| Job 390 | `job-390-*.png` |
| Schedule 1280 | `schedule-1280-*.png` |
| Clients 390 | `clients-390-*.png` |
| Quote 390 | `quote-390-*.png` |
| Settings 1280 | `settings-1280-*.png` |
| Settings > Appearance 1280 and 390 | `appearance-1280-*.png`, `appearance-390-*.png` |
| Sign in 390 | `signin-390-*.png` |
| Invoice view in the app 390 | `invoice-view-390-*.png` |
| Nav: tab bar and More sheet 390, top nav 768 / 1024 / 1280 / 1920 with the 53-character company name | `../nav/4-dark-light/*.png` |
| Fixed light: invoice PDF, portal invoice 390, email 640 | `invoice-pdf.png`, `portal-invoice-390.png`, `email-640.png` |
| Kit, paired | `kit-4-dark-light.png` |

Viewport captures: 46 `*-vp-NN.png` files (each phone and desktop app frame cut into real screens), each checked for header, logo and tab bar inside the viewport and the logo not covered.

## Check results (last run, 19 Oct 2026)
42 of 42 renders PASS: no overflow, ellipsis, spill or clip; text contrast 7:1 or better on every rendered text node (lowest 7.2:1); taps 44px or more; no nav overlap; consistency (0 stray font sizes, radii or colours in either theme); 0 dead-space boxes at 390; 0 green outside pills; favicon resolves; viewport header and logo checks pass. Contrast pairs: 54 of 54 meet target.

## Self-critique
- **Two themes double the QA.** Every frame is 8 captures. This is the real cost of the direction, and it lasts for the life of the product, not just the migration.
- **Dark photography is the weak link.** The light hero relies on a separate image grade. Every future editorial image needs two versions or it will look pasted in on one theme.
- **The accent is quiet in Light.** With the primary as black, blue appears only in links and focus. Some users may miss a "brand colour". That restraint is deliberate, but it should be watched in testing.
- **Crew colours are weaker in Light (3.8 to 4.3:1 on white).** They pass 3:1 for non-text and always pair with a name, but they are the least robust colours in the system.
- **Glass bars depend on what is underneath.** Contrast is computed over the page colour; a photo scrolled under the nav could lower it. The real build should keep glass over app pages only, never over imagery.
- **The company `report_theme` tint has no clear home in dark.** A navy header was a company's colour; in Dark there is no good place for it. We recommend documents only.
