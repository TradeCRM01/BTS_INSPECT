# Remaining local acceptance — 17 Sep 2026

Tested tree: checkpoint commit on `integration/job-workspace-tabs` (see handover). App `http://127.0.0.1:5174`. Kong `54321`. DB `54322`. Production `.env` unused. No push, merge, deploy, tunnel, or grafter.com.au.

Hours / Auth stay accepted. M6 enforcement was re-run only where dispatch/save changes could affect it.

## Matrix

| Check | Result | Evidence |
| --- | --- | --- |
| Hours-toggle count (selected window) | **PASS** | Count is any timed overlap outside the **selected** window, one per job. Untimed excluded. Today isolated set: **7am–5pm 3** (span `#0016` 15–18, early `#0017` 05:30–07:30, after-8pm `#0018` 21–22). Ends-at-17:00 `#0015` not counted. **6am–8pm 2** (early + after 8pm). |
| End exactly 17:00 `#0015` | **PASS** | 7–17: width 68px (1h−4), right edge before the 5pm column. 6–20: still 68px. Not stretched to fill 17–18. |
| Span 17:00 `#0016` | **PASS** | 7–17: `data-clipped-end`, 212px to last column. 6–20: no clip, 212px (15–18 only). |
| Start before 07:00 `#0017` | **PASS** | 7–17: `data-clipped-start`, 60px at first column. 6–20: clipped start, 104px from 6:00 through 07:30. |
| Start after 20:00 `#0018` | **PASS** | Hidden 60px stub, `data-clipped-end`. Click opened `/jobs/…000021`. |
| Hard reject (timed overlap) | **PASS** | Admin RPC `#0011` slot vs Jack overlap → `dispatch_blocked`, job unchanged. |
| Hard reject (OOS EWP) | **PASS** | Admin RPC still `dispatch_blocked` + `resource_out_of_service`; job and allocations unchanged. Script kind parse was wrong (`P0001`); parser now reads the detail string. Validation not relaxed. |
| Member override | **PASS** | `override_forbidden`, unchanged. |
| Admin soft + reason | **PASS** | Persist + override audit. |
| Lost-response retry | **PASS** | Same `save_job_dispatch` payload twice on `#0015` / `…000018`. Second `replayed=true`, same `event_id`, one `dispatch_events` row, 0 allocations. New drops mint a new key; Retry reuses the failed payload. |
| Offline gate in `saveJobDispatch` | **PASS** (unit) | `navigator.onLine === false` returns before RPC; `decideDispatchWrite` still runs first. |
| LOOK / rendered text | **LOOK UNVERIFIED** | Cause **UNDETERMINED**. Live DOM/a11y is Latin. Tool PNGs (Cursor and CDP) are glyph-garbled. No OS-level screenshot was available to the tools. |
| Sticky On-site strip | **preserved** | `.job-field-path` sticky `bottom` `z-index: 30` + `18rem` clearance. Not re-proven this pass. |
| Physical iPhone / Android | **NOT RUN** | |
| Real pointer (this machine) | **NOT RUN** this pass | Prior `#0012` drop remains the last successful pointer persist. |
| Hardware keyboard | **NOT RUN** | |
| VoiceOver / TalkBack | **NOT RUN** | |

## Jack — desktop visual review

1. Sign in locally at `http://127.0.0.1:5174/schedule` (Today, Day).
2. Set the window to **1366×768**, then **1440×900**.
3. **Win+Shift+S** (or Snipping Tool) on that window. Do not use Cursor/CDP captures.
4. Confirm the saved image shows Latin labels (`Schedule`, `Jack Wieland`, `7am–5pm` / count).

## Physical device + keyboard (On-site strip)

On a real phone, open a job with the On-site strip:

1. Confirm one sticky bottom strip.
2. Scroll a crew chip into view. It must sit above the strip (`18rem` clearance). Tap it.
3. Note whether the clearance leaves an unusable empty gap.
4. Hardware keyboard: tab to strip actions and crew.
5. Enlarge text (iOS/Android) and re-check reachability.

## Isolated fixtures

`scripts/local-m7-dispatch-centre.sql` on `CURRENT_DATE`:

- `…000018` `#0015` 16:00–17:00 ends exactly 5pm
- `…000019` `#0016` 15:00–18:00 spans 5pm
- `…000020` `#0017` 05:30–07:30 starts before 7am
- `…000021` `#0018` 21:00–22:00 starts after 8pm
