# The Interface Craft Manual
### A graduate-level reference on UI design engineering, written as a working spec for Grafter

**Audience:** an AI build agent (the "UI bot") and the human directing it.
**Domain:** dense, professional, trade/field-service CRM software — not a marketing site.
**Product:** Grafter.
**How to use this document:** Parts I–VII are theory and doctrine. Part VIII is the machine-readable token spec. Part IX is the review rubric. When the bot must choose, `grafter-overlay.md` wins, then Part VIII, then prose elsewhere.

---

# Part I — What "polished" actually is

Most people describe good interfaces with adjectives: clean, modern, futuristic, premium. Those are *perceptual outcomes*, not causes. Underneath every interface that reads as expensive there are four measurable properties. Nothing else in this document matters if these four are wrong.

### 1. Optical consistency (not mathematical consistency)

Amateur interfaces are mathematically consistent — every gap is 16px because the system said 16px. Professional interfaces are *optically* consistent: gaps are adjusted until they **look** equal, which is not the same thing.

The eye measures the *perceived void* between shapes, not the distance between bounding boxes. Consequences:

- A capital letter's bounding box includes leading. A 16px gap below a heading looks smaller than a 16px gap below a button, because the heading's descender space already contributed whitespace. Modern CSS fixes this properly with `text-box: trim-both cap alphabetic`, which removes the half-leading so your spacing tokens finally mean what they say.
- Circular and rounded shapes need ~5–8% more padding than rectangles to look equally inset.
- Optical centering: a "play" triangle, a chevron, or a right-pointing arrow must be nudged toward its visual centre of mass, not its geometric one.
- Icon and text baselines don't align by default. Icons align to the *cap-height box*, not the line box.

**The tell:** an interface where every gap is technically from the scale but the page still feels lumpy has skipped optical correction.

### 2. Contrast discipline

The dominant failure in amateur UI is *too many competing contrasts*. Every element shouting means nothing is heard. The rule that governs modern-looking interfaces:

> **Contrast is a budget, not a resource.** You get roughly three strong contrast events per screen region. Spend them on the primary action, the primary data, and the current location. Everything else is graded down.

Practically, an enterprise screen should decompose into roughly:
- ~70% quiet surface and body text
- ~20% structural differentiation (borders, subtle fills, secondary text)
- ~10% or less high-contrast emphasis (primary CTA, active nav, status critical)

Interfaces that look "futuristic" almost always have a **very low average contrast with a few very high spikes**. Interfaces that look cheap have uniformly medium contrast everywhere.

### 3. Edge quality

At the pixel level, the difference between free-template UI and Linear/Vercel/Stripe-grade UI is almost entirely how edges are made:

- **Hairlines, not borders.** A 1px border at full opacity is a heavy black line at 2x DPR. Professional borders are 1px at 6–12% opacity of the foreground colour, or `color-mix(in oklch, var(--fg) 8%, transparent)`.
- **Borders should be part of the elevation story**, not independent of it. A raised card gets a *lighter top edge and darker bottom edge* — this is the single cheapest way to make a flat surface read as physical.
- **Concentric radii.** When one rounded box sits inside another, the inner radius must equal the outer radius minus the gap between them: `r_inner = r_outer − padding`. Getting this wrong is the most common reason a card "looks slightly off" without anyone knowing why.
- **Shadows must be tinted, never grey.** Real shadows take the hue of the surface and the ambient light. A neutral `rgba(0,0,0,0.1)` on a warm or blue-tinted surface reads as dirt. Shadows should be the darkest colour in your palette at low alpha, usually the same hue as your background at very low lightness. On Grafter that tint is navy/ink, not grey.

### 4. Motion honesty

Motion in a polished interface exists to explain *causality and continuity* — where this thing came from, what it turned into. Motion that exists to be noticed is decoration and dates fast.

