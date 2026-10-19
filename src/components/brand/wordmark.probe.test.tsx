/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandLockup } from './BrandLockup';
import { Wordmark } from './Wordmark';

describe('rendered wordmark', () => {
  it('kills M5 wordmark attr: BrandLockup renders data-grafter-wordmark', () => {
    for (const size of ['header', 'auth', 'marketing'] as const) {
      const div = document.createElement('div');
      div.innerHTML = renderToStaticMarkup(<BrandLockup size={size} />);
      const wm = div.querySelector('[data-grafter-wordmark]');
      expect(wm?.getAttribute('data-grafter-wordmark')).toBe(size);
      expect(wm?.textContent).toBe('Grafter');
      expect(wm?.getAttribute('aria-label')).toBe('Grafter');
      expect(wm?.className).toMatch(/\buppercase\b/);
      expect(wm?.className).toMatch(/tracking-\[0\.16em\]/);
    }
  });

  it('keeps BrandMark sizes on the 16/24/32/48 grid', () => {
    const div = document.createElement('div');
    div.innerHTML = ['header', 'auth', 'marketing']
      .map((size) => renderToStaticMarkup(<BrandLockup size={size as 'header' | 'auth' | 'marketing'} />))
      .join('');
    const sizes = [...div.querySelectorAll('[data-grafter-mark="mitre"]')].map((el) => el.getAttribute('width'));
    expect(sizes.sort()).toEqual(['16', '32', '48']);
  });

  it('pins computed header letter-spacing to 0.16em (2.08px at 13px) and kills inline -0.02em', () => {
    const style = document.createElement('style');
    style.textContent = '.tracking-\\[0\\.16em\\]{letter-spacing:0.16em}.text-\\[13px\\]{font-size:13px}';
    document.head.appendChild(style);
    const wrap = document.createElement('div');
    wrap.innerHTML = renderToStaticMarkup(<Wordmark size="header" />);
    document.body.appendChild(wrap);
    const wm = wrap.querySelector('[data-grafter-wordmark]') as HTMLElement | null;
    expect(wm).not.toBeNull();
    expect(wm?.style.letterSpacing).toBe('');
    expect(getComputedStyle(wm!).fontSize).toBe('13px');
    const pinned = getComputedStyle(wm!).letterSpacing;
    expect(pinned === '2.08px' || pinned === '0.16em').toBe(true);

    const mutant = wm!.cloneNode(true) as HTMLElement;
    mutant.style.letterSpacing = '-0.02em';
    wrap.appendChild(mutant);
    const mutantLs = getComputedStyle(mutant).letterSpacing;
    expect(mutantLs === '-0.26px' || mutantLs === '-0.02em').toBe(true);
    expect(mutantLs).not.toBe(pinned);
    wrap.remove();
    style.remove();
  });
});
