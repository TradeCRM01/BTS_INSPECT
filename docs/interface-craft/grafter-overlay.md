# Grafter overlay — operative constraints

Where this file and `manual.md` disagree, **this file wins**.
Where this file and Part VIII of the manual disagree, **this file wins**.
Part VIII still wins over Parts I–VII when this overlay is silent.

## Product

- Wordmark: **Grafter**.
- Wordmark is Grafter in UI, PDFs, PR titles, and LOOK copy. Do not name another product.
- Tenant company names (e.g. a customer's trading name) stay as data. They are not the product.

## How LOOK work ships

- **One surface per PR.** FUNCTION first, then LOOK.
- Draft PRs. Do not merge. Hold for Flameboy.
- Stay off **PR #17** (`QuoteSendDialog` / `sendQuote` / `sendQuoteDeliver`) unless Jack asks.
- Do not invent a theme editor. Do not add `ReportThemePage`, `JhaTheme`, or new `companies.report_theme` keys.
- Do not edit `src/reports/shared/components.tsx`.
- Do not put the Grafter mark on customer documents.
- Do not recast `.btn-primary` or `.ops-next-control` **globally**. A surface may already recast them locally (invoice hub). Do not widen that.

## Colour — what is already shipped

`companies.report_theme` has four keys only:

| Key | Blank default |
| --- | --- |
| `navy` | `#0A2540` |
| `accent` | `#2E75B6` |
| `accentLight` | `#D6E8F7` |
| `navyLight` | `#153558` |

Root CSS already has `--ops-navy`, `--ops-accent`, `--ops-cream` (`#F5F0E6`), `--ops-pass` (`#1B7F3A`), `--ops-fail` (`#B42318`), `--ops-warning` (`#B54708`), `--ops-ink`, `--ops-muted`, `--ops-rule`, `--ops-zebra`.

**Paint LOOK from those.** Do not introduce a second accent. Do not dump a 14-step OKLCH ramp into global `:root` in one PR. Do not switch the canvas to a new cream hex. Warm Technical here means: stone-warm cream already on `--ops-cream`, cold navy/blue already on navy + accent, mono already on `.font-mono`.

Complete Inspection / pass stays `#1B7F3A`. Danger stays `#B42318`. Warning stays `#B54708`.

## Type — what is already shipped

- UI face: **Inter**. Do not switch the product to Manrope unless Jack asks for a fonts PR.
- Data/IDs/money: **JetBrains Mono** (already `.font-mono`). Use it on job numbers, report numbers, board IDs, currency, quantities.
- Job identity is `#0001` (`formatJobNumber`), not a `J-4821` chip. When a job-list LOOK lands, the signature is a **job-number chip** in that format — one surface, not a global recast.

## Craft that applies immediately (every LOOK)

These are not a recast. They are how you judge and correct the surface you are on:

1. **Optical consistency** — perceived voids, not bounding-box math. Cap-height for icons. Optical centre for chevrons.
2. **Contrast budget** — three strong events per region: primary action, primary data, current location. ~70% quiet / ~20% structure / ~10% spike.
3. **Edge quality** — hairlines at 6–12% of foreground, not full-opacity 1px black. Concentric radii: `r_inner = r_outer − padding`. Shadows tinted with navy/ink, never grey `rgba(0,0,0,…)`. Inner lip when a surface is raised.
4. **Hierarchy budget** — at most two channels on any element. Four text roles: primary / secondary / tertiary / quaternary. Weight before size inside a card.
5. **Space by relationship** — 4px base. Named: inline-tight, inline, stack-tight, stack, group, section, region. Anything off `2 4 6 8 12 16 20 24 32 40 48 64` is a bug unless it is a 4px optical correction.
6. **Touch** — ≥44×44px hit area in the field, even if the visual control is smaller.
7. **One primary per view.** Loading state preserves button width. Motion: transform/opacity only; enter ease-out, exit faster; `prefers-reduced-motion` is opacity, not “delete motion”.
8. **No zebra striping.** No emoji status. No icon-only control without a name. No inline hex when a token already exists on that surface.

## What this standard does *not* authorise

Do not build these because the manual mentions them. They are later slices, each their own PR, only if Jack asks:

- Command palette (⌘K)
- `data-density` compact/comfortable modes as a user setting
- View Transitions morph from job chip to job detail
- Dark theme as a product switch
- Font swap Inter → Manrope
- Global OKLCH token sheet
- Glass / blur over tables or documents

## Review before any LOOK screenshot

Score the surface out of 30 using Part IX in `manual.md`. **Below 24, revise before showing Jack.**

Squint test: blur until type is gone; the focus should still be obvious; 3–5 blocks.

Chanel’s rule: remove one thing. Usually a border, an icon, or a fill that did not need enclosing.