Rules:
- Duration scales with distance and size. A toggle: 80–120ms. A dropdown: 150–200ms. A full-panel transition: 250–350ms. Never more than 400ms for anything a user triggers repeatedly.
- **Asymmetric easing.** Enters use a decelerating curve (`cubic-bezier(0.16, 1, 0.3, 1)` — fast start, soft landing). Exits use accelerating or linear, and are ~30% faster than the enter. Things should leave faster than they arrive.
- Never animate `width`, `height`, `top`, `left`, or `margin`. Animate `transform`, `opacity`, `filter`, `clip-path`. For layout changes, use FLIP or the View Transitions API.
- Spring physics beat duration curves for anything the user drags or that must feel physical. Duration curves beat springs for anything informational.
- `@media (prefers-reduced-motion: reduce)` is not optional and it does not mean "delete all motion" — it means replace movement with opacity fades.

---

# Part II — Colour, at the level it's actually practised now

## 2.1 Why hex and HSL are obsolete for systems work

sRGB hex values and HSL are *device* spaces, not *perceptual* spaces. In HSL, `hsl(60 100% 50%)` (yellow) and `hsl(240 100% 50%)` (blue) claim the same lightness. They are not remotely the same lightness — the yellow is roughly three times brighter perceptually. This is why palettes generated by rotating HSL hue look amateurish: the greys go muddy, the yellows blow out, the blues go dead.

The current professional standard is **OKLCH** (`oklch(L C H)`):
- **L** = perceptual lightness, 0–1, and it is honest. `oklch(0.6 ...)` is the same apparent brightness at every hue.
- **C** = chroma (saturation), unbounded but practically 0–0.37.
- **H** = hue angle, 0–360.

Everything downstream gets easier:
- Generating a tonal ramp = holding H and C, stepping L linearly.
- Guaranteeing contrast = a fixed ΔL between text and surface.
- Dark mode = often just inverting the L axis while *reducing* C by 10–20% (saturated colour on dark backgrounds glows and vibrates).
- Wide-gamut (P3) displays are addressable — you can specify colours literally impossible in sRGB, with automatic fallback via `@supports`.

**Doctrine: author new colour work in OKLCH. Ship hex that matches the existing Grafter `report_theme` / `--ops-*` tokens. Do not invent a parallel palette.**

## 2.2 The anatomy of a professional palette

A serious product palette is not "a primary and an accent." It is five distinct systems:

**1. The neutral ramp (the most important thing on this page).**
12–14 steps from surface to strongest text. This carries 90% of your interface. The single biggest upgrade you can make to a "generic-looking" product is to stop using pure grey.

Pure grey (`C = 0`) is the default of every framework, and it reads as *absence of decision*. Give your neutrals a **chroma of 0.004–0.012** at a chosen hue and the whole interface acquires a temperature that reads as intentional:
- Hue ~250–265 (cool blue-grey): technical, precise, software-ish.
- Hue ~40–70 (warm stone): human, tactile, calm. Grafter's `--ops-cream` sits here.
- Hue ~150–160 (cool green-grey): clinical, instrument-like, rarer and therefore distinctive.

A useful advanced move: **let chroma rise slightly at the dark end of the ramp**. Deep neutrals with `C ≈ 0.015` at the brand hue make dark surfaces feel like tinted glass rather than black plastic.

**2. The brand/accent ramp.** 9–11 steps of the primary hue. In dense software this colour appears on maybe 3% of pixels — it is a *pointer*, not a paint. If your brand colour covers large areas, you have a marketing site, not a tool. Grafter's pointer is `accent` (`#2E75B6` when blank), not a second blue.

**3. Semantic status colours.** Success / warning / danger / info. These are *not* free choices — they are a learned language and breaking it costs comprehension. Grafter already ships pass `#1B7F3A`, warning `#B54708`, fail `#B42318`. Bring any new status into that L/C neighbourhood. Do not recast Complete Inspection away from pass green.

**4. Data/categorical colours.** For charts, tags, job types, technician assignment. These must be *equiluminant* (same L) so no category looks more important, and must survive the ~8% of male users with red-green deficiency. Rotate hue at constant L and C, then verify under a deuteranopia simulation. 6–8 hues maximum; beyond that use pattern or position, not colour.

