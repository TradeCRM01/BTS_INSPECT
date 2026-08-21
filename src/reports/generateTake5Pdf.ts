import { pdf } from '@react-pdf/renderer';
import React from 'react';
import { registerFonts } from './shared/fonts';
import { Take5ReportRenderer, type Take5ReportData } from './take5/Renderer';
import { take5ReportTheme } from './take5/theme';

let fontsRegistered = false;

export function take5PdfCompanyFrom(company: {
  name: string;
  logo_url?: string | null;
  report_theme?: Record<string, unknown> | null;
}) {
  return {
    name: company.name,
    logo_url: company.logo_url ?? null,
    report_theme: company.report_theme ?? null,
  };
}

export function take5DocumentFrom(data: Take5ReportData): Take5ReportData {
  return {
    ...data,
    theme: take5ReportTheme(data.theme),
  };
}

export async function generateTake5Pdf(data: Take5ReportData): Promise<Blob> {
  if (!fontsRegistered) {
    registerFonts();
    fontsRegistered = true;
  }
  const themed = take5DocumentFrom(data);
  const element = React.createElement(Take5ReportRenderer, { data: themed }) as unknown as React.ReactElement;
  return pdf(element).toBlob();
}
