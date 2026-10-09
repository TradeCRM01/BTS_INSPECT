import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  setTimeFieldRendersMeridiemProbeOverride,
  resetTimeFieldRendersMeridiemProbeCache,
} from './timeFieldMeridiemProbe';
import {
  timeFieldHintKind,
  TIME_FIELD_ADD_AM_PM,
  TIME_FIELD_INCOMPLETE,
  timeFieldValidationMessage,
} from './timeFieldInput';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

afterEach(() => {
  setTimeFieldRendersMeridiemProbeOverride(undefined);
  resetTimeFieldRendersMeridiemProbeCache();
});

describe('FIX-5c C8 — hint copy without minutes heuristic', () => {
  it('TimeFieldInput uses meridiem probe and reserves hint line only for 12h', () => {
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).toContain('timeFieldRendersMeridiem');
    expect(field).toContain('rendersMeridiem ?');
    expect(field).toContain('meridiemEngagedRef');
    expect(field).not.toContain('digitSequenceRef');
    expect(field).not.toContain('timeFieldDigitsImplyMeridiemHint');
  });

  it('probe inconclusive fallback is false (generic, no line) at timeFieldMeridiemProbe.ts', () => {
    const probe = src('src/lib/timeFieldMeridiemProbe.ts');
    expect(probe).toMatch(/rendersMeridiem = delta13 > 0\.5 \|\| delta0930 > 0\.5/);
    expect(probe).toMatch(/Inconclusive.*false/s);
    expect(probe).toMatch(/import\.meta\.env\.DEV[\s\S]*__FIX5C_TIME_FIELD_RENDER_MERIDIEM__/);
  });

  it('12h 0930 keystrokes → AM/PM hint', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 4,
        rendersMeridiem: true,
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('ampm');
  });

  it('12h 0800 keystrokes → AM/PM hint', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 4,
        rendersMeridiem: true,
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('ampm');
  });

  it('12h 1200 keystrokes → AM/PM hint', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 4,
        rendersMeridiem: true,
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('ampm');
  });

  it('24h four digit keys → generic incomplete, not AM/PM', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 4,
        rendersMeridiem: false,
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('incomplete');
  });

  it('12h meridiem engaged (a then digits) → generic incomplete', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 4,
        rendersMeridiem: true,
        meridiemEngagedSinceFocus: true,
      }),
    ).toBe('incomplete');
  });

  it('soft: split session with two digits → generic', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 2,
        rendersMeridiem: true,
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('incomplete');
  });

  it('blocks validation with both hint messages', () => {
    expect(timeFieldValidationMessage('', 'ampm')).toBe(TIME_FIELD_ADD_AM_PM);
    expect(timeFieldValidationMessage('', 'incomplete')).toBe(TIME_FIELD_INCOMPLETE);
  });
});

describe('FIX-5c C8 production bundle', () => {
  it('does not ship __FIX5C_TIME_FIELD_RENDER_MERIDIEM__ in dist', () => {
    const assetsDir = resolve(process.cwd(), 'dist/assets');
    expect(existsSync(assetsDir)).toBe(true);
    const bundle = readdirSync(assetsDir)
      .filter(f => f.endsWith('.js'))
      .map(f => readFileSync(resolve(assetsDir, f), 'utf8'))
      .join('\n');
    expect(bundle).not.toContain('__FIX5C_TIME_FIELD_RENDER_MERIDIEM__');
  });
});
