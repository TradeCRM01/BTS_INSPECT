import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXTURES = resolve(process.cwd(), 'docs/look/p3/fixtures');

const PINS = {
  'job-390-light.html': '5c021313f0ca5da73a8fd1dbdccf2f21c6cd401d4e4be96c29bff6d0e8ada711',
  'direction.css': '43ad708c5ec7d6fc996ac450013e872c2c75e592b3f3435b493bc7fedfb4b4c6',
  'tokens.css': '29c9cb9b438e1fd212b9c2b32631fed2708bd59ed0cf343cc1f988ff21bd637d',
  'app.css': 'c65a92f76b574565381f2656faddf23fc6f7b7ce35adc20653505540ad30eb0b',
} as const;

describe('job-390-light fixture pin', () => {
  it('keeps the uploaded mockup html and CSS byte-identical', () => {
    for (const [name, sha] of Object.entries(PINS)) {
      const buf = readFileSync(resolve(FIXTURES, name));
      expect(createHash('sha256').update(buf).digest('hex'), name).toBe(sha);
    }
  });
});
