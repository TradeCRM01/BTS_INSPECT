import { describe, expect, it } from 'vitest';
import { JOB_ID_BATCH, chunkIds } from './jobIdBatch';

describe('chunkIds', () => {
  it('splits at 100 and leaves a remainder, never a 101 batch', () => {
    const ids = Array.from({ length: 101 }, (_, i) => i);
    const batches = chunkIds(ids);
    expect(JOB_ID_BATCH).toBe(100);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(100);
    expect(batches[1]).toHaveLength(1);
    expect(batches.every((batch) => batch.length <= 100)).toBe(true);
  });
});
