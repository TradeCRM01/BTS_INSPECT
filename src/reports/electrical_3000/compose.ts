import type { ElectricalReportData } from './types';
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
  template: { name: string; schema: TemplateSchema };
  profile: { name: string; licence_number?: string | null };
  company: {
    name: string;
    abn?: string | null;
    licence_number?: string | null;
    phone?: string | null;
    website?: string | null;
    logo_url?: string | null;
  };
  photos: Array<{ question_id: string; instance_id?: string | null; storage_path: string; url?: string }>;
  reportNumber: string;
}

export function composeElectricalReport(input: ComposeInput): ElectricalReportData {
  const { inspection, template, profile, company, photos, reportNumber } = input;
  const { responses, meta } = inspection;
  const schema = template.schema;

  // Build sections exactly like generic renderer — direct pass-through, no pattern matching
  const sections = schema.sections
    .filter(sec => !sec.showIf || evaluateCondition(sec.showIf, responses))
    .map(sec => {
      if (sec.isRepeating) {
        // Gather unique instance IDs from responses
        const instanceIds = Object.keys(responses)
          .filter(k => {
            const parts = k.split('__');
            if (parts.length !== 2) return false;
            return sec.questions.some(q => q.id === parts[0]);
          })
          .map(k => k.split('__')[1])
          .filter((v, i, a) => a.indexOf(v) === i);

        const instances = instanceIds.map(instanceId => {
          const answers = sec.questions
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

          // Use first text answer as instance label
          const firstText = answers.find(a => a.value && a.type === 'text');
          const label = firstText ? String(firstText.value) : `Item ${instanceIds.indexOf(instanceId) + 1}`;
          return { instanceId, label, answers };
        });

        return { id: sec.id, title: sec.title, description: sec.description, isRepeating: true, answers: [], instances };
      }

      const answers = sec.questions
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

      return { id: sec.id, title: sec.title, description: sec.description, isRepeating: false, answers, instances: undefined };
    });

  return {
    meta: {
      reportNumber,
      issueDate: format(new Date(), 'd MMMM yyyy'),
      site: meta.siteName ?? '',
      siteAddress: meta.siteAddress ?? '',
      client: meta.clientName ?? '',
      inspector: profile.name,
      licenceNumber: profile.licence_number ?? '',
      dateOfTest: inspection.completed_at
        ? format(new Date(inspection.completed_at), 'd MMMM yyyy')
        : format(new Date(), 'd MMMM yyyy'),
    },
    sections,
    company: {
      name: company.name,
      abn: company.abn ?? undefined,
      licenceNumber: company.licence_number ?? undefined,
      phone: company.phone ?? undefined,
      website: company.website ?? undefined,
      logoUrl: company.logo_url ?? undefined,
    },
  };
}
