import { pdf } from '@react-pdf/renderer';
import React from 'react';
import { registerFonts } from './shared/fonts';
import { composeJhaReport } from './jha/compose';
import { JhaReportRenderer } from './jha/Renderer';
import type { JhaTemplateSchema, JhaStep, JhaSignOff } from '../types/jha';
import { signedPhotoUrl } from '../lib/jhaPhotos';
import { supabase } from '../lib/supabase';

interface JhaGenerateInput {
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
    report_theme?: Record<string, unknown> | null;
  };
  reportNumber: string;
  /** Client pack: includes SWMS + photo appendix emphasis */
  packMode?: boolean;
}

export function jhaPdfCompanyFrom(company: {
  name: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  report_theme?: Record<string, unknown> | null;
}) {
  return {
    name: company.name,
    abn: company.abn ?? null,
    phone: company.phone ?? null,
    email: company.email ?? null,
    website: company.website ?? null,
    logo_url: company.logo_url ?? null,
    report_theme: company.report_theme ?? null,
  };
}

let fontsRegistered = false;

export async function generateJhaPdf(input: JhaGenerateInput): Promise<Blob> {
  if (!fontsRegistered) {
    registerFonts();
    fontsRegistered = true;
  }

  const photoUrlMap = new Map<string, string>();
  for (const step of input.document.steps || []) {
    for (const photo of step.photos || []) {
      if (photoUrlMap.has(photo.storagePath)) continue;
      const url = await signedPhotoUrl(photo.storagePath, 60 * 60);
      if (url) photoUrlMap.set(photo.storagePath, url);
    }
  }

  let linkedSwmsDocs: Array<{ id: string; title: string; filename: string }> = [];
  try {
    const ids = (() => {
      const raw = input.document.meta.linkedSwmsIds;
      if (!raw) return [] as string[];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    })();
    if (ids.length) {
      const { data } = await supabase
        .from('jha_swms_library')
        .select('id, title, filename')
        .in('id', ids);
      linkedSwmsDocs = (data ?? []).map(d => ({
        id: d.id,
        title: d.title,
        filename: d.filename,
      }));
    }
  } catch {
    linkedSwmsDocs = [];
  }

  const data = composeJhaReport({
    ...input,
    photoUrlMap,
    packMode: input.packMode,
    linkedSwmsDocs,
  });
  const element = React.createElement(JhaReportRenderer, { data }) as unknown as React.ReactElement;
  const blob = await pdf(element).toBlob();
  return blob;
}
