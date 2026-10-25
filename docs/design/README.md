# Grafter redesign: mockups and signed briefs

This is the design plan the Grok Bot crew was building to (Direction 4, Light). Every redesign page is a LAYOUT rebuild that matches its mockup, not a recolour.

- `mockups/light/`: Direction 4 Light mockups per page (dashboard, schedule, job, clients, quote, invoice view, settings, appearance, sign-in, landing). `BUILD-PLAN.md` maps pages to build ids.
- `mockups/after/`: detailed Schedule frames (week at 390/1280/1440/1920, day view, drag, place flow) and other "after" frames referenced by the decisions.
- `mockups/nav/`: shell nav mockups. Nav words are locked by Jack (NAV_WORDS in brand.ts); do not copy the mockup's tabs.
- `briefs/`: page briefs. A `.coach-sign` file next to a brief holds the signed rulings, which override the brief where they differ. Jack's own locks beat both.
  - P1b Today (shipped as #403), P2 Schedule (`P2-schedule-layout-brief.md`, in progress as PR #399), P3 Jobs (in progress as PR #407).
- `notes/decisions.md`: signed design decisions (D15 crew tints, D24 Schedule full-pane, and so on). `redesign-page-ranking.md`: the order for the remaining pages.
- `spec/design-system.md`: the design system spec.

Order: #406, #402, #399 Schedule, #407 Jobs, then Invoices, Quotes, Field, Clients, Sign-in, Shell nav, Settings, Appearance, Landing, Email, Reports/Inventory/Internal, and S3 dark last. Full checks on every PR (see HANDOVER.md).
