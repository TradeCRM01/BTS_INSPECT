/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { templateQuestionDeleteCopy } from './templateEditorGuard';

describe('template question delete copy', () => {
  it('names the question on the delete confirm', () => {
    const copy = templateQuestionDeleteCopy('Water off at meter');
    expect(copy.title).toBe('Delete this question?');
    expect(copy.message).toContain('Water off at meter');
    expect(copy.confirmLabel).toBe('Delete');
  });
});
