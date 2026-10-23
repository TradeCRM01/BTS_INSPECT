/**
 * @vitest-environment node
 *
 * Layout-vs-mockup proof is the painted Chromium kill on a VITE_LOOK_PROOF
 * dist, not this file. This pin dies if that it() is removed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('P1b Today board layout', () => {
  it('keeps the painted 390/1280 section-rect kill on the look dist', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/layout/p1Dashboard.chromium.kill.tsx'), 'utf8');
    expect(src).toContain("P1b-layout: painted section rects match the light mockup at 390 and 1280");
    expect(src).toContain('P1b-layout mutant: swapping jobs and needs in TodayBoardView goes red');
    expect(src).not.toContain("expect(ids).toEqual(['s1', 's2', 's3', 's4', 's6', 's10', 's11', 's13', 's14', 's15', 's12'])");
  });
});
