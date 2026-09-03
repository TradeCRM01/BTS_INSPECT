import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { registerFonts } from '../shared/fonts';
import { CommercialDocumentPdf, type CommercialPdfData } from './CommercialDocumentPdf';
import { companyLogoCropFrom, companyLogoCroppedSrc, companyDocumentLogoUrl } from '../../lib/companyLogo';

let fontsRegistered = false;

export async function generateCommercialPdf(data: CommercialPdfData): Promise<Blob> {
  if (!fontsRegistered) {
    registerFonts();
    fontsRegistered = true;
  }
  const src = companyDocumentLogoUrl(data.company);
  const crop = companyLogoCropFrom(data.company);
  let next = data;
  if (src && crop) {
    const cropped = await companyLogoCroppedSrc(src, crop);
    next = {
      ...data,
      company: { ...data.company, logo_url: cropped, logo_crop: null },
    };
  }
  const element = React.createElement(CommercialDocumentPdf, { data: next }) as React.ReactElement;
  return pdf(element).toBlob();
}
