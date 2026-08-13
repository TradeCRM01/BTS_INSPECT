import { pdf } from '@react-pdf/renderer';
import React from 'react';
import { registerFonts } from './shared/fonts';
import { Take5ReportRenderer, type Take5ReportData } from './take5/Renderer';

let fontsRegistered = false;

export async function generateTake5Pdf(data: Take5ReportData): Promise<Blob> {
  if (!fontsRegistered) {
    registerFonts();
    fontsRegistered = true;
  }
  const element = React.createElement(Take5ReportRenderer, { data }) as unknown as React.ReactElement;
  return pdf(element).toBlob();
}
