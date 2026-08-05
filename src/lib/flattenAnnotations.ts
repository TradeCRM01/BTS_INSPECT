import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { Annotation } from '../types/annotations';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '');
  return {
    r: parseInt(m.slice(0, 2), 16) / 255,
    g: parseInt(m.slice(2, 4), 16) / 255,
    b: parseInt(m.slice(4, 6), 16) / 255,
  };
}

export async function flattenAnnotations(originalBytes: Uint8Array, annotations: Annotation[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const ann of annotations) {
    const page = pages[ann.pageNumber - 1];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();
    // PDF coordinates are bottom-left origin; our annotation coordinates are top-left in CSS pixels at zoom=1
    // We need to convert: pdfY = pageHeight - cssY
    // But CSS pixel size != PDF point size. We assume the annotation coordinates are in the same coordinate space
    // as the rendered page at zoom=1, which is PDF points * scale. Since pdf.js renders at scale=1 => 1 point = 1px.
    const y = ph - ann.y;

    if (ann.type === 'text') {
      const color = hexToRgb(ann.color);
      const lines = ann.text.split('\n');
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: ann.x + 2,
          y: y - ann.fontSize * 1.3 - i * ann.fontSize * 1.3 + ann.fontSize,
          size: ann.fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        });
      });
    } else if (ann.type === 'whiteout') {
      page.drawRectangle({
        x: ann.x,
        y: y - ann.height,
        width: ann.width,
        height: ann.height,
        color: rgb(1, 1, 1),
        opacity: 1,
      });
    } else if (ann.type === 'highlight') {
      const color = hexToRgb(ann.color);
      page.drawRectangle({
        x: ann.x,
        y: y - ann.height,
        width: ann.width,
        height: ann.height,
        color: rgb(color.r, color.g, color.b),
        opacity: 0.25,
      });
    } else if (ann.type === 'rectangle') {
      const color = hexToRgb(ann.color);
      page.drawRectangle({
        x: ann.x,
        y: y - ann.height,
        width: ann.width,
        height: ann.height,
        borderColor: rgb(color.r, color.g, color.b),
        borderWidth: ann.strokeWidth,
      });
    } else if (ann.type === 'circle') {
      const color = hexToRgb(ann.color);
      page.drawEllipse({
        x: ann.x,
        y: ph - ann.y,
        xScale: ann.radiusX,
        yScale: ann.radiusY,
        borderColor: rgb(color.r, color.g, color.b),
        borderWidth: ann.strokeWidth,
      });
    } else if (ann.type === 'line') {
      const color = hexToRgb(ann.color);
      page.drawLine({
        start: { x: ann.x, y: ph - ann.y },
        end: { x: ann.x2, y: ph - ann.y2 },
        thickness: ann.strokeWidth,
        color: rgb(color.r, color.g, color.b),
      });
    }
  }

  return pdfDoc.save();
}
