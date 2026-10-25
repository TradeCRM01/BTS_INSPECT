# Open questions for Jack / project lead

Closed on 19 Oct 2026, 12:57 AEST (Jack: "Yes, go with this look and those changes"). Q1 (radius) is closed below. Also settled, and never listed here as questions: success/warning colours, the `#808A93` control border, no navy bands on documents, Balance due as the biggest PDF figure, green only on pills, `#296AA5` blue text and Rajdhani at 20px and up. See decisions.md.

1. ~~**Radius:** OK to move controls from 12px to 10px (D5)? It is a single token either way.~~ **CLOSED: approved by Jack, 2026-10-19 12:57 AEST (10px).**
2. ~~**Toast:** navy inverse toast (D7) or a light sheet toast with a hairline?~~ **CLOSED by D13 (navy chip), 13:16 AEST.**
3. ~~**Navy strip on list sheets**: remove (D9) or keep?~~ **CLOSED by D14 (removed), 13:16 AEST.**
4. ~~**Non-GST-registered businesses:** should the PDF title switch from "TAX INVOICE" to "INVOICE"?~~ **PROPOSED ANSWER (Phase 1c), D21:** yes. The title is "Invoice", with no GST row, the total labelled "Total", a not-registered notice, and the ABN kept. Drive it from an explicit `gst_registered` flag. This is a logic change, so it needs the Lead to accept. See `after/pdf/invoice-nogst-pdf-p1.png`.
5. **PDF digits:** confirm whether Source Sans 3's default figures are tabular in react-pdf output; if not, approve bundling a `tnum`-frozen instance.
6. **Company `report_theme`:** confirm it may recolour only the header and document accents, never the primary button or statuses.
7. **Fonts:** OK to drop Inter, Newsreader and JetBrains Mono from `index.html` after the sweep, and lazy-load the five signature faces?

8. ~~**Crew palette (D15):** OK to replace the free hex picker with six tints, and map saved colours to the nearest tint?~~ **CLOSED: D15 approved (Coach, 14:07 AEST).**
9. ~~**Settings chips (D16):** OK for the chip block to stop being sticky on phones (it still sticks from 600px)?~~ **CLOSED: D16 approved (Coach, 14:07 AEST).**
10. **Weather widget default:** it falls back to "Auckland" (`WidgetComponents.tsx`). Should the default become the company's suburb or "Brisbane"? That's a logic change, so it's out of scope for the style PRs.
11. **Setup guide (first run):** is "Hide this guide" enough, or does it also need a way back (e.g. from Settings)? There's no existing surface for it yet, so the mockup doesn't invent one.
12. **Compliance widget timezone:** the Compliance Deadlines widget counts calendar days in Perth time. For a Brisbane business that's 2 hours behind, so items can flip to "Overdue" at the wrong time. It should use the company's timezone. This is a logic change.
13. **Copy flags (Phase 1c):**
   - "Add a Widget" should be sentence case, "Add a widget".
   - The inspection report theme description mentions "navy bars", which D1–D3 removed.
   - The landing copy flags are in `notes/landing-copy-flags.md` (8 items: electrician framing in the FAQ, em dashes, Perth and "Field Audit" in the frames, "/mo").
14. **Settings save (D19):** OK to replace the four per-section saves with one sticky save bar? This is a logic change.
15. **Phone place flow (D20):** OK to add the Place sheet on phone? The drag stays on desktop.

## To fold in when live screenshots arrive
- Check the actual rendered sizes against §3.2 on: dashboard, jobs list, open job, quote editor, invoice list, invoice PDF preview, schedule/week board, new-job sheet, toasts.
- Capture legacy pages (settings, stock, suppliers, template editor) to size the sweep batches.
- Measure the real row heights and gutters at 375/390/1280 against §4.3 and §6.6.
