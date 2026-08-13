import { pdf } from '@react-pdf/renderer';
import React from 'react';
import { registerFonts } from './shared/fonts';
import { reportRegistry, type RendererKey } from './registry';
import type { TemplateSchema } from '../types/template';
import { defaultPdfColors, parseReportTheme, pdfColors, resolvePdfColors } from './shared/styles';

interface GenerateInput {
  inspection: {
    id: string;
    meta: Record<string, string>;
    responses: Record<string, unknown>;
    completed_at?: string | null;
    doc_version?: number | null;
    amendment_reason?: string | null;
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
    report_theme?: Record<string, unknown> | null;
  };
  photos: Array<{ question_id: string; instance_id?: string | null; storage_path: string; url?: string; caption?: string | null }>;
  reportNumber: string;
}

function getRendererKey(rendererName: string): RendererKey {
  if (rendererName === 'electrical_3000' || rendererName === 'generic_inspection') {
    return rendererName as RendererKey;
  }
  return 'generic_inspection';
}

let fontsRegistered = false;

export async function generatePdf(input: GenerateInput): Promise<Blob> {
  if (!fontsRegistered) {
    registerFonts();
    fontsRegistered = true;
  }

  Object.assign(pdfColors, resolvePdfColors(parseReportTheme(input.company.report_theme)));

  try {
    const rendererKey = getRendererKey(input.template.report_renderer);
    const entry = reportRegistry[rendererKey];
    const data = entry.compose(input as Parameters<typeof entry.compose>[0]);
    const Renderer = entry.Renderer as React.ComponentType<{ data: typeof data }>;
    const element = React.createElement(Renderer, { data }) as React.ReactElement<any>;
    return await pdf(element).toBlob();
  } finally {
    Object.assign(pdfColors, defaultPdfColors);
  }
}
