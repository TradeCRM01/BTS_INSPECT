---
name: grafter-interface-craft
description: >-
  Grafter Interface Craft Manual — LOOK and UI quality floor for dense
  trade/field CRM screens. Use on any visual CSS, theme, report_theme, card,
  list, overlay, document chrome, screenshot, rubric, spacing, type, colour,
  button, or polish work. Also when Jack says craft, LOOK, polished, or
  interface standard.
---

# Grafter Interface Craft

Read this skill before LOOK or visual CSS. Full doctrine: `docs/interface-craft/manual.md`.
**Overlay (wins on conflict):** `docs/interface-craft/grafter-overlay.md`.

Product wordmark is **Grafter**. Never Relovi. Never Littleloop.

## When doctrine conflicts

1. Overlay
2. Part VIII in the manual (Grafter tokens, not a second house palette)
3. Parts I–VII prose
4. Adjectives (“modern”, “premium”)

## Shipped tokens — paint from these

`companies.report_theme` keys only: `navy`, `accent`, `accentLight`, `navyLight`.
Blank: `#0A2540` / `#2E75B6` / `#D6E8F7` / `#153558`.

Also already on `:root`: `--ops-navy`, `--ops-accent`, `--ops-cream` (`#F5F0E6`), pass `#1B7F3A`, fail `#B42318`, warning `#B54708`.

UI face is **Inter**. Data face is **JetBrains Mono**. Do not switch to Manrope or a new accent hex unless Jack asks.

Do not recast `.btn-primary` / `.ops-next-control` globally. Do not edit `src/reports/shared/components.tsx`. Do not add a theme editor. One surface per PR. Stay off PR #17 unless asked.

## Four properties that must be true

1. **Optical consistency** — perceived void, not box math. Cap-height icons. Optical centre for arrows.
2. **Contrast budget** — three spikes per region (action, data, location). Quiet elsewhere.
3. **Edge quality** — hairline 6–12% fg; concentric radii `inner = outer − padding`; navy-tinted layered shadows; inner lip on raised surfaces.
4. **Motion honesty** — causality only. Transform/opacity. Enter `cubic-bezier(0.16, 1, 0.3, 1)`, exit ~30% faster. Max ~400ms. Reduced motion = opacity.

## Hierarchy

Spend at most two channels. Four text roles: primary / secondary / tertiary / quaternary. Weight before size inside a card. Identity (job number, client, site) in the top-left / first column. Job numbers are `#0001`, mono, tabular-nums.

Space is named by relationship on a 4px grid: inline-tight 4, inline 8, stack-tight 8, stack 16, group 24, section 40, region 64. Field hit targets ≥44×44.

Exactly five button roles: primary (one per view), secondary, ghost, destructive, link. Five states + loading that preserves width.

## LOOK ship bar

Score the surface out of 30 (manual Part IX). Below 24, revise before screenshots.
Squint test. Chanel’s rule (remove one thing).
