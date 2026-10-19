/**
 * @vitest-environment jsdom
 */
import { createElement, useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DateFieldInput } from '../components/ui/DateFieldInput';
import { DATE_INVALID_MESSAGE } from './dateTimeIntegrity';

const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function harness(initial: string) {
  const log: string[] = [];
  const textLog: string[] = [];
  const vlog: boolean[] = [];
  let state = initial;
  let invalid = false;
  function Host() {
    const [v, setV] = useState(initial);
    state = v;
    return createElement(DateFieldInput, {
      value: v,
      onChange: (iso: string) => {
        log.push(iso);
        setV(iso);
      },
      onTextChange: (raw: string) => {
        textLog.push(raw);
      },
      onValidityChange: (b: boolean) => {
        vlog.push(b);
        invalid = b;
      },
    });
  }
  act(() => {
    root.render(createElement(Host));
  });
  const input = () => container.querySelector('input')!;
  const key = (c: string) => {
    act(() => {
      setter.call(input(), input().value + c);
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const replace = (t: string) => {
    act(() => {
      setter.call(input(), t);
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const bs = () => {
    act(() => {
      setter.call(input(), input().value.slice(0, -1));
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const blur = () => {
    act(() => {
      input().focus();
      input().blur();
      input().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
  };
  return {
    log,
    textLog,
    get state() { return state; },
    get invalid() { return invalid; },
    get shown() { return input().value; },
    key,
    replace,
    bs,
    blur,
    type: (text: string) => {
      for (const c of text) key(c);
    },
  };
}

describe('DateFieldInput keystrokes against a stateful parent', () => {
  it('keeps 21/10/2026 while typing one key at a time', () => {
    const h = harness('');
    h.type('21/10/2026');
    expect(h.shown).toBe('21/10/2026');
    expect(h.state).toBe('2026-10-21');
    expect(h.invalid).toBe(false);
    h.blur();
    expect(h.shown).toBe('21/10/2026');
    expect(h.state).toBe('2026-10-21');
  });

  it('does not emit on each keystroke until the date is complete and valid', () => {
    const h = harness('');
    h.type('21/10/20');
    expect(h.shown).toBe('21/10/20');
    expect(h.state).toBe('');
    expect(h.log).toEqual([]);
    expect(h.invalid).toBe(true);
    h.type('26');
    expect(h.state).toBe('2026-10-21');
    expect(h.log).toEqual(['2026-10-21']);
  });

  it('does not emit a 2-digit year on blur', () => {
    const h = harness('');
    h.type('1/1/26');
    expect(h.shown).toBe('1/1/26');
    expect(h.state).toBe('');
    expect(h.invalid).toBe(true);
    h.blur();
    expect(h.shown).toBe('1/1/26');
    expect(h.state).toBe('');
    expect(h.invalid).toBe(true);
  });

  it('one Backspace on a prefilled date leaves the remaining text', () => {
    const h = harness('2026-10-19');
    expect(h.shown).toBe('19/10/2026');
    h.bs();
    expect(h.shown).toBe('19/10/202');
    expect(h.state).toBe('2026-10-19');
    expect(h.invalid).toBe(true);
  });

  it('keeps 31/02 on screen and marks invalid so Save is not "Set a date"', () => {
    const h = harness('2026-10-19');
    h.replace('31/02/2026');
    h.blur();
    expect(h.shown).toBe('31/02/2026');
    expect(h.state).toBe('');
    expect(h.invalid).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(DATE_INVALID_MESSAGE);
  });

  it('blur of 21/10/20 stays invalid and does not commit 2020-10-21', () => {
    const h = harness('');
    h.type('21/10/20');
    h.blur();
    expect(h.shown).toBe('21/10/20');
    expect(h.state).toBe('');
    expect(h.log).toEqual([]);
    expect(h.invalid).toBe(true);
  });

  it('blur reports the raw typed text', () => {
    const h = harness('');
    h.type('21/10/20');
    h.textLog.length = 0;
    h.blur();
    expect(h.textLog.at(-1)).toBe('21/10/20');
    expect(h.textLog.length).toBeGreaterThan(0);
  });

  it('reads 05/11/2026 as 5 November, not 11 May', () => {
    const h = harness('');
    h.type('05/11/2026');
    h.blur();
    expect(h.state).toBe('2026-11-05');
    expect(h.shown).toBe('05/11/2026');
  });
});
