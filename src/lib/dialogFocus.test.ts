import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dialogFocusPlan,
  dialogKeyAction,
  dialogStackEnter,
  dialogStackIsTop,
  dialogStackLeave,
  nextFocusIndex,
} from './dialogFocus';

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

  it('only the top nested dialog is the Escape target', () => {
    const editor = dialogStackEnter();
    const preview = dialogStackEnter();
    expect(dialogStackIsTop(preview)).toBe(true);
    expect(dialogStackIsTop(editor)).toBe(false);
    dialogStackLeave(preview);
    expect(dialogStackIsTop(editor)).toBe(true);
    dialogStackLeave(editor);
    expect(dialogStackIsTop(editor)).toBe(false);
  });
});

describe('AppDialog restore and stack', () => {
  it('restores focus on unmount while open and registers on the dialog stack', () => {
    const dialog = readFileSync(resolve(process.cwd(), 'src/components/ui/AppDialog.tsx'), 'utf8');
    expect(dialog).toContain('dialogStackEnter');
    expect(dialog).toContain('dialogStackLeave');
    expect(dialog).toContain('dialogStackIsTop');
    expect(dialog).toContain('queueMicrotask');
    expect(dialog).toMatch(/queueMicrotask\(\(\) => \{[\s\S]*opener\?\.focus\(\)/);
  });
});
