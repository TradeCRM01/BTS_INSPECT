# PR #348 FIX-4 C3 — CoS precheck (Lead box)

## P1 fixes (C3)

- **P1-1:** End before start blocked with `End time must be after start.`; focus `#quote-convert-end`.
- **P1-2:** List row **Convert to job** opens the editor convert sheet (date, crew, start, end); no inline convert with invented `08:00`/`16:00`. `jobFieldsFromQuote` no longer falls back to default times.

## Cheap rides

- Convert lock held through successful navigate (one double-tap → one job, one toast).
- Missing **End** focuses `#quote-convert-end`.
- `convertQuoteToJob`: `latest.job_id` retry before missing-field validation.

## Coach

- Untimed dated schedule chips read **Time not set · …** (`TIME_NOT_SET_LABEL` in `scheduleBoard.ts`).
- Stale `fix4-saved-*` frames removed from this proof set; use C3 frames below only.

## C3 frames (real input, current-week audit data)

| Frame | 390×844 md5 | 1280×800 md5 |
|-------|-------------|--------------|
| fix4-c3-end-before-start | `355b5a54ccdd6e17f290c9d68333c8ed` | `ee436a5f6cdee234542ec82821f9a248` |
| fix4-c3-list-convert | `d841f1bedbff97cf0e7b0b47d59418f4` | `f64ae0bbfa650207f52d1eaf70521116` |
| fix4-c3-double-tap | `f7d50d17a61077f7b4f20fe6050c8fe9` | `add713493fa6faf3a6d402a1dadc0dd0` |

**End-before-start:** `document.activeElement.id` = `quote-convert-end` (see `fix4-c3-end-before-start-meta.json`).

**Double-tap:** toast count **1**, jobs created **1** (see `fix4-c3-double-tap-meta.json`).
