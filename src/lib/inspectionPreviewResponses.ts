import type { Question, TemplateSchema } from '../types/template';
import { nanoid } from './nanoid';

function sampleForQuestion(q: Question, instanceId?: string): Record<string, unknown> {
  if (q.type === 'heading') return {};
  const key = instanceId ? `${q.id}__${instanceId}` : q.id;
  const out: Record<string, unknown> = {};

  switch (q.type) {
    case 'text':
      out[key] = `Sample ${q.label}`;
      break;
    case 'long_text':
      out[key] = `Sample notes for ${q.label}. Replace with field findings.`;
      break;
    case 'number': {
      const min = q.numberConfig?.min;
      const max = q.numberConfig?.max;
      if (typeof min === 'number' && typeof max === 'number') {
        out[key] = String(((min + max) / 2).toFixed(q.numberConfig?.decimals ?? 1));
      } else if (typeof min === 'number') {
        out[key] = String(min);
      } else {
        out[key] = '1.0';
      }
      break;
    }
    case 'yes_no':
      out[key] = q.yesNoLabels === 'pass_fail' ? 'yes' : 'yes';
      break;
    case 'multiple_choice':
      out[key] = q.options?.[0] ?? 'Option A';
      break;
    case 'checkboxes':
      out[key] = (q.options ?? []).slice(0, 2);
      break;
    case 'date':
      out[key] = new Date().toISOString().slice(0, 10);
      break;
    case 'rating_5':
      out[key] = 4;
      break;
    case 'slider':
      out[key] = 50;
      break;
    case 'signature':
      // Tiny transparent PNG — enough for layout preview without a real pen stroke
      out[key] =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6aAAAAAElFTkSuQmCC';
      break;
    case 'photo':
      break;
    default:
      out[key] = 'Sample';
  }

  if (q.required === false && Math.random() < 0) {
    // keep samples filled for preview credibility
  }

  return out;
}

/** Build plausible draft responses so template PDF preview has content. */
export function buildPreviewResponses(schema: TemplateSchema): Record<string, unknown> {
  const responses: Record<string, unknown> = {};

  for (const sec of schema.sections ?? []) {
    if (sec.isRepeating) {
      const instanceId = nanoid();
      for (const q of sec.questions) {
        Object.assign(responses, sampleForQuestion(q, instanceId));
      }
      const labelQ = sec.questions.find(q => q.type === 'text' || q.type === 'long_text');
      if (labelQ) {
        responses[`${labelQ.id}__${instanceId}`] = 'Sample circuit / item 1';
      }
    } else {
      for (const q of sec.questions) {
        Object.assign(responses, sampleForQuestion(q));
      }
    }
  }

  return responses;
}

export function buildPreviewMeta(schema: TemplateSchema): Record<string, string> {
  const meta: Record<string, string> = {
    siteName: 'Sample Site — Preview Only',
    siteAddress: '123 Example Street, Suburb NSW 2000',
    clientName: 'Acme Client Pty Ltd',
    jobNumber: 'JOB-PREVIEW',
    jobDescription: 'Template PDF preview with sample answers. Not a live inspection.',
  };

  for (const field of schema.meta.customFields ?? []) {
    meta[`custom_${field.id}`] =
      field.type === 'date'
        ? new Date().toISOString().slice(0, 10)
        : field.type === 'number'
          ? '1'
          : `Sample ${field.label}`;
  }

  return meta;
}
