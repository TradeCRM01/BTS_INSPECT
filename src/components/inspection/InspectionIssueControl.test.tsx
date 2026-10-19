/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueInspectionRecord, persistGeneratedReportPdf, type ReportPdfStore } from '../../lib/sendReport';
import { InspectionIssueControl } from './InspectionIssueControl';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('inspection issue action', () => {
  it('issues only from the Issue control, not from generating the PDF', async () => {
    const issued: string[] = [];
    const store: ReportPdfStore & { issued: string[] } = {
      issued,
      upload: async () => ({ error: null }),
      insertReport: async () => ({ error: null }),
      updateReportPath: async () => ({ error: null }),
      remove: async () => undefined,
    };
    const generated = await persistGeneratedReportPdf({
      inspectionId: 'insp-1',
      companyId: 'co-1',
      reportNumber: 'BTS-1',
      siteName: 'Plant',
      blob: new Blob(['pdf']),
      inspectionStatus: 'completed',
    }, store);
    expect(generated.ok).toBe(true);
    expect(issued).toEqual([]);

    const onIssue = vi.fn();
    await act(async () => {
      root.render(
        <InspectionIssueControl status="completed" hasReport onIssue={onIssue} />,
      );
    });
    const button = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent === 'Issue');
    if (!button) throw new Error('missing Issue');
    await act(async () => {
      button.click();
    });
    expect(onIssue).toHaveBeenCalledTimes(1);

    const result = await issueInspectionRecord('insp-1', 'completed', async id => {
      issued.push(id);
      return { error: null };
    });
    expect(result).toEqual({ ok: true });
    expect(issued).toEqual(['insp-1']);
  });

  it('hides Issue after the inspection is already issued', async () => {
    await act(async () => {
      root.render(
        <InspectionIssueControl status="issued" hasReport onIssue={() => undefined} />,
      );
    });
    expect(container.textContent).not.toContain('Issue');
  });
});
