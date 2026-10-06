import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  jobRelatedShowEmpty,
  jobSheetHeaderPrimaryHeld,
  listQueryBusy,
  listSectionLoadError,
  listShowEmpty,
} from './listQueryReady';
import { reportsListShowEmpty } from './reportsList';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('list loading truth', () => {
  it('drive empty waits until allReports resolves — look fixtures still empty', () => {
    expect(reportsListShowEmpty({ allReports: undefined, itemCount: 0 })).toBe(false);
    expect(reportsListShowEmpty({ allReports: [], itemCount: 0 })).toBe(true);
    expect(reportsListShowEmpty({ allReports: [{ id: '1' }], itemCount: 1 })).toBe(false);
    expect(reportsListShowEmpty({ seeded: true, allReports: undefined, itemCount: 0 })).toBe(true);
    expect(reportsListShowEmpty({ seeded: true, allReports: undefined, itemCount: 2 })).toBe(false);

    const page = src('src/pages/ReportsListPage.tsx');
    expect(page).toContain('reportsListShowEmpty');
    expect(page).toContain('isPending: reportsPending');
    expect(page).toContain('listQueryBusy({');
    expect(page).toContain('data: allReports');
    expect(page).toContain('seeded: lookReportsList');
    expect(page).toContain('No reports yet');
    expect(page).not.toContain('&& !allReports && !allUploads');
    expect(page).not.toMatch(/Relovi|Littleloop/);
  });

  it('contracts empty waits for listQueryBusy so the create CTA stays hidden', () => {
    expect(listQueryBusy({ isPending: true, data: undefined })).toBe(true);
    expect(listShowEmpty(true, 0)).toBe(false);
    expect(listShowEmpty(false, 0)).toBe(true);
    expect(listShowEmpty(false, 2)).toBe(false);

    const page = src('src/pages/ContractsPage.tsx');
    expect(page).toContain('isPending');
    expect(page).toContain('listQueryBusy({ isPending, isLoading, isError, data: contracts })');
    expect(page).toContain('showContractsEmpty = listShowEmpty(busy, filtered.length, isError)');
    expect(page).toContain('listPendingNounCount(countsHeld, totals.total, \'total contracts\')');
    expect(page).toContain('listPendingCount(countsHeld, count)');
    expect(page).toContain('listPendingCount(countsHeld, totals.total)');
    expect(page).toContain("countsHeld ? '…' : formatMoney(totals.activeValue)");
    expect(page).toContain('listPendingCount(countsHeld, totals.dueSoon)');
    expect(page).toContain('listPendingCount(countsHeld, totals.overdue)');
    expect(page).toContain("listSectionLoadError('contracts')");
    expect(page).toContain('data-list-load-error="contracts"');
    expect(page).toContain('isError ?');
    expect(page).toContain('Retry');
    expect(page).not.toContain('retryLabel="Retry"');
    expect(page).not.toContain('PageError');
    expect(page).not.toContain('pageQueryBlocked');
    expect(page).not.toContain('Could not load contracts');
    expect(page.indexOf('<SkeletonRow />')).toBeLessThan(page.indexOf('showContractsEmpty ?'));
    expect(page.indexOf('showContractsEmpty ?')).toBeLessThan(page.indexOf('No contracts yet'));
    expect(page.indexOf('showContractsEmpty ?')).toBeLessThan(page.indexOf('Create your first contract'));
    expect(page).toContain('No contracts yet');
    expect(page).toContain('Create your first contract');
    expect(page).not.toMatch(/Relovi|Littleloop/);
  });

  it('job-related empty and Start inspection wait for the loading prop', () => {
    expect(jobRelatedShowEmpty(true, 0)).toBe(false);
    expect(jobRelatedShowEmpty(false, 0)).toBe(true);
    expect(jobRelatedShowEmpty(undefined, 0)).toBe(true);
    expect(jobRelatedShowEmpty(true, 3)).toBe(false);
    expect(jobRelatedShowEmpty(false, 0, true)).toBe(false);

    const tray = src('src/components/jobs/JobRelatedSection.tsx');
    expect(tray).toContain('loading?: boolean');
    expect(tray).toContain('data-related-loading');
    expect(tray.indexOf('{loading ?')).toBeLessThan(tray.indexOf('showEmpty ?'));
    expect(tray.indexOf('showEmpty ?')).toBeLessThan(tray.indexOf('{emptyTitle}'));

    const job = src('src/pages/JobDetailPage.tsx');
    expect(job).toContain('loading={jhasBusy}');
    expect(job).toContain('loading={take5sBusy}');
    expect(job).toContain('loading={inspectionsBusy}');
    expect(job).toContain('loading={quotesBusy}');
    expect(job).toContain('loading={invoicesBusy}');
    expect(job).toContain('loading={timesheetsBusy}');
    const inspTray = job.slice(job.indexOf('id="job-insp"'));
    expect(inspTray).toContain('Start inspection');
    expect(inspTray.indexOf('loading={inspectionsBusy}')).toBeLessThan(inspTray.indexOf('Start inspection'));

    const client = src('src/pages/ClientDetailPage.tsx');
    expect(client).toContain('jobsBusy');
    expect(client).toContain('data-jobs-loading');
    expect(client).toContain('loading={quotesBusy}');
    expect(client).toContain('loading={invoicesBusy}');
    expect(client).toContain('loading={inspectionsBusy}');
    expect(client).toContain('loading={complianceBusy}');
    expect(client).toContain("enabled: !!id && !!profile && jobs !== undefined");
    expect(client).toContain('No jobs yet');
    expect(client.indexOf('jobsBusy')).toBeLessThan(client.indexOf('No jobs yet'));
    expect(client).toContain('isError: jobsError || inspectionsError');
    expect(job).toContain('isError: take5sError || jhasError');
    expect(job).toContain('data-job-next-held');
    expect(job).toContain('jobSheetHeaderPrimaryHeld');
    expect(job).toContain('jhaBusy: jhasBusy');
    expect(job).toContain('inspectionsBusy');
    expect(job).toContain('jhasPending');
    expect(job).toContain('inspectionsPending');
    expect(job).toContain('jhasError');
    expect(job).toContain('inspectionsError');
    expect(job).toContain('data-overview-retry={row.section}');
    expect(job).toContain('row.retry');
    expect(job).toContain('void refetchJhas()');
    expect(job).toContain('void refetchTake5s()');
    expect(job).toContain('void refetchInspections()');
    expect(job).toContain('void refetchQuotes()');
    expect(job).toContain('void refetchInvoices()');
    expect(job).toContain('void refetchTeamMembers()');
    expect(job).toContain('void refetchVisitNotes()');
    expect(job).toContain('void refetchJobPhotos()');
    expect(job).toContain('void refetchCostTotals()');
    expect(job).toContain('crewBusy');
    expect(job).toContain('quotesBusy');
    expect(job).toContain('billBusy');
    expect(job).toContain('notesBusy');
    expect(job).toContain('photosBusy');
    expect(job).toContain('timesheetsPending');
    expect(job).toContain('clientPending');
    expect(job).toContain('data-job-contact-held');
    expect(job).toContain('contactHeld');
    expect(job).not.toMatch(/Relovi|Littleloop/);
    expect(client).not.toMatch(/Relovi|Littleloop/);
  });

  it('error is not busy, not empty, and the job header holds Start inspection', () => {
    expect(listQueryBusy({ isPending: true, isError: true, data: undefined })).toBe(false);
    expect(listShowEmpty(false, 0, true)).toBe(false);
    expect(listSectionLoadError('invoices')).toBe("Couldn't load invoices.");
    expect(jobSheetHeaderPrimaryHeld({
      nextKey: 'inspect',
      inspectionsPending: true,
    })).toBe(true);
    expect(jobSheetHeaderPrimaryHeld({
      nextKey: 'inspect',
      inspectionsPending: false,
      inspectionsError: true,
    })).toBe(false);

    const tray = src('src/components/jobs/JobRelatedSection.tsx');
    expect(tray).toContain('error ?');
    expect(tray).toContain('ListSectionLoadError');
    expect(tray.indexOf('{loading ?')).toBeLessThan(tray.indexOf('error ?'));
    expect(tray.indexOf('error ?')).toBeLessThan(tray.indexOf('showEmpty ?'));

    const contracts = src('src/pages/ContractsPage.tsx');
    expect(contracts).toContain("listSectionLoadError('contracts')");
    expect(contracts).toContain('data-list-load-error="contracts"');
    expect(contracts).toContain('isError ?');
    expect(contracts).toContain('Retry');
    expect(contracts).not.toContain('PageError');
    expect(contracts).not.toContain('pageQueryBlocked');

    const job = src('src/pages/JobDetailPage.tsx');
    expect(job).toContain('data-overview-retry={row.section}');
    expect(job).toContain('row.retry');
    expect(job).toContain('Retry');

    const drive = src('src/pages/ReportsListPage.tsx');
    expect(drive).toContain('isError: Boolean(foldersError)');
    expect(drive).toContain('isError: Boolean(uploadsError)');
    expect(drive).toContain("listSectionLoadError('folders')");
    expect(drive).toContain("listSectionLoadError('uploads')");
  });

  it('inline Retry hit areas are 44px without changing global ops-link', () => {
    const hit = 'inline-flex items-center min-h-[44px] px-2';
    const overview = src('src/pages/JobDetailPage.tsx');
    const overviewRetry = overview.slice(
      overview.indexOf('action={row.retry'),
      overview.indexOf('</button>', overview.indexOf('action={row.retry')),
    );
    expect(overviewRetry).toContain(hit);
    expect(overviewRetry).toContain('data-overview-retry');
    expect(overviewRetry).toContain('stopPropagation');

    const contracts = src('src/pages/ContractsPage.tsx');
    const contractsRetry = contracts.slice(
      contracts.indexOf('data-list-load-error="contracts"'),
      contracts.indexOf('</button>', contracts.indexOf('data-list-load-error="contracts"')),
    );
    expect(contractsRetry).toContain(hit);

    const tray = src('src/components/jobs/JobRelatedSection.tsx');
    const trayRetry = tray.slice(
      tray.indexOf('export function ListSectionLoadError'),
      tray.indexOf('export function JobRelatedSection'),
    );
    expect(trayRetry).toContain(hit);
    expect(trayRetry).toContain('onClick={onRetry}');

    const css = src('src/index.css');
    const opsLink = css.slice(css.indexOf('  .ops-link {'), css.indexOf('}', css.indexOf('  .ops-link {')));
    expect(opsLink).not.toContain('min-h-[44px]');
  });
});
