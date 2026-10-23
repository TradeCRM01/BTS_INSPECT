/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contrastRatio } from '../lib/contrastRatio';
import { CalendarWidget, CalculatorWidget } from './WidgetComponents';

let container: HTMLDivElement;
let root: Root;
let style: HTMLStyleElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  style = document.createElement('style');
  style.textContent = `
    .bg-blue-500 { background-color: #3B82F6; }
    .bg-blue-700 { background-color: #1D4ED8; }
    .text-white { color: #FFFFFF; }
  `;
  document.head.appendChild(style);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  style.remove();
});

describe('FAIL 1 widget contrast', () => {
  it('kills calendar today and calculator equals fills under 4.5:1', () => {
    act(() => {
      root.render(
        <>
          <CalendarWidget />
          <CalculatorWidget />
        </>,
      );
    });
    const today = String(new Date().getDate());
    const cell = [...container.querySelectorAll('div')].find((el) => (
      el.className.includes('font-bold') && el.textContent?.trim() === today
    ));
    const eq = [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === '=');
    expect(cell).toBeTruthy();
    expect(eq).toBeTruthy();
    for (const el of [cell, eq] as HTMLElement[]) {
      const cs = getComputedStyle(el);
      expect(
        contrastRatio(cs.color, cs.backgroundColor),
        `${el.textContent} contrast ${cs.color} on ${cs.backgroundColor}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
