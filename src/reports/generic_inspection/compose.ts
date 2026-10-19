import type { GenericReportData } from './types';
import type { TemplateSchema } from '../../types/template';
import { parseCountersignatures } from '../../types/template';
import { format } from 'date-fns';
import {
  composeInspectionSections,
  composeCustomFields,
  computeOverallVerdict,
  verdictLabel,
  collectSignatures,
  collectPhotoAppendix,
  collectDefects,
  type InspectionPhotoIn,
} from '../shared/inspectionCompose';
import type { PdfThemeTokens } from '../shared/styles';
import { companyDocumentLogoUrl } from '../../lib/companyLogo';
import { resolveInspectorIdentity } from '../../lib/inspectorSnapshot';
import { resolveInspectionPrintFields } from '../../lib/inspectionPrintSnapshot';
import { inspectionReportTheme } from './theme';

interface ComposeInput {
  inspection: {
    id: string;
    meta: Record<string, string>;
    responses: Record<string, unknown>;
    completed_at?: string | null;
    doc_version?: number | null;
    amendment_reason?: string | null;
    inspector_id?: string | null;
    inspector_name_snapshot?: string | null;
    inspector_licence_snapshot?: string | null;
    client_name_snapshot?: string | null;
    job_title_snapshot?: string | null;
    site_name_snapshot?: string | null;
    site_address_snapshot?: string | null;
  };
  template: {
    name: string;
    schema: TemplateSchema;
  };
  profile: {
    name: string;
    licence_number?: string | null;
  };
  company: {
    name: string;
    abn?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    logo_url?: string | null;
    report_theme?: PdfThemeTokens | Record<string, unknown> | null;
  };
  photos: InspectionPhotoIn[];
  reportNumber: string;
}

export function composeGenericReport(input: ComposeInput): GenericReportData {
  const { inspection, template, profile, company, photos, reportNumber } = input;
  const { responses, meta } = inspection;

  const inspector = resolveInspectorIdentity({
    inspectorId: inspection.inspector_id,
    live: { name: profile.name, licence: profile.licence_number },
    snapshot: {
      name: inspection.inspector_name_snapshot,
      licence: inspection.inspector_licence_snapshot,
    },
  });
  const printed = resolveInspectionPrintFields({
    meta,
    snapshots: {
      clientName: inspection.client_name_snapshot,
      jobTitle: inspection.job_title_snapshot,
      siteName: inspection.site_name_snapshot,
      siteAddress: inspection.site_address_snapshot,
    },
    finalised: true,
  });
  const sections = composeInspectionSections(template.schema, responses, photos);
  const overallVerdict = computeOverallVerdict(sections);
  const signatures = collectSignatures(sections, inspector.name);
  const photoAppendix = collectPhotoAppendix(sections);
  const customFields = composeCustomFields(template.schema, meta);
  const defects = collectDefects(sections);
  const countersignatures = parseCountersignatures(meta.countersignatures).map(c => ({
    roleLabel: c.roleLabel,
    name: c.name,
    signatureUrl: c.signature || undefined,
    date: c.date,
  }));

  return {
    reportNumber,
    issueDate: format(new Date(), 'd MMMM yyyy'),
    templateName: template.name,
    siteName: printed.siteName || undefined,
    siteAddress: printed.siteAddress || undefined,
    clientName: printed.clientName || undefined,
    jobNumber: meta.jobNumber,
    jobDescription: printed.jobTitle || undefined,
    customFields,
    inspectorName: inspector.name,
    inspectorLicence: inspector.licence ?? undefined,
    companyName: company.name,
    companyAbn: company.abn ?? undefined,
    companyPhone: company.phone ?? undefined,
    companyEmail: company.email ?? undefined,
    companyWebsite: company.website ?? undefined,
    companyLogoUrl: companyDocumentLogoUrl(company) ?? undefined,
    overallVerdict,
    overallVerdictLabel: verdictLabel(overallVerdict),
    layoutMode: template.schema.meta.layoutMode ?? 'checklist',
    theme: inspectionReportTheme(company.report_theme),
    docVersion: inspection.doc_version ?? 1,
    amendmentReason: inspection.amendment_reason || meta.amendmentReason || undefined,
    sections,
    defects,
    signatures,
    countersignatures,
    photoAppendix,
    signatureUrl: signatures[0]?.signatureUrl,
    signoffDate: inspection.completed_at
      ? format(new Date(inspection.completed_at), 'd MMMM yyyy')
      : format(new Date(), 'd MMMM yyyy'),
  };
}
