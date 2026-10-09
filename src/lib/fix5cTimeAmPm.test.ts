import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  setTimeFieldRendersMeridiemProbeOverride,
  resetTimeFieldRendersMeridiemProbeCache,
} from './timeFieldMeridiemProbe';
import {
  applySequentialTimeFieldKeyDigits,
  timeFieldHintKind,
  timeFieldHintRendersLine,
  TIME_FIELD_ADD_AM_PM,
  TIME_FIELD_INCOMPLETE,
  timeFieldValidationMessage,
} from './timeFieldInput';

const bothSegments = { hourFilled: true, minuteFilled: true };
const hourOnly = { hourFilled: true, minuteFilled: false };

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

afterEach(() => {
  setTimeFieldRendersMeridiemProbeOverride(undefined);
  resetTimeFieldRendersMeridiemProbeCache();
});

describe('FIX-5c C12 — segment persistence (blur, refocus, save refocus)', () => {
  const base = {
    value: '',
    validity: { badInput: true },
    rendersMeridiem: true,
    meridiemEngagedSinceFocus: false,
  };

  it('12h both segments filled → AM/PM (survives blur/refocus/save semantics)', () => {
    expect(timeFieldHintKind({ ...base, segments: bothSegments })).toBe('ampm');
  });

  it('hour only → generic incomplete', () => {
    expect(timeFieldHintKind({ ...base, segments: hourOnly })).toBe('incomplete');
  });

  it('split session end state (09 then 30) → AM/PM', () => {
    let h = 0;
    let m = 0;
    ({ hourDigits: h, minuteDigits: m } = applySequentialTimeFieldKeyDigits(h, m, 2));
    expect(timeFieldHintKind({
      ...base,
      segments: { hourFilled: h >= 2, minuteFilled: m >= 2 },
    })).toBe('incomplete');
    ({ hourDigits: h, minuteDigits: m } = applySequentialTimeFieldKeyDigits(h, m, 2));
    expect(timeFieldHintKind({
      ...base,
      segments: { hourFilled: h >= 2, minuteFilled: m >= 2 },
    })).toBe('ampm');
  });

  it('TimeFieldInput does not reset segments on focus', () => {
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).toMatch(/onFocus=\{[^}]*syncHint/);
    expect(field).not.toMatch(/onFocus=\{[^}]*resetTypingSession/);
  });

  it('TimeFieldInput applies segment digits on keydown (Chromium time fields)', () => {
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).toMatch(/onKeyDown[\s\S]*applyDigits/);
  });
});

describe('FIX-5c C11 — hint line in 24h vs 12h', () => {
  it('rendersMeridiem false + partial → show generic line', () => {
    expect(timeFieldHintRendersLine(false, 'incomplete')).toBe(true);
  });

  it('rendersMeridiem false + empty → no line', () => {
    expect(timeFieldHintRendersLine(false, 'none')).toBe(false);
  });

  it('rendersMeridiem true + empty → reserved line (12h unchanged)', () => {
    expect(timeFieldHintRendersLine(true, 'none')).toBe(true);
  });
});

describe('FIX-5c C8 — hint copy without minutes heuristic', () => {
  it('TimeFieldInput uses meridiem probe and reserves hint line only for 12h', () => {
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).toContain('timeFieldRendersMeridiem');
    expect(field).toContain('timeFieldHintRendersLine');
    expect(field).toContain('renderHintLine');
    expect(field).toContain('meridiemEngagedRef');
    expect(field).not.toContain('digitSequenceRef');
    expect(field).not.toContain('timeFieldDigitsImplyMeridiemHint');
  });

  it('probe compares time input width to plain text (not time vs time)', () => {
    const probe = src('src/lib/timeFieldMeridiemProbe.ts');
    expect(probe).toContain('time-field-meridiem-probe-text-ref');
    expect(probe).toContain('rendersMeridiemFromProbeR5');
    expect(probe).toContain('measureSegmentWidth');
    const css = src('src/index.css');
    expect(css).toContain('time-field-meridiem-probe-live::-webkit-calendar-picker-indicator');
    expect(probe).not.toContain('time-field-meridiem-probe-ref');
    expect(probe).toMatch(/import\.meta\.env\.DEV[\s\S]*__FIX5C_TIME_FIELD_RENDER_MERIDIEM__/);
  });

  it('12h 0930 keystrokes → AM/PM hint', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        segments: bothSegments,
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
        segments: bothSegments,
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
        segments: bothSegments,
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
        segments: bothSegments,
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
        segments: bothSegments,
        rendersMeridiem: true,
        meridiemEngagedSinceFocus: true,
      }),
    ).toBe('incomplete');
  });

  it('soft: split session with hour only → generic', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        segments: hourOnly,
        rendersMeridiem: true,
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('incomplete');
  });

  it('r4: minute segment only → generic', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        segments: { hourFilled: false, minuteFilled: true },
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
