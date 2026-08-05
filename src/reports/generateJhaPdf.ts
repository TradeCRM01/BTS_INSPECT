import { pdf } from '@react-pdf/renderer';
import React from 'react';
import { registerFonts } from './shared/fonts';
import { composeJhaReport } from './jha/compose';
import { JhaReportRenderer } from './jha/Renderer';
import type { JhaTemplateSchema, JhaStep, JhaSignOff } from '../types/jha';

interface JhaGenerateInput {
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

let fontsRegistered = false;

export async function generateJhaPdf(input: JhaGenerateInput): Promise<Blob> {
  if (!fontsRegistered) {
    registerFonts();
    fontsRegistered = true;
  }

  const data = composeJhaReport(input);
  const element = React.createElement(JhaReportRenderer, { data }) as unknown as React.ReactElement;
  const blob = await pdf(element).toBlob();
  return blob;
}
