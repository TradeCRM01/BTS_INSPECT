import { describe, expect, it } from 'vitest';
import { dialogFocusPlan, dialogKeyAction, nextFocusIndex } from './dialogFocus';

describe('row-open overlay focus', () => {
  it('focuses the first field on open and restores the opener on close', () => {
    expect(dialogFocusPlan(true, false)).toEqual({
      captureOpener: true,
      focusFirst: true,
      attachKeys: true,
      restoreOpener: false,
    });
    expect(dialogFocusPlan(false, true)).toEqual({
      captureOpener: false,
      focusFirst: false,
      attachKeys: false,
      restoreOpener: true,
    });
  });

  it('does not refocus the first field when the overlay stays open', () => {
    const stayedOpen = dialogFocusPlan(true, true);
    expect(stayedOpen.focusFirst).toBe(false);
    expect(stayedOpen.captureOpener).toBe(false);
    expect(stayedOpen.attachKeys).toBe(true);
  });

  it('contains Tab and Shift+Tab, and treats Escape as close', () => {
    expect(nextFocusIndex(4, 0, false)).toBe(1);
    expect(nextFocusIndex(4, 3, false)).toBe(0);
    expect(nextFocusIndex(4, 0, true)).toBe(3);
    expect(nextFocusIndex(4, 2, true)).toBe(1);
    expect(dialogKeyAction('Escape', false)).toBe('close');
    expect(dialogKeyAction('Tab', true)).toBe('trap');
    expect(dialogKeyAction('Enter', false)).toBeNull();
  });
});
