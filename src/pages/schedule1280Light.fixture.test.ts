import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXTURES = resolve(process.cwd(), 'docs/look/p2/fixtures');

const PINS = {
  'schedule-1280-light.html': '4fde8db16d597c2d24507109389fbfedfaab9c72366d7e813634d8a2a224a336',
  'direction.css': '43ad708c5ec7d6fc996ac450013e872c2c75e592b3f3435b493bc7fedfb4b4c6',
  'tokens.css': '29c9cb9b438e1fd212b9c2b32631fed2708bd59ed0cf343cc1f988ff21bd637d',
  'app.css': 'c65a92f76b574565381f2656faddf23fc6f7b7ce35adc20653505540ad30eb0b',
} as const;

describe('schedule-1280-light fixture pin', () => {
  it('keeps the uploaded mockup html and CSS byte-identical', () => {
    for (const [name, sha] of Object.entries(PINS)) {
      const buf = readFileSync(resolve(FIXTURES, name));
      expect(createHash('sha256').update(buf).digest('hex'), name).toBe(sha);
    }
  });
});
