import JSZip from 'jszip';
import { supabase } from './supabase';
import { generatePdf } from '../reports/generatePdf';
import type { TemplateSchema } from '../types/template';

export interface PackExportProfile {
  id: string;
  name: string;
  company_id: string;
  licence_number?: string | null;
}

export interface PackExportCompany {
  name: string;
  abn?: string | null;
  licence_number?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  report_theme?: Record<string, unknown> | null;
}

function safeName(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'item';
}

async function ensurePdfBlob(args: {
  inspectionId: string;
  profile: PackExportProfile;
  company: PackExportCompany;
}): Promise<{ blob: Blob; reportNumber: string; siteName: string } | null> {
  const { data: inspection, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', args.inspectionId)
    .maybeSingle();
  if (error || !inspection) return null;

  const meta = (inspection.meta ?? {}) as Record<string, string>;
  const siteName = meta.siteName ?? 'Site';

  const { data: report } = await supabase
    .from('reports')
    .select('*')
    .eq('inspection_id', args.inspectionId)
    .maybeSingle();

  if (report?.pdf_storage_path) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from('reports')
      .download(report.pdf_storage_path);
    if (!dlErr && blob) {
      return {
        blob,
        reportNumber: report.report_number ?? args.inspectionId.slice(0, 8),
        siteName,
      };
    }
  }

  const snapshot = inspection.template_snapshot as {
    name?: string;
    schema?: TemplateSchema;
    report_renderer?: string;
  } | null;

  if (!snapshot?.schema) return null;

  const reportNumber = report?.report_number ?? `PACK-${args.inspectionId.slice(0, 6).toUpperCase()}`;
  const { data: photos } = await supabase.from('photos').select('*').eq('inspection_id', args.inspectionId);
  const photosWithUrls = await Promise.all(
    (photos ?? []).map(async p => {
      const { data: sd } = await supabase.storage.from('photos').createSignedUrl(p.storage_path, 3600);
      return { ...p, url: sd?.signedUrl ?? '' };
    }),
  );

  const blob = await generatePdf({
    inspection: {
      id: inspection.id,
      meta,
      responses: (inspection.responses ?? {}) as Record<string, unknown>,
      completed_at: inspection.completed_at,
      doc_version: (inspection as { doc_version?: number | null }).doc_version ?? 1,
      amendment_reason: (inspection as { amendment_reason?: string | null }).amendment_reason ?? null,
    },
    template: {
      name: snapshot.name ?? 'Inspection',
      schema: snapshot.schema,
      report_renderer: snapshot.report_renderer ?? 'generic_inspection',
    },
    profile: args.profile,
    company: args.company,
    photos: photosWithUrls,
    reportNumber,
  });

  return { blob, reportNumber, siteName };
}

/** Build a ZIP of PDFs + photo folders for the given inspection IDs. */
export async function exportInspectionPack(args: {
  inspectionIds: string[];
  profile: PackExportProfile;
  company: PackExportCompany;
  onProgress?: (done: number, total: number, label: string) => void;
}): Promise<Blob> {
  const zip = new JSZip();
  const total = args.inspectionIds.length;
  let done = 0;

  for (const id of args.inspectionIds) {
    args.onProgress?.(done, total, id);
    const pdf = await ensurePdfBlob({
      inspectionId: id,
      profile: args.profile,
      company: args.company,
    });
    if (!pdf) {
      done += 1;
      continue;
    }

    const folderName = safeName(`${pdf.siteName} - ${pdf.reportNumber}`);
    const folder = zip.folder(folderName);
    folder?.file(`${folderName}.pdf`, pdf.blob);

    const { data: photos } = await supabase.from('photos').select('*').eq('inspection_id', id);
    if (photos?.length) {
      const photosFolder = folder?.folder('photos');
      let i = 0;
      for (const p of photos) {
        i += 1;
        const { data: blob } = await supabase.storage.from('photos').download(p.storage_path);
        if (!blob) continue;
        const ext = p.storage_path.includes('.') ? p.storage_path.split('.').pop() : 'jpg';
        const caption = p.caption ? safeName(String(p.caption)).slice(0, 40) : `photo-${i}`;
        photosFolder?.file(`${String(i).padStart(2, '0')}-${caption}.${ext}`, blob);
      }
    }

    done += 1;
    args.onProgress?.(done, total, folderName);
  }

  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
