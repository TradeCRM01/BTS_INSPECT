import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  setTimeFieldRendersMeridiemProbeOverride,
  resetTimeFieldRendersMeridiemProbeCache,
} from './timeFieldMeridiemProbe';
import {
  timeFieldHintKind,
  timeFieldHintRendersLine,
  TIME_FIELD_ADD_AM_PM,
  TIME_FIELD_INCOMPLETE,
  timeFieldValidationMessage,
} from './timeFieldInput';
import {
  applyTimeFieldSegmentBackspace,
  applyTimeFieldSegmentDigitKey,
  applyTimeFieldSegmentDigitKeys,
  createTimeFieldSegmentState,
  shiftTimeFieldSegmentActive,
  timeFieldSegmentProgressFromState,
} from './timeFieldSegmentFocus';

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
    let s = createTimeFieldSegmentState('hour');
    s = applyTimeFieldSegmentDigitKeys(s, true, '09');
    expect(timeFieldHintKind({
      ...base,
      segments: timeFieldSegmentProgressFromState(s),
    })).toBe('incomplete');
    s = { ...s, active: 'minute' };
    s = applyTimeFieldSegmentDigitKeys(s, true, '30');
    expect(timeFieldHintKind({
      ...base,
      segments: timeFieldSegmentProgressFromState(s),
    })).toBe('ampm');
  });

  it('TimeFieldInput does not reset segments on focus', () => {
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).toMatch(/onFocus=\{[^}]*syncHint/);
    expect(field).not.toMatch(/onFocus=\{[^}]*resetTypingSession/);
  });

  it('TimeFieldInput applies segment digits on keydown (Chromium time fields)', () => {
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).toMatch(/onKeyDown[\s\S]*applyTimeFieldSegmentDigitKey/);
    expect(field).toContain('timeFieldSegmentFromClientX');
  });
});

describe('FIX-5c C14 — segment focus (not order-only counting)', () => {
  const base = {
    value: '',
    validity: { badInput: true },
    rendersMeridiem: true,
    meridiemEngagedSinceFocus: false,
  };

  const hint = (segments: { hourFilled: boolean; minuteFilled: boolean }) =>
    timeFieldHintKind({ ...base, segments });

  it('(1) 09, return to hour, 10 → generic (minute missing)', () => {
    let s = applyTimeFieldSegmentDigitKeys(createTimeFieldSegmentState('hour'), true, '09');
    s = { ...s, active: 'hour' };
    s = applyTimeFieldSegmentDigitKeys(s, true, '10');
    expect(hint(timeFieldSegmentProgressFromState(s))).toBe('incomplete');
  });

  it('(2) 0930 then backspace in hour → generic', () => {
    let s = applyTimeFieldSegmentDigitKeys(createTimeFieldSegmentState('hour'), true, '0930');
    s = { ...s, active: 'hour' };
    s = applyTimeFieldSegmentBackspace(s);
    expect(hint(timeFieldSegmentProgressFromState(s))).toBe('incomplete');
  });

  it('(3) minutes first 0800 → generic (hour missing)', () => {
    let s = createTimeFieldSegmentState('minute');
    s = applyTimeFieldSegmentDigitKeys(s, true, '0800');
    expect(hint(timeFieldSegmentProgressFromState(s))).toBe('incomplete');
  });

  it('headline 0930 in order → AM/PM', () => {
    const s = applyTimeFieldSegmentDigitKeys(createTimeFieldSegmentState('hour'), true, '0930');
    expect(hint(timeFieldSegmentProgressFromState(s))).toBe('ampm');
  });

  it('arrow left from minute lands on hour segment', () => {
    expect(shiftTimeFieldSegmentActive('minute', 'left', true)).toBe('hour');
  });
});

describe('FIX-5c C15 — Chrome single-digit segment advance', () => {
  const base12 = {
    value: '',
    validity: { badInput: true },
    rendersMeridiem: true,
    meridiemEngagedSinceFocus: false,
  };

  const hint12 = (s: ReturnType<typeof createTimeFieldSegmentState>) =>
    timeFieldHintKind({ ...base12, segments: timeFieldSegmentProgressFromState(s) });

  it('12h 930 → AM/PM', () => {
    const s = applyTimeFieldSegmentDigitKeys(createTimeFieldSegmentState('hour'), true, '930');
    expect(hint12(s)).toBe('ampm');
  });

  it('12h 230 → AM/PM', () => {
    const s = applyTimeFieldSegmentDigitKeys(createTimeFieldSegmentState('hour'), true, '230');
    expect(hint12(s)).toBe('ampm');
  });

  it('12h 1 then 0 / 1 then 2 → hour filled after 2 digits', () => {
    let s = applyTimeFieldSegmentDigitKeys(createTimeFieldSegmentState('hour'), true, '1');
    expect(timeFieldSegmentProgressFromState(s).hourFilled).toBe(false);
    s = applyTimeFieldSegmentDigitKey(s, 0, true);
    expect(timeFieldSegmentProgressFromState(s).hourFilled).toBe(true);
    s = applyTimeFieldSegmentDigitKeys(createTimeFieldSegmentState('hour'), true, '1');
    s = applyTimeFieldSegmentDigitKey(s, 2, true);
    expect(timeFieldSegmentProgressFromState(s).hourFilled).toBe(true);
  });

  it('12h 1 then 3 rolls minute digit', () => {
    let s = applyTimeFieldSegmentDigitKeys(createTimeFieldSegmentState('hour'), true, '1');
    s = applyTimeFieldSegmentDigitKey(s, 3, true);
    const p = timeFieldSegmentProgressFromState(s);
    expect(p.hourFilled).toBe(true);
    expect(p.minuteFilled).toBe(false);
    expect(hint12(s)).toBe('incomplete');
  });

  it('minute first digit 7 → minute filled', () => {
    const s = applyTimeFieldSegmentDigitKey(createTimeFieldSegmentState('minute'), 7, true);
    expect(timeFieldSegmentProgressFromState(s).minuteFilled).toBe(true);
  });

  it('24h 930 → not AM/PM', () => {
    const s = applyTimeFieldSegmentDigitKeys(createTimeFieldSegmentState('hour'), false, '930');
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        segments: timeFieldSegmentProgressFromState(s),
        rendersMeridiem: false,
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('incomplete');
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
  it('does not ship __FIX5C_TIME_FIELD_RENDER_MERIDIEM__ after production DCE', async () => {
    const symbol = '__FIX5C_TIME_FIELD_RENDER_MERIDIEM__';
    const probeSource = src('src/lib/timeFieldMeridiemProbe.ts');
    expect(probeSource).toContain(symbol);

    const { transform } = await import('esbuild');
    const { code } = await transform(probeSource, {
      loader: 'ts',
      minify: true,
      treeShaking: true,
      format: 'esm',
      define: { 'import.meta.env.DEV': 'false' },
    });
    expect(code).not.toContain(symbol);
  });
});
