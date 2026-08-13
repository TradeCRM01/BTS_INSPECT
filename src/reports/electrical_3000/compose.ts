import type { ElectricalReportData } from './types';
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
import { parseReportTheme, type PdfThemeTokens } from '../shared/styles';

interface ComposeInput {
  inspection: {
    id: string;
    meta: Record<string, string>;
    responses: Record<string, unknown>;
    completed_at?: string | null;
    doc_version?: number | null;
    amendment_reason?: string | null;
  };
  template: { name: string; schema: TemplateSchema };
  profile: { name: string; licence_number?: string | null };
  company: {
    name: string;
    abn?: string | null;
    licence_number?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    logo_url?: string | null;
    report_theme?: PdfThemeTokens | Record<string, unknown> | null;
  };
  photos: InspectionPhotoIn[];
  reportNumber: string;
}

export function composeElectricalReport(input: ComposeInput): ElectricalReportData {
  const { inspection, template, profile, company, photos, reportNumber } = input;
  const { responses, meta } = inspection;

  const sections = composeInspectionSections(template.schema, responses, photos);
  const overallVerdict = computeOverallVerdict(sections);
  const signatures = collectSignatures(sections, profile.name);
  const photoAppendix = collectPhotoAppendix(sections);
  const customFields = composeCustomFields(template.schema, meta);
  const defects = collectDefects(sections);
  const countersignatures = parseCountersignatures(meta.countersignatures).map(c => ({
    roleLabel: c.roleLabel,
    name: c.name,
    signatureUrl: c.signature || undefined,
    date: c.date,
  }));

  // Electrical defaults to schedule layout for repeating verification blocks
  const layoutMode = template.schema.meta.layoutMode ?? 'test_schedule';

  return {
    meta: {
      reportNumber,
      issueDate: format(new Date(), 'd MMMM yyyy'),
      site: meta.siteName ?? '',
      siteAddress: meta.siteAddress ?? '',
      client: meta.clientName ?? '',
      jobNumber: meta.jobNumber,
      inspector: profile.name,
      licenceNumber: profile.licence_number ?? '',
      dateOfTest: inspection.completed_at
        ? format(new Date(inspection.completed_at), 'd MMMM yyyy')
        : format(new Date(), 'd MMMM yyyy'),
    },
    customFields,
    overallVerdict,
    overallVerdictLabel: verdictLabel(overallVerdict),
    layoutMode,
    theme: parseReportTheme(company.report_theme),
    docVersion: inspection.doc_version ?? 1,
    amendmentReason: inspection.amendment_reason || meta.amendmentReason || undefined,
    sections,
    defects,
    signatures,
    countersignatures,
    photoAppendix,
    company: {
      name: company.name,
      abn: company.abn ?? undefined,
      licenceNumber: company.licence_number ?? undefined,
      phone: company.phone ?? undefined,
      email: company.email ?? undefined,
      website: company.website ?? undefined,
      logoUrl: company.logo_url ?? undefined,
    },
  };
}
