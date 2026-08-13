import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { registerFonts } from '../shared/fonts';
import { CommercialDocumentPdf, type CommercialPdfData } from './CommercialDocumentPdf';

let fontsRegistered = false;

export async function generateCommercialPdf(data: CommercialPdfData): Promise<Blob> {
  if (!fontsRegistered) {
    registerFonts();
    fontsRegistered = true;
  }
  const element = React.createElement(CommercialDocumentPdf, { data }) as React.ReactElement;
  return pdf(element).toBlob();
}
