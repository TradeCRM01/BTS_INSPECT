/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandLockup } from './BrandLockup';

describe('header Mitre mark size vs wordmark', () => {
  it('renders a 24px header mark so the cap-height / mark ratio is 0.43, not 0.69', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderToStaticMarkup(<BrandLockup size="header" />);
    document.body.appendChild(wrap);
    const mark = wrap.querySelector('[data-grafter-mark="mitre"]') as SVGElement | null;
    const word = wrap.querySelector('[data-grafter-wordmark="header"]') as HTMLElement | null;
    expect(mark).not.toBeNull();
    expect(word).not.toBeNull();
    expect(mark?.getAttribute('width')).toBe('24');
    expect(mark?.getAttribute('height')).toBe('24');
    const style = document.createElement('style');
    style.textContent = '.text-\\[13px\\]{font-size:13px}';
    document.head.appendChild(style);
    const cap = parseFloat(getComputedStyle(word!).fontSize) || 13;
    const markPx = Number(mark?.getAttribute('height'));
    const ratio = cap / markPx;
    expect(ratio).toBeCloseTo(13 / 24, 5);
    expect(ratio).toBeLessThan(0.55);
    expect(ratio).toBeGreaterThan(0.4);
    wrap.remove();
    style.remove();
  });
});
