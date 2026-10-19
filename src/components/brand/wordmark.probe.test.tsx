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
    }
  });
});
