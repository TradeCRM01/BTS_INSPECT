/**
 * @vitest-environment node
 *
 * HF-403-768 FROZEN kill (CoS) — do not edit. Chromium engine.
 * Shared matrix: src/test/hf406.frozen.matrix.ts. Filename omits `.test.` so the default
 * include misses it; run with `npm run test:hf406-frozen -- src/test/hf406.frozen.chromium.kill.tsx`.
 */
import { defineFrozenKills } from './hf406.frozen.matrix';

defineFrozenKills('chromium');
