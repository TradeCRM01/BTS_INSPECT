import type { GenericReportData, GenericSection, GenericAnswer } from './types';
import type { TemplateSchema } from '../../types/template';
import { evaluateCondition } from '../../lib/conditionEval';
import { format } from 'date-fns';

interface ComposeInput {
  inspection: {
    id: string;
    meta: Record<string, string>;
    responses: Record<string, unknown>;
    completed_at?: string | null;
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
  };
  photos: Array<{ question_id: string; instance_id?: string | null; storage_path: string; url?: string }>;
  reportNumber: string;
}

export function composeGenericReport(input: ComposeInput): GenericReportData {
  const { inspection, template, profile, company, photos, reportNumber } = input;
  const { responses, meta } = inspection;

  const sections: GenericSection[] = [];

  for (const sec of template.schema.sections) {
    if (sec.showIf && !evaluateCondition(sec.showIf, responses)) continue;

    if (sec.isRepeating) {
      const instanceIds = Object.keys(responses)
        .filter(k => {
          const parts = k.split('__');
          return parts.length === 2 && sec.questions.some(q => q.id === parts[0]);
        })
        .map(k => k.split('__')[1])
        .filter((v, i, a) => a.indexOf(v) === i);

      const instances = instanceIds.map((instanceId, idx) => {
        const answers: GenericAnswer[] = sec.questions
          .filter(q => !q.showIf || evaluateCondition(q.showIf, responses))
          .map(q => {
            const key = `${q.id}__${instanceId}`;
            const qPhotos = photos
              .filter(p => p.question_id === q.id && p.instance_id === instanceId)
              .map(p => ({ url: p.url ?? '', caption: p.storage_path }));
            return {
              label: q.label,
              type: q.type,
              value: responses[key] ?? null,
              required: q.required,
              yesNoLabels: q.yesNoLabels,
              photos: qPhotos.length > 0 ? qPhotos : undefined,
            };
          });
        const firstText = answers.find(a => a.value && a.type === 'text');
        const label = firstText ? String(firstText.value) : `${sec.repeatLabel ?? 'Item'} ${idx + 1}`;
        return { instanceId, label, answers };
      });

      sections.push({
        id: sec.id,
        title: sec.title,
        description: sec.description,
        isRepeating: true,
        answers: [],
        instances,
      });
      continue;
    }

    const answers: GenericAnswer[] = sec.questions
      .filter(q => !q.showIf || evaluateCondition(q.showIf, responses))
      .map(q => {
        const qPhotos = photos
          .filter(p => p.question_id === q.id && !p.instance_id)
          .map(p => ({ url: p.url ?? '', caption: p.storage_path }));
        return {
          label: q.label,
          type: q.type,
          value: responses[q.id] ?? null,
          required: q.required,
          yesNoLabels: q.yesNoLabels,
          photos: qPhotos.length > 0 ? qPhotos : undefined,
        };
      });

    sections.push({
      id: sec.id,
      title: sec.title,
      description: sec.description,
      isRepeating: false,
      answers,
    });
  }

  // Find first signature question value — stored as data URL string or legacy { url } object
  let signatureUrl: string | undefined;
  for (const sec of template.schema.sections) {
    for (const q of sec.questions) {
      if (q.type === 'signature') {
        const val = responses[q.id];
        if (typeof val === 'string' && val) { signatureUrl = val; break; }
        if (val && typeof val === 'object' && (val as { url?: string }).url) {
          signatureUrl = (val as { url: string }).url; break;
        }
      }
    }
    if (signatureUrl) break;
  }

  return {
    reportNumber,
    issueDate: format(new Date(), 'd MMMM yyyy'),
    templateName: template.name,
    siteName: meta.siteName,
    siteAddress: meta.siteAddress,
    clientName: meta.clientName,
    jobNumber: meta.jobNumber,
    inspectorName: profile.name,
    companyName: company.name,
    companyAbn: company.abn ?? undefined,
    companyPhone: company.phone ?? undefined,
    companyEmail: company.email ?? undefined,
    companyWebsite: company.website ?? undefined,
    companyLogoUrl: company.logo_url ?? undefined,
    sections,
    signatureUrl,
    signoffDate: inspection.completed_at
      ? format(new Date(inspection.completed_at), 'd MMMM yyyy')
      : format(new Date(), 'd MMMM yyyy'),
  };
}
