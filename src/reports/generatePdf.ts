import { pdf } from '@react-pdf/renderer';
import React from 'react';
import { registerFonts } from './shared/fonts';
import { reportRegistry, type RendererKey } from './registry';
import type { TemplateSchema } from '../types/template';

interface GenerateInput {
  inspection: {
    id: string;
    meta: Record<string, string>;
    responses: Record<string, unknown>;
    completed_at?: string | null;
  };
  template: {
    name: string;
    schema: TemplateSchema;
    report_renderer: string;
  };
  profile: {
    name: string;
    licence_number?: string | null;
  };
  company: {
    name: string;
    abn?: string | null;
    licence_number?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    logo_url?: string | null;
  };
  photos: Array<{ question_id: string; instance_id?: string | null; storage_path: string; url?: string }>;
  reportNumber: string;
}

function getRendererKey(rendererName: string): RendererKey {
  // Map known renderers directly
  if (rendererName === 'electrical_3000' || rendererName === 'generic_inspection') {
    return rendererName as RendererKey;
  }
  // Custom renderers default to generic
  return 'generic_inspection';
}

let fontsRegistered = false;

export async function generatePdf(input: GenerateInput): Promise<Blob> {
  if (!fontsRegistered) {
    registerFonts();
    fontsRegistered = true;
  }

  const rendererKey = getRendererKey(input.template.report_renderer);
  const entry = reportRegistry[rendererKey];

  const data = entry.compose(input as Parameters<typeof entry.compose>[0]);
  const Renderer = entry.Renderer as React.ComponentType<{ data: typeof data }>;

  const element = React.createElement(Renderer, { data }) as React.ReactElement<any>;
  const blob = await pdf(element).toBlob();
  return blob;
}
