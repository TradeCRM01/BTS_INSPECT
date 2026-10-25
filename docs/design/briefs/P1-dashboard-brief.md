# P1 Dashboard / Today brief (send to Lead after #397 CLOSE; reuse bc-8da7e437)
Base: main after #397 (7e5394df or later). Look only: no layout, order, data or behaviour change.

## Nav vocabulary (Coach ruling (b), 2026-10-22 17:55)
- One shared nav words const (with BRAND_NAME). No labels set per breakpoint.
- 1024+ groups: Today / Jobs / Field / Money / Stock (replaces Dashboard/CRM/Field Work/Financials/Inventory). 768-1023 uses the same short words.
- Phone tabs: Today / Schedule / Jobs / More. Schedule is the named exception.
- Phone: Field's other items move into More.
- 768+: Schedule is first in Field's menu, labelled 'Schedule'.
- Dashboard page title becomes 'Today'. Page titles inside groups don't change.

## Dashboard surface (BTS UI spec, accepted)
1. Page bg moves from cream to --g-bg. Cards move from #FFFDF8 to --g-surface with a 1px --g-line hairline.
   - One quiet elevation at most, and no cards inside cards.
   - Remove every #F5F0E6, #FFFDF8 and navy literal from the dashboard files.
2. Text colours:
   - Titles use --g-ink.
   - Secondary text and meta use --g-ink-muted at >=7:1 on both bg and surface.
   - Figures use tabular numerals.
3. Actions:
   - At most one primary CTA per widget, on --g-inverse.
   - Links and the focus ring use --g-accent.
   - Everything >=4.5:1, with tap targets >=44px.
4. Status colours:
   - Green and amber appear only on pills or icons. 'All compliant' becomes neutral text plus a pill, and every other coloured status text goes the same way.
5. Charts use the chart tokens. The weather widget keeps its shared-cache behaviour.

## Kills (behavioural; Chromium over the built dist; real-file mutants must go red)
- Phone Schedule tab reaches /schedule in 1 tap at 375 and 390.
- Every nav label at every width equals the one shared words source.
- Painted page bg and card bg match the tokens, with no cream.
- Computed secondary-text contrast is >=7:1, CTA contrast >=4.5:1, and the pill colours are correct.
- Forced dark with allowDark false gives 0px.
- Overflow is 0 at 375/390/768/1024/1280: scrollWidth plus max rect.right, including the header.

## Gates
gates.sh runs build, then vitest, then Chromium. tsc is no worse than main, and there are no new failing vitest files.

## Frames (before/after, Light, viewport plus one scrolled viewport)
- Dashboard at 375/390/768/1024/1280, top and scrolled.
- Header nav at 768 and 1280.
- 390 tab bar showing the Schedule tab.

## PR body
- Overflow pairs at each width.
- Contrast table: secondary text, CTA, pill.
- Forced-dark numbers.

Out of scope: other pages, and dark contrast (S3).
