# AGENTS.md

This repo is Grafter, an app for trade crews. This file covers how to run it, how to test it, and what is locked.

## Run and test

1. Run `npm install`.
2. Copy `.env.example` to `.env`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Run `npm run dev` to start Vite.

Check a change with these commands before you call it done:

- `npm test` runs vitest once over `src/**/*.test.ts`.
- `npm run typecheck` runs `tsc --noEmit` against `tsconfig.app.json`.
- `npm run lint` runs eslint.
- `npm run build` runs the production build.

There is no test workflow in CI. `.github/workflows/deploy-pages.yml` runs `npm ci` and `npm run build` on a push to `main`, then deploys to Cloudflare Pages. Run the tests locally before you push.

The public origin in `.env.example` is https://grafter.com.au. The live Pages host is https://bts-inspect.pages.dev.

## Look lock

Four values define the look. Cream `#F5F0E6` is the page. Sheet `#FFFDF8` is the paper on the page. Navy `#0A2540` is the ink. There is one primary color, `#2E75B6`. Primary buttons are `44px` tall.

The tokens live in two places. `tailwind.config.js` names `cream`, `navy`, and `accent`. `src/index.css` sets `--ops-cream`, `--ops-navy`, and `--ops-accent`. Sheet `#FFFDF8` is not a Tailwind color name. It is a page or sheet token in CSS, for example `--quote-sheet` and `--mkt-sheet`.

## All-trades public copy

The public product name is Grafter. Public copy is for all trades. Never write electrician-only copy. Never write BTS-only copy in the product. The landing page already says Grafter is for trade crews (plumbing, mechanical, carpentry, electrical, the lot). Keep to that. The repo name BTS_INSPECT is not product copy.

## Plumber scoreboard

The walk that matters is the quote to booked job walk. The code path is `recommendQuoteAction` in `src/lib/quoteNextAction.ts`. It steps a quote through Send, Mark accepted, and Convert to job. Deepen that walk. Do not add a new scoreboard module.

## No new modules

Deepen the existing job, quote, invoice, schedule, JHA, inspections, Take 5, and clients pages. Routes live in `src/App.tsx`. Pages live in `src/pages/`. Other pages exist, for example stock and expenses. Do not grow those into new product lines. Do not invent modules.

## FUNCTION coding

Route product work through poteto-mode. Prove a change works on the real artifact before you call it done. Run the page, click the path, read the value.

LOOK proof is not a CSS diff. Capture a laptop 1280 frame and a phone frame. Compare them to the quote paper in `docs/look/`. Start with `docs/look/quote-paper-reference.png` and `docs/look/jobs-list-laptop-1280-document.png`. The `scripts/capture-*-look.mjs` files show how earlier frames were captured with Playwright against a running dev server.

## Hard locks

Never write Relovi. Never write Littleloop. The full list of locks is in `.cursor/rules/hard-locks.mdc`. That file is short. Every lock there is stated in full.
