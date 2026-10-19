import { isFinalisedInspection } from './isFinalisedInspection';

export type InspectionPrintMeta = Record<string, string | undefined> | null | undefined;

export type InspectionPrintSnapshots = {
  clientName?: string | null;
  jobTitle?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
};

export type InspectionPrintFields = {
  clientName: string;
  jobTitle: string;
  siteName: string;
  siteAddress: string;
};

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = (value ?? '').trim();
    if (text) return text;
  }
  return '';
}

export function inspectionPrintSnapshotsFromRow(row: {
  client_name_snapshot?: string | null;
  job_title_snapshot?: string | null;
  site_name_snapshot?: string | null;
  site_address_snapshot?: string | null;
} | null | undefined): InspectionPrintSnapshots {
  return {
    clientName: row?.client_name_snapshot ?? null,
    jobTitle: row?.job_title_snapshot ?? null,
    siteName: row?.site_name_snapshot ?? null,
    siteAddress: row?.site_address_snapshot ?? null,
  };
}

export function resolveInspectionPrintFields(args: {
  meta?: InspectionPrintMeta;
  snapshots?: InspectionPrintSnapshots | null;
  live?: InspectionPrintSnapshots | null;
  finalised?: boolean;
}): InspectionPrintFields {
  const meta = args.meta ?? {};
  const snapshots = args.snapshots ?? {};
  const live = args.finalised ? {} : (args.live ?? {});
  return {
    clientName: firstText(meta.clientName, snapshots.clientName, live.clientName),
    jobTitle: firstText(meta.jobDescription, snapshots.jobTitle, live.jobTitle),
    siteName: firstText(meta.siteName, snapshots.siteName, live.siteName),
    siteAddress: firstText(meta.siteAddress, snapshots.siteAddress, live.siteAddress),
  };
}

export function resolveInspectionPrintFieldsFromRow(row: {
  meta?: InspectionPrintMeta;
  status?: string | null;
  archived?: boolean | null;
  client_name_snapshot?: string | null;
  job_title_snapshot?: string | null;
  site_name_snapshot?: string | null;
  site_address_snapshot?: string | null;
} | null | undefined, live?: InspectionPrintSnapshots | null): InspectionPrintFields {
  return resolveInspectionPrintFields({
    meta: row?.meta,
    snapshots: inspectionPrintSnapshotsFromRow(row),
    live,
    finalised: isFinalisedInspection(row?.status, row?.archived),
  });
}
