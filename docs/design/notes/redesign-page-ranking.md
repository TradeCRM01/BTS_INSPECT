# Redesign ranking for the "rest" slot (after P1b Today, P2 Schedule, P3 Jobs). 2026-10-23
Paths are under `design/directions/`. "4L" = `4-dark-light/` Light (each also has a `html/*-light.html` and a `compare-dark-vs-light-*.png`). Field use is a judgement: how often a crew or owner touches the page on a phone during the working day. BUILD-PLAN ids come from `4-dark-light/BUILD-PLAN.md:245–257`.

| Rank | Page (BUILD-PLAN) | Mockup files that exist (Light) | Mockup cover | Field use | Why here |
|---|---|---|---|---|---|
| 1 | Invoices: list, view, pay (P5) + PDF (D1) + portal (D2) | 4L `invoice-view-390-light.png` +vp-01/02; `invoice-pdf.png/.pdf`; `portal-invoice-390.png` +vp-01/02; `compare-invoice.png` | view 390 real; list, record payment and 768+ derived | High: the next step after a job ("Create invoice" lands here) | Money; the P3 CTA hands off to it |
| 2 | Quotes: list and editor (P4) | 4L `quote-390-light.png` +vp-01/02; compare sheet | editor 390 real; list and 768+ derived | High: quoting on site | Strong mockup, used in the field |
| 3 | Field: inspections, JHA, Take 5 (P9) | none of its own; reuses `job-390-light` patterns + `html/kit.html` | all derived | Highest: on site; 375 frames mandatory | Biggest field use, but no frame, so it is best done after P3 sets the patterns |
| 4 | Clients: list and detail (P6) | 4L `clients-390-light.png` +vp-01/02; compare sheet | list 390 real; detail and 768+ derived | Medium: look-ups and calls | The P3 list derives from it, so it is cheap to follow |
| 5 | Sign in / sign up / reset (P12) | 4L `signin-390-light.png` +vp-01/02; compare sheet | 390 real; 768+ derived | Low per day, but every user hits it | Small, low risk; first impression |
| 6 | App shell nav (no own P; shell rulings) | `nav/4-dark-light/tabbar-390`, `more-sheet-390`, `topnav-768/1024/1280/1920` (light + dark); `compare-dark-vs-light-nav-{390,1280}.png` | all widths real | Every page | Nav words are locked by Jack (NAV_WORDS), so this is look only and must not copy the mockup's tabs |
| 7 | Settings: company, billing and others (P7) + Team (P8) | 4L `settings-1280-light.png` +vp-01/02; compare sheet | 1280 real (the Appearance section of company settings); phone derived | Low: office | Desk-only use |
| 8 | Appearance (profile section; allowDark) | 4L `appearance-390-light.png` +vp-01/02, `appearance-1280-light.png` +vp-01; compare sheet | 390 + 1280 real | Low | Depends on the Dark/allowDark decision, so do it last among the mocked pages |
| 9 | Landing / marketing (L1) | 4L `landing-390-light.png`, `landing-1440-light.png` (+ dark); `compare-dark-vs-light-landing*.png`, `compare-landing.png` | 390 + 1440 real | None (public) | Off the app path |
| 10 | Email shell (D3) | 4L `email-640.png` | real | None in the app; clients see it | Separate pipeline |
| 11 | Reports (P10), Inventory/stock/POs/price books/expenses/reminders (P11), Internal tools (P13) | none (kit only: `html/kit.html`, `kit-4-dark-light.png`) | all derived | Low–medium (stock in the van) | No frames |
Timesheets ride in P2. Contracts and assets ride in P6.
