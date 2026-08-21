import type {
  JhaReportData,
  JhaReportStep,
  JhaReportEmergencyContact,
  JhaReportCustomField,
  JhaReportCrewMember,
} from './types';
import type { JhaTemplateSchema, JhaStep, JhaSignOff } from '../../types/jha';
import {
  formatControlMeasuresText,
  hierarchyLabel,
  lxCProduct,
  matchRiskLevelId,
  maxAcceptableResidual,
  normalizeJhaStep,
  parseCrewSignOns,
} from '../../types/jha';
import { hrcwLabel, parseSwmsMeta } from '../../lib/swmsHrcw';
import { format } from 'date-fns';
import { jhaReportTheme } from './theme';
import type { PdfThemeTokens } from '../shared/styles';

interface ComposeInput {
  document: {
    id: string;
    meta: Record<string, string>;
    steps: JhaStep[];
    ppe: string[];
    sign_offs: JhaSignOff[];
    completed_at?: string | null;
    doc_version?: number;
    amendment_reason?: string | null;
  };
  template: {
    name: string;
    schema: JhaTemplateSchema;
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
    address?: string | null;
    report_theme?: PdfThemeTokens | Record<string, unknown> | null;
  };
  reportNumber: string;
  photoUrlMap?: Map<string, string>;
  packMode?: boolean;
  linkedSwmsDocs?: Array<{ id: string; title: string; filename: string }>;
}

function riskPill(
  riskId: string,
  riskById: Map<string, { label: string; color: string; score: number }>,
  product: number | null,
  levels: JhaTemplateSchema['riskLevels'],
) {
  if (riskId && riskById.has(riskId)) {
    const r = riskById.get(riskId)!;
    return { label: r.label, color: r.color, score: product ?? undefined };
  }
  if (product != null) {
    const id = matchRiskLevelId(product, levels);
    const r = riskById.get(id);
    if (r) return { label: r.label, color: r.color, score: product };
  }
  return null;
}

export function composeJhaReport(input: ComposeInput): JhaReportData {
  const { document, template, profile, company, reportNumber, photoUrlMap, packMode, linkedSwmsDocs } = input;
  const { schema } = template;
  const threshold = maxAcceptableResidual(schema);

  const riskById = new Map((schema.riskLevels ?? []).map(r => [r.id, r]));

  const steps: JhaReportStep[] = (document.steps || []).map(raw => {
    const s = normalizeJhaStep({ ...raw, id: raw.id || 'step' });
    const measures = s.controlMeasures ?? [];
    const inherentProduct = lxCProduct(s.likelihood, s.consequence);
    const residualProduct = lxCProduct(
      s.residualLikelihood || '',
      s.residualConsequence || '',
    );

    return {
      description: s.description || '',
      hazards: s.hazards || '',
      consequence: s.consequence || '',
      likelihood: s.likelihood || '',
      controls: formatControlMeasuresText(measures) || s.controls || '',
      controlMeasures: measures
        .filter(m => m.text.trim())
        .map(m => ({
          hierarchy: hierarchyLabel(m.hierarchy),
          text: m.text.trim(),
          owner: m.owner.trim(),
          verify: (m.verify ?? '').trim(),
        })),
      initialRisk: riskPill(s.initialRisk, riskById, inherentProduct, schema.riskLevels ?? []),
      residualRisk: riskPill(s.residualRisk, riskById, residualProduct, schema.riskLevels ?? []),
      residualLikelihood: s.residualLikelihood || '',
      residualConsequence: s.residualConsequence || '',
      residualEscalationNote: s.residualEscalationNote || '',
      inherentProduct,
      residualProduct,
      residualAboveThreshold: residualProduct != null && residualProduct > threshold,
      photos: (s.photos ?? [])
        .map(p => {
          const url = photoUrlMap?.get(p.storagePath);
          return url ? { url, caption: p.caption } : null;
        })
        .filter((x): x is { url: string; caption?: string } => !!x),
    };
  });

  const swmsParsed = parseSwmsMeta(document.meta.swms);
  const swms = swmsParsed.enabled
    ? {
        enabled: true,
        hrcwLabels: swmsParsed.hrcwCategories.map(hrcwLabel),
        principalContractor: swmsParsed.principalContractor,
        pcie: swmsParsed.pcie,
        emergencyProcedures: swmsParsed.emergencyProcedures,
        highRiskNotes: swmsParsed.highRiskNotes,
      }
    : null;

  const signOffs = (document.sign_offs || [])
    .filter(s => s.signature || s.name)
    .map(s => ({
      roleLabel: s.roleLabel,
      name: s.name,
      signature: s.signature || null,
      date: s.date || '',
    }));

  const rawContacts = (() => {
    const v = document.meta.emergencyContacts;
    if (!v) return [];
    try { return JSON.parse(v); } catch { return []; }
  })();
  const emergencyContacts: JhaReportEmergencyContact[] = rawContacts
    .filter((c: { name: string; phone: string; role: string }) => c.name || c.phone)
    .map((c: { name: string; phone: string; role: string }) => ({
      name: c.name || '',
      phone: c.phone || '',
      role: c.role || '',
    }));

  const customFields: JhaReportCustomField[] = (schema.meta.customFields ?? [])
    .map(f => {
      const value = (document.meta[`custom_${f.id}`] || '').trim();
      return value ? { label: f.label, value } : null;
    })
    .filter((x): x is JhaReportCustomField => !!x);

  const crewSignOns: JhaReportCrewMember[] = parseCrewSignOns(document.meta.crewSignOns)
    .filter(c => c.name.trim())
    .map(c => ({
      name: c.name.trim(),
      role: c.role.trim() || 'Worker',
      date: c.date || '',
      signed: !!c.signature,
      signature: c.signature || null,
    }));

  const linkedSwms = linkedSwmsDocs ?? [];

  return {
    reportNumber,
    issueDate: format(new Date(), 'd MMMM yyyy'),
    templateName: document.meta.documentTitle?.trim() || template.name || 'Job Hazard Analysis',
    taskName: document.meta.taskName || '',
    siteName: document.meta.siteName || '',
    date: document.meta.date || '',
    supervisor: document.meta.supervisor || '',
    inspectorName: profile.name,
    companyName: company.name,
    companyAbn: company.abn ?? undefined,
    companyPhone: company.phone ?? undefined,
    companyEmail: company.email ?? undefined,
    companyWebsite: company.website ?? undefined,
    companyLogoUrl: company.logo_url ?? undefined,
    companyAddress: company.address ?? undefined,
    theme: jhaReportTheme(company.report_theme),
    siteContact: document.meta.siteContact || undefined,
    clientName: document.meta.clientName || undefined,
    plantArea: document.meta.plantArea || undefined,
    shift: document.meta.shift || undefined,
    permitRefs: document.meta.permitRefs || undefined,
    musterPoint: document.meta.musterPoint || undefined,
    emergencyContacts,
    customFields,
    crewSignOns,
    maxAcceptableResidualScore: threshold,
    docVersion: document.doc_version ?? 1,
    amendmentReason: document.amendment_reason || document.meta.amendmentReason || undefined,
    packMode: !!packMode,
    swms,
    linkedSwms,
    steps,
    ppe: (document.ppe || []).map(label => {
      const opt = (schema.ppeOptions ?? []).find(p => p.label === label);
      return { label, standardRef: opt?.standardRef || undefined };
    }),
    signOffs,
    riskLevels: (schema.riskLevels ?? []).map(r => ({ id: r.id, label: r.label, color: r.color })),
    riskScoreMap: Object.fromEntries((schema.riskLevels ?? []).map(r => [r.id, r.score])),
  };
}
