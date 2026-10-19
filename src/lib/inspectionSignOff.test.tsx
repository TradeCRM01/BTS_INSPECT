/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { InspectionSignatureBlock } from '../reports/generic_inspection/chrome';
import { inspectionDocumentColors } from '../reports/generic_inspection/theme';
import { inspectionSignOffCopy } from './inspectionSignOff';

function texts(node: unknown): string[] {
  if (node == null) return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (typeof node === 'object' && 'props' in node) {
    return texts((node as { props?: { children?: unknown } }).props?.children);
  }
  return [];
}

describe('inspection PDF sign-off wording', () => {
  it('says completed by name and date when no signature was captured', () => {
    const tree = InspectionSignatureBlock({
      name: 'Grafter CoS Test',
      date: '19 October 2026',
      colors: inspectionDocumentColors(null),
    });
    const joined = texts(tree).join(' ');
    expect(joined).toContain('Completed by Grafter CoS Test on 19 October 2026');
    expect(joined).not.toMatch(/Digitally Signed/i);
    expect(inspectionSignOffCopy({
      hasSignature: false,
      name: 'Grafter CoS Test',
      date: '19 October 2026',
    }).badge).toBe('Completed by Grafter CoS Test on 19 October 2026');
  });

  it('keeps digitally signed only when a signature image exists', () => {
    const tree = InspectionSignatureBlock({
      signatureUrl: 'data:image/png;base64,aaa',
      name: 'Grafter CoS Test',
      date: '19 October 2026',
      colors: inspectionDocumentColors(null),
    });
    const joined = texts(tree).join(' ');
    expect(joined).toContain('Digitally Signed');
    expect(joined).not.toContain('Completed by Grafter CoS Test on 19 October 2026');
  });
});