**5. Alpha overlays.** Scrims, hover states, pressed states, selection. These should be defined as *alpha values on the foreground colour*, not as opaque greys, so they compose correctly over any surface. `color-mix(in oklch, var(--fg) 4%, transparent)` for hover; 8% for pressed.

## 2.3 Palettes that read as modern and near-futuristic

The tonal directions currently reading as advanced, with honest trade-offs:

**A. Instrument dark ("mission control")**
Near-black tinted blue-violet base, surfaces stepping up by ~0.03 L per elevation level, one high-chroma accent used only for live/active state. Text never pure white.
Cost: common. Grafter's default is **not** this — field use is daylight.

**B. Cold porcelain (high-key light)**
Almost no borders — separation by shadow and space. Unforgiving. Every alignment error is visible.

**C. Warm technical (Grafter's direction)**
Stone-tinted light neutrals with a genuinely cold accent (navy/blue). The temperature clash between warm cream and cold navy is what creates the sense of precision. Warmth keeps it human for tradespeople; the cold accent and mono data keep it reading as an instrument. This is a deliberate rejection of dark-mode-with-acid-accent, which is wrong for a product read in bright daylight on a job site.

**D. Monochrome + single signal**
Entire interface from one neutral ramp, one saturated colour for *needs action*. Requires excellent type.

**E. Tinted-glass / material depth**
`backdrop-filter` on floating layers. Restrict to *transient* layers: command palette, toolbars, sheet headers. Never over tables or compliance documents.

## 2.4 Techniques that separate the top tier

- **Gradient meshes over flat fills, at very low amplitude.** A "flat" surface that actually varies by 0.01–0.02 in L across its width reads as lit rather than printed.
- **Noise.** A 2–4% opacity fractal-noise overlay kills gradient banding. Use sparingly; not on dense data.
- **Chromatic shadows.** Shadow hue = navy/accent at very low L and low alpha.
- **Layered shadows.** One shadow is a tell. Real depth is 3–4 stacked shadows with increasing blur and decreasing alpha.
- **Inner highlight.** `inset 0 1px 0` at the top of a raised light surface. One line of CSS, large perceived-quality return.
- **`light-dark()`** — a single token can carry both theme values when dark is actually shipped.
- **Relative colour syntax** — `oklch(from var(--brand) calc(l - 0.1) c h)` generates hover/pressed/disabled from one source.

Do not apply glass, noise, or mesh as decoration on a LOOK slice. Hairlines, concentric radii, tinted shadow, inner lip, and contrast budget come first.

---

# Part III — Typography as a system

## 3.1 Face selection for dense software

The requirements for a product UI face are narrow and mostly non-aesthetic:
- Tall x-height (legible at 12–14px)
- Unambiguous `1 / l / I` and `0 / O`
- Real tabular figures (`tnum`) for tables and currency
- At least 5 weights with a genuine 500
- Variable format when available

**Shipped on Grafter:** **Inter** (UI) and **JetBrains Mono** (data). Do not swap Inter for Manrope unless Jack asks for a fonts PR.

**The differentiator is not the body face — it is the pairing.** A dense CRM gains identity from numeric and label treatment. Job numbers, report numbers, board IDs, circuit references, and dollar amounts are the actual content. Setting those in mono tells the user *this string is a machine identifier you can copy and match*.

## 3.2 The scale

Do not use a pure geometric ratio in application UI. A 1.25 modular scale is too coarse in the 13–17 range where 90% of UI text lives. Use a **hand-tuned scale that is dense in the middle and geometric at the top**:

```
11  micro / table meta / uppercase eyebrow
12  caption, helper text, timestamps
13  secondary body, table cells (dense mode)
14  DEFAULT body and UI text
16  emphasised body, card titles
18  section headings
22  page title
28  display / empty-state headline
36  metric hero numbers
```

## 3.3 The rules that actually carry the polish

- **Weight, not size, for hierarchy.** Within a card, the title and body should often be the same size, differentiated by weight (600 vs 400) and colour. Size jumps are between *regions*, not within them.
- **Line-height is a function of size and measure.** Small text needs *more* relative leading. Practical: 11–13px → 1.45; 14–16px → 1.5; 18–22px → 1.35; 28px+ → 1.15. Headlines at 1.5 is the giveaway of an untuned interface.
- **Optical sizing and tracking.** Tighten tracking as size increases: `-0.011em` at 22px, `-0.02em` at 28px, `-0.03em` at 36px+. Loosen it for small caps/uppercase labels: `+0.06em` at 11px.
- **`font-variant-numeric: tabular-nums` on every column of numbers, always.**
- **Measure.** 60–75 characters for reading text; 40–50 for narrow side panels. Enforce with `max-width: 65ch` on prose, not on data tables.
- **Two type sizes maximum in any single component.** If a card needs three, the card is doing two jobs.
- **`text-wrap: balance`** on headings (≤4 lines) and **`text-wrap: pretty`** on body copy.

---

# Part IV — Hierarchy: the full stack

"Hierarchy" is usually taught as size and weight. In real systems it operates on **nine independent channels**, and mastery is knowing which channel to spend and which to leave flat.

**Level 0 — Spatial grouping (proximity).**
The strongest and cheapest signal. Elements 8px apart are one thing; 32px apart are two things. Before adjusting any colour or size, fix the gaps. If grouping and styling disagree, grouping wins.

**Level 1 — Position and reading order.**
Z-pattern for sparse layouts, F-pattern for dense/scanning layouts. In Grafter the user is scanning, so the leftmost 30% of every row and the top-left of every card are the premium real estate. Put identity there (job number, client, address) — never put it in the middle.

**Level 2 — Size.**
Coarse. Reserve for cross-region distinction.

**Level 3 — Weight.**
Fine-grained and underused. A 400→600 shift at constant size is the most elegant emphasis available.

**Level 4 — Colour value (lightness).**
The workhorse. Define exactly four text roles and never freelance:
- `fg-primary` — the content itself. ~15:1 contrast.
- `fg-secondary` — supporting info. ~7:1.
- `fg-tertiary` — metadata, labels, timestamps. ~4.6:1.
- `fg-quaternary` — placeholders, disabled. ~3:1 (never used for information the user needs).

**Level 5 — Surface elevation.**
Depth = importance and transience. A defined elevation ladder (base → raised → overlay → popover → modal → toast). **Elevation is semantic, not decorative.** A card is raised because it is a discrete manipulable object.

**Level 6 — Chroma.**
Saturation attracts the eye pre-attentively. Colour used for hierarchy must be *rare*. If three things on screen are blue, blue means nothing.

**Level 7 — Motion and state.**
Movement dominates all static hierarchy. Use with extreme restraint.

**Level 8 — Density and enclosure.**
A bordered, padded container reads as a discrete unit; the same content unenclosed reads as flow. Tightly packed content reads as reference data; generously spaced content reads as primary.

> **The Hierarchy Budget Rule.** For any element, spend *at most two* channels. Bigger + bolder + darker + boxed + coloured is how amateur UI screams. Bigger + quieter neighbours is how professional UI speaks.

---

# Part V — Space, grid, and density

## 5.1 The spatial system

Base unit of **4px**, with the 8px multiples as primary and 4px steps available for optical correction:

```
2  4  6  8  12  16  20  24  32  40  48  64  80  96
```

Anything outside this is a bug. **The scale should be applied semantically, not arbitrarily**. Name spaces by relationship, not by size:

- `space-inline-tight` (4) — icon to its label
- `space-inline` (8) — between related controls
- `space-stack-tight` (8) — label to input
- `space-stack` (16) — between fields in a group
- `space-group` (24) — between field groups
- `space-section` (40) — between page sections
- `space-region` (64) — between major page regions

Now the bot can never ask "should this be 16 or 24?" — it asks "what is the relationship?"

## 5.2 Density modes

Grafter is used in two postures: an office coordinator on a 27" monitor scanning 200 jobs, and an electrician on a phone in a switchroom with gloves on. One density cannot serve both.

Three modes as a token overlay, switched by `data-density` on the root, are the *target*. Do not ship the toggle until Jack asks. Until then, field surfaces already use 44px controls; keep that.

| | Compact | Default | Comfortable/Touch |
|---|---|---|---|
| Row height | 32px | 40px | 56px |
| Body size | 13px | 14px | 15px |
| Cell padding X | 8px | 12px | 16px |
| Control height | 28px | 32px | 44px |
| Icon size | 14px | 16px | 20px |

**Non-negotiable:** any interactive target has a ≥44×44px hit area on touch, even if the *visual* control is smaller (pseudo-element padding to expand the hit box without changing the layout). Users are wearing gloves.

## 5.3 Layout technique

- **Grid for two-dimensional layout, flex for one-dimensional.** Using flex with wrapping and percentage widths to fake a grid is a structural smell.
- **`subgrid`** — card contents in a row align across cards. The fix for ragged-card-row dashboards.
- **Container queries (`@container`)** — components size to their container, not the viewport. Required for a job card that must live in a sidebar, a column, and a table.
- **`clamp()` for fluid sizing** — continuous scaling instead of breakpoint stair-steps.
- **Intrinsic sizing** — `min-content`, `max-content`, `fit-content()`.
- **`:has()`** — parent-based styling with no JS.
- **`field-sizing: content`** — textareas that grow with content.
- **Anchor positioning** — tooltips and dropdowns tethered to their trigger.
- **Popover API + `<dialog>`** — native top-layer, light-dismiss, focus trapping. Prefer over new overlay machinery.
- **View Transitions API** — highest-impact "native app" feel. Do not add `view-transition-name` product-wide in a LOOK PR; it is a later slice on the job chip → job detail path.

---

# Part VI — Component doctrine for dense professional software

## 6.1 Tables (the heart of a CRM)

The table is where 80% of CRM time is spent, and where almost all products fail.

- **Zebra striping is obsolete.** Hairline row separators at 6% alpha, or nothing at all with sufficient row height. If rows are hard to track, the row height is too small or the alignment is wrong.
- **Alignment carries meaning.** Text left, numbers right, dates consistent, status centred *only* if it's a fixed-width pill. Right-aligned numbers with tabular figures make magnitude scannable without reading.
- **The first column is the identity column.** Sticky, slightly heavier weight, never truncated.
- **Row hover must be a fill change, never a border change** — borders shift layout and cause 1px jitter.
- **Selection ≠ hover ≠ focus.** Three distinct visual states, all simultaneously possible. Selection = accent tint fill + accent left border. Focus = ring. Hover = neutral fill.
- **Truncate with intent.** Ellipsis plus `title` is the floor; two-line clamp for addresses.
- **Column density**: cap at 7±2 visible columns. Move the rest into an expandable row or the detail panel.
- **Empty and loading states are part of the table component.** Skeleton rows must match the real row height exactly.

## 6.2 Forms

- **Labels above fields, always.** Placeholder-as-label is an accessibility failure.
- **One column.** Multi-column forms double completion time except for genuinely paired fields (city/postcode, start/end date).
- **Validate on blur, re-validate on change.** Validating on every keystroke while the user is still typing is hostile.
- **Errors sit below the field** and say what to do: "Enter a job number like #04821", not "Invalid input".
- **Optional is marked, required is not** when most fields are required.
- **Inputs need a visible resting border.** Borderless inputs that only appear on hover cost real users real time.

## 6.3 Buttons and action hierarchy

Exactly five roles, and the bot must never invent a sixth:
1. **Primary** — filled accent. *One per view.* Not one per card — one per view.
2. **Secondary** — bordered neutral, transparent fill.
3. **Tertiary/ghost** — no border, fill on hover.
4. **Destructive** — filled or bordered danger, always requiring confirmation for irreversible acts.
5. **Link** — inline text action.

Every button needs rest, hover, active/pressed, focus-visible, disabled, plus loading if async. Loading must **preserve the button's width**.

Do not recast `.btn-primary` or `.ops-next-control` globally to satisfy this list. On a LOOK surface, map the existing control to the right *role*. Complete Inspection stays pass green.

## 6.4 Feedback and status

- **Status is a controlled vocabulary.** Define states once and never render a status any other way. Inconsistent status rendering is the fastest way for an internal tool to feel homemade.
- **Colour alone never encodes status** — always colour + text, or colour + icon + text.
- **Optimistic UI with rollback** beats spinners for anything the user initiated that usually succeeds.
- **Toasts for transient confirmation, inline for anything requiring a decision.** A toast that asks a question is a bug.

## 6.5 Navigation

- The user must always be able to answer three questions in under a second: where am I, what can I do here, how do I get back. Current location needs the strongest treatment in the nav (fill + weight + accent, not just a colour change).
- Command palette (⌘K) is an expectation in professional tools. Do not build it in a LOOK PR.
- Keyboard-first. `j/k` row navigation, `/` to search, `esc` to close, `⌘Enter` to submit — later slices.

---

# Part VII — The quality floor (non-negotiable)

None of the above counts if these fail.

- **Focus visibility.** `:focus-visible` with a 2px ring offset 2px from the element, in a colour that has 3:1 contrast against *both* the element and the background. Never `outline: none` without a replacement.
- **Contrast.** WCAG 2.2 AA minimum: 4.5:1 body text, 3:1 large text and UI component boundaries. Aim for AAA (7:1) on primary text.
- **Target size.** WCAG 2.2 SC 2.5.8: 24×24 CSS px minimum; 44×44 for anything used in the field.
- **Semantics.** Real `<button>`, real `<table>`, real `<label for>`. A `<div onClick>` is broken for keyboard and screen-reader users.
- **Live regions** for async status so screen-reader users learn the save succeeded.
- **Reduced motion, reduced transparency, forced-colors** all respected.
- **Responsive to 320px** and up to ultrawide (cap content at ~1600px with an ultrawide multi-panel mode).
- **Performance is design.** Interaction to Next Paint under 200ms. Skeleton screens matched to real geometry, optimistic updates, prefetch on hover.

---

# Part VIII — The Grafter specification

This is the operative section. Where prose above and doctrine here disagree, this wins — unless `grafter-overlay.md` is stricter, in which case the overlay wins.

## 8.1 Positioning

Grafter is a **professional instrument for commercial and industrial electrical contracting**, used by office coordinators for hours at a time and by licensed electricians in the field for seconds at a time. It handles jobs, quotes, invoices, clients, switchboard inspections, audit reports, JHA / SWMS, and Take 5.

The design must read as **precise, load-bearing, and calm** — the visual language of test equipment and compliance documentation, not of a consumer SaaS marketing page.

The chosen direction is **Warm Technical** (Part II, direction C): stone-warm cream already shipped as `--ops-cream`, cold navy and accent already shipped as `report_theme` / `--ops-navy` / `--ops-accent`, and mono type on every machine identifier.

**The signature element:** the **job-number chip** — every job identifier rendered in mono as `#0001` (`formatJobNumber`), in a subtly inset chip with a status-coloured left rule, click-to-copy. It appears in tables, cards, and search results, always identically. Land it on the job-list / job-hub LOOK surface — do not sprinkle a new chip on quote, invoice, or JHA PRs.

## 8.2 Colour tokens

Authored conceptually in OKLCH. **Hex is what is shipped.** Do not replace these with a second house palette.

```css
:root {
  /* Already shipped — source of truth */
  --ops-navy: #0A2540;
  --ops-accent: #2E75B6;
  --ops-cream: #F5F0E6;
  --ops-pass: #1B7F3A;
  --ops-fail: #B42318;
  --ops-warning: #B54708;
  --ops-ink: #1A1A1A;
  --ops-muted: #4A5568;
  --ops-rule: #E5E7EB;
  --ops-zebra: #F9FAFB;
  --ops-white: #FFFFFF;
  --ops-radius: 8px;
  --ops-radius-ctl: 6px;

  /* report_theme blanks — same as documents / AppShell */
  --theme-navy: #0A2540;
  --theme-accent: #2E75B6;
  --theme-accent-light: #D6E8F7;
  --theme-navy-light: #153558;
}
```

Map craft roles onto the shipped tokens on the surface you are painting:

| Craft role | Grafter source |
| --- | --- |
| surface-canvas | `--ops-zebra` / page bg already on that hub |
| surface-raised | `--ops-white` |
| surface-sunken | cream or a 4–8% navy mix, not a new hex |
| fg-primary | navy or `--ops-ink` already on that surface |
| fg-secondary | `--ops-muted` |
| fg-tertiary | muted at lower contrast, not a new grey |
| fg-accent | `accent` / `--ops-accent` |
| border-hairline | `color-mix` of navy/ink at 8% |
| border-default | 14% |
| state-hover | navy/ink at 4% |
| state-pressed | navy/ink at 8% |
| ok / warn / risk | pass / warning / fail — do not recast |

`companies.report_theme` may override navy / accent / accentLight / navyLight on document chrome and AppShell. Extra keys (including a second cream) are dropped.

**Dark mode is not the default.** Field use is daylight. Do not ship a theme switch in a LOOK PR.

When adding *new* local CSS variables on a surface, author them in OKLCH with hex fallback that equals the shipped token. Do not dump a 14-step `--n-0`…`--n-950` sheet into global `:root`.

## 8.3 Type tokens

```css
:root {
  --font-ui:   'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-data: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  --t-micro:   0.6875rem;  /* 11 */
  --t-caption: 0.75rem;    /* 12 */
  --t-dense:   0.8125rem;  /* 13 */
  --t-body:    0.875rem;   /* 14 */
  --t-lead:    1rem;       /* 16 */
  --t-h3:      1.125rem;   /* 18 */
  --t-h2:      1.375rem;   /* 22 */
  --t-h1:      1.75rem;    /* 28 */
  --t-metric:  2.25rem;    /* 36 */

  --w-regular: 400; --w-medium: 500; --w-semi: 600; --w-bold: 700;

  --lh-tight: 1.15; --lh-snug: 1.35; --lh-normal: 1.5; --lh-loose: 1.6;

  --tr-caps:  0.06em;
  --tr-flat:  0;
  --tr-tight: -0.011em;
  --tr-tighter: -0.022em;
  --tr-display: -0.032em;
}
```

Use `--font-data` / `.font-mono` plus `font-variant-numeric: tabular-nums` on job numbers, report numbers, quantities, and money. Do not load a third UI family.

## 8.4 Space, density, motion

```css
:root {
  --s-1:2px; --s-2:4px; --s-3:6px;  --s-4:8px;  --s-5:12px; --s-6:16px;
  --s-7:20px; --s-8:24px; --s-9:32px; --s-10:40px; --s-11:48px; --s-12:64px;

  --space-inline-tight: var(--s-2);
  --space-inline:       var(--s-4);
  --space-stack-tight:  var(--s-4);
  --space-stack:        var(--s-6);
  --space-group:        var(--s-8);
  --space-section:      var(--s-10);
  --space-region:       var(--s-12);

  --row-h: 40px; --control-h: 32px; --cell-pad-x: var(--s-5);
  --icon: 16px;

  --dur-instant: 80ms; --dur-fast: 140ms; --dur-base: 200ms;
  --dur-slow: 280ms;   --dur-panel: 340ms;
  --ease-out:   cubic-bezier(0.16, 1, 0.30, 1);
  --ease-in:    cubic-bezier(0.55, 0, 1, 0.45);
  --ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
}
```

Field / ute LOOK: comfortable touch — visual 44px where the surface already uses it. Compact density is a later overlay, not a silent recast of existing 44px Next controls.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

## 8.5 Focus ring — one definition, used everywhere

```css
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--ops-accent, #2E75B6);
  outline-offset: 2px;
  border-radius: inherit;
}
```

Do not `outline: none` without this replacement. Prefer adding it on the surface you are looking at, not a global recast of every control in `index.css` in the same PR.

## 8.6 The signature: job-number chip

Job numbers format as `#0001`. Target treatment (land on job list / job hub, not every document):

```css
.job-number {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px 2px 6px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  color: var(--ops-navy, #0A2540);
  background: color-mix(in srgb, var(--ops-navy, #0A2540) 6%, #fff);
  border: 1px solid color-mix(in srgb, var(--ops-navy, #0A2540) 8%, transparent);
  border-left: 3px solid var(--status-color, var(--ops-rule, #E5E7EB));
  border-radius: 6px;
  cursor: pointer;
}
```

## 8.7 Screen-level doctrine

**Job board (kanban / dispatch).** Columns are workflow states. Cards show: job-number chip, client, site suburb, assigned tech, scheduled date, one status pill. Nothing else.

**Job detail.** Two-column target: 65% activity (the narrative), 35% sticky facts (the reference). Identity top-left.

**Audit / inspection / JHA / Take 5 documents.** Compliance documents that end up as PDFs. Most typographically conservative surfaces: generous measure, real hierarchy, no decoration, clause references in mono, defect severity using pass/warn/fail with icon + text. Screen and PDF already share `report_theme` — do not let them drift. Do not edit `src/reports/shared/components.tsx`.

**Global.** Density and command palette are later slices. Every list already needs a designed empty state that names the next action.

## 8.8 What to explicitly avoid

- Glassmorphism over data. Blur belongs on transient chrome only.
- Purple-to-pink gradients, glowing borders, animated mesh backgrounds.
- Neumorphism. Fails contrast requirements outright.
- More than one primary button per view.
- Icon-only buttons without accessible labels or tooltips.
- Emoji as status indicators.
- Any new colour value written inline when a token already exists on that surface.
- Zebra striping, full-opacity 1px black borders, pure `#000` shadows, pure `#FFF` dark-mode text.
- Recasting `.btn-primary` / `.ops-next-control` globally.
- A new theme editor or new `report_theme` keys.
- Grafter mark on customer PDFs.
- Any other product name.

---

# Part IX — Review rubric

Score any screen the bot produces out of 30. Below 24, revise before showing the user.

| # | Criterion | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|
| 1 | Every value traces to a token | inline values everywhere | mostly | one or two strays | zero strays |
| 2 | Contrast budget respected | everything shouts | several competing | one main + minor noise | one clear focus |
| 3 | Optical spacing | arbitrary gaps | on-scale but unadjusted | mostly corrected | corrected throughout |
| 4 | Type hierarchy | size-only | size + weight | + colour roles | full four-role system, tuned leading/tracking |
| 5 | Concentric radii | ignored | inconsistent | mostly correct | exact |
| 6 | Edge quality | full-opacity borders | some hairlines | hairlines + tinted shadow | + inner lip, layered elevation |
| 7 | State coverage | rest only | + hover | + focus-visible, disabled | + pressed, loading, selected, empty, error |
| 8 | Accessibility floor | fails contrast/semantics | passes contrast only | + semantics + focus | + targets, live regions, reduced motion |
| 9 | Motion | none or gratuitous | present, uniform | asymmetric, transform-only | + purposeful continuity (view transitions) |
| 10 | Copy | system language | plain | active voice, specific | + designed empty/error states |

**Two final checks before shipping any screen.**

*The squint test.* Blur the screen until text is illegible. The intended focal point should still be the first thing you see, and the layout should resolve into 3–5 clean blocks. If it's grey mush, hierarchy has failed.

*Chanel's rule.* Look at the finished screen and remove one thing. There is always one. It is usually a border, an icon, or a background fill on something that didn't need enclosing.
