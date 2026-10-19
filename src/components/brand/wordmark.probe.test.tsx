/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandLockup } from './BrandLockup';

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
});
