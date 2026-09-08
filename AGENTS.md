# Agent notes

This repo is `TradeCRM01/BTS_INSPECT`. The public product is Grafter. Hard locks live in `.cursor/rules/hard-locks.mdc`. Read that file. Do not miss it.

## How to run and test

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Run `npm run dev` for Vite.

Public origin is https://grafter.com.au. The live Pages host is https://bts-inspect.pages.dev.

Run checks with these commands.

- `npm test` runs Vitest on `src/**/*.test.ts`.
- `npm run typecheck` runs `tsc --noEmit -p tsconfig.app.json`.
- `npm run lint` runs ESLint.
- `npm run build` is the production Vite build.

`.github/workflows/deploy-pages.yml` runs `npm ci` and `npm run build` on `main`. There is no test CI workflow. Run tests locally.

## Look

Keep cream `#F5F0E6`, sheet `#FFFDF8`, navy `#0A2540`, and one primary at `44px` `#2E75B6`.

`tailwind.config.js` names cream, navy, and accent. `src/index.css` sets `--ops-cream`, `--ops-navy`, and `--ops-accent`. Sheet `#FFFDF8` is a page token in CSS, for example `--quote-sheet` and `--mkt-sheet`. It is not a Tailwind color name.

LOOK is laptop 1280 and phone against quote paper. Compare frames in `docs/look/`. Start with `docs/look/quote-paper-reference.png` and `docs/look/jobs-list-laptop-1280-document.png`. A CSS diff is not proof.

## Public copy

Write all-trades copy. Never electrician-only. Never BTS-only. Never write Relovi or Littleloop in product copy, UI, emails, or PDFs. The public name is Grafter. The landing already says Grafter is for trade crews: plumbing, mechanical, carpentry, electrical, the lot. The GitHub repo name is not product copy.

## Plumber scoreboard

The walk that matters is quote to booked job. `recommendQuoteAction` in `src/lib/quoteNextAction.ts` is the path: Send, Mark accepted, Convert to job. Deepen that walk. Do not add a scoreboard module.

## Modules

Deepen jobs, quotes, invoices, schedule, JHA, inspections, Take 5, and clients. Routes live in `src/App.tsx`. Pages live in `src/pages/`. Other pages exist. Do not grow them as new product lines. Do not invent modules.

## FUNCTION

Route product work through poteto-mode. Prove it works on the real artifact before you call it done. For UI, that means the laptop 1280 and phone frames against quote paper, not a CSS-diff claim.
