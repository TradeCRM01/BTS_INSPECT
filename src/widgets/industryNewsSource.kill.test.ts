import { describe, expect, it } from 'vitest';
import { industryNewsSource } from './industryNewsSource';

describe('industry news byline', () => {
  it('kills a blank author that would print · 1 day ago', () => {
    expect(industryNewsSource('', '')).toBe('Industry');
    expect(industryNewsSource('', 'Wire')).toBe('Wire');
    expect(industryNewsSource('Jane', 'Wire')).toBe('Jane');
    const byline = `${industryNewsSource('', '')} · 1 day ago`;
    expect(byline).toBe('Industry · 1 day ago');
    expect(byline.startsWith(' · ')).toBe(false);
  });
});
