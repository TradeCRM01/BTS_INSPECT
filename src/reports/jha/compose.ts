import type { JhaReportData, JhaReportStep, JhaReportEmergencyContact } from './types';
import type { JhaTemplateSchema, JhaStep, JhaSignOff } from '../../types/jha';
import { format } from 'date-fns';

interface ComposeInput {
  document: {
    id: string;
    meta: Record<string, string>;
    steps: JhaStep[];
    ppe: string[];
    sign_offs: JhaSignOff[];
    completed_at?: string | null;
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
  };
  reportNumber: string;
}

export function composeJhaReport(input: ComposeInput): JhaReportData {
  const { document, template, profile, company, reportNumber } = input;
  const { schema } = template;

  const riskById = new Map(schema.riskLevels.map(r => [r.id, r]));

  const steps: JhaReportStep[] = (document.steps || []).map(s => ({
    description: s.description || '',
    hazards: s.hazards || '',
    consequence: s.consequence || '',
    likelihood: s.likelihood || '',
    controls: s.controls || '',
    initialRisk: s.initialRisk && riskById.has(s.initialRisk)
      ? { label: riskById.get(s.initialRisk)!.label, color: riskById.get(s.initialRisk)!.color }
      : null,
    residualRisk: s.residualRisk && riskById.has(s.residualRisk)
      ? { label: riskById.get(s.residualRisk)!.label, color: riskById.get(s.residualRisk)!.color }
      : null,
  }));

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

  return {
    reportNumber,
    issueDate: format(new Date(), 'd MMMM yyyy'),
    templateName: template.name,
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
    siteContact: document.meta.siteContact || undefined,
    emergencyContacts,
    steps,
    ppe: document.ppe || [],
    signOffs,
    riskLevels: schema.riskLevels.map(r => ({ id: r.id, label: r.label, color: r.color })),
    riskScoreMap: Object.fromEntries(schema.riskLevels.map(r => [r.id, r.score])),
  };
}
