# Smaller PR acceptance (loading, window, On-site strip)

Branch `integrate/schedule-loading-window-strip` from `de768d0`. No merge. No Cloudflare deploy until Jack authorises this PR specifically.

## What to review on the live path

Local Vite used for isolated UI work is `http://127.0.0.1:5175` with `VITE_SUPABASE_URL=http://127.0.0.1:54321`. Confirm the module transform still contains that URL, not the production host.

Look harness (no login) on the same origin as the running Vite:

1. `http://127.0.0.1:5175/schedule?look=week-board` at 1280 and 390.
2. `http://127.0.0.1:5175/schedule?look=week-board&view=day` at 1280 and 390.
3. Day view. Confirm the hours toggle (`6am–8pm` / `7am–5pm`) and that chips clip instead of overflowing the grid.
4. Change Week to Day (or the reverse) on a signed-in local company. The whisper must not flash `0 on the board` while the next range loads. First paint may say `Loading the board…`.
5. Drag a job onto a crew. Network tab should show `jobs` PATCH/UPDATE, not `save_job_dispatch`.
6. Open a job on a phone width. Sticky On-site strip. Clock, note, photo, JHA, Take 5. Desktop (1024+) hides the strip. In-flow Next stays on desktop.

Signed look references to compare against, not to overwrite: `docs/look/quote-paper-reference.png`, `docs/look/jobs-list-laptop-1280-document.png`.

## Evidence

| Check | Result |
| --- | --- |
| Affected vitest | PASS. `scheduleBoardSummary` 3, `jobFieldPath` 4, `dispatch` 41 including clip/count, `weekBoardLaptopLook` 5. Still requires `rescheduleJob.mutate`. |
| Full vitest | 19 failed files / 21 failed tests / 157 passed files. Recorded clean `de768d0` baseline was 18 / 20. Extra file this run: `clientPortalQuoteAccept` G6 (QuotesPage copy lock). Extra test count also includes a timed `sendInvoice` walk. None of the new failures are in the files this PR adds. |
| `npm run typecheck` | Exit 2. Errors are existing main files (PdfViewer, template editor, inspection packs, reports). No errors in `SchedulePage`, `BoardViews`, `dispatch.ts`, `JobFieldPathBar`, or `JobDetailPage`. |
| `npm run build` | PASS. Vite production build completed (`built in 3m 58s`). |
| Playwright / Cursor browser MCP | MCP server not registered. Playwright is not a repo dependency. Frames not captured this pass. |
| Signed-in drag/drop on local 5175 | Needs Jack on `http://127.0.0.1:5175/schedule` after login. Confirm Network shows `jobs` update, not `save_job_dispatch`. |
| Physical iPhone / Android, VO / TalkBack | NOT RUN |
| FUNCTION | pending |
| LOOK | pending |
