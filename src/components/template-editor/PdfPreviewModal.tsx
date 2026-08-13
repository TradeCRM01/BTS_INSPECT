import { useEffect, useState } from 'react';
import { FileText, Loader2, X, Download, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { generatePdf } from '../../reports/generatePdf';
import { buildPreviewMeta, buildPreviewResponses } from '../../lib/inspectionPreviewResponses';
import type { TemplateSchema } from '../../types/template';

interface Props {
  open: boolean;
  onClose: () => void;
  templateName: string;
  renderer: string;
  schema: TemplateSchema;
}

export function PdfPreviewModal({ open, onClose, templateName, renderer, schema }: Props) {
  const { profile, company } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let revoked: string | null = null;
    let cancelled = false;

    async function run() {
      if (!profile || !company) {
        setError('Sign in required to preview PDF');
        return;
      }
      setBusy(true);
      setError('');
      try {
        const blob = await generatePdf({
          inspection: {
            id: 'preview',
            meta: buildPreviewMeta(schema),
            responses: buildPreviewResponses(schema),
            completed_at: new Date().toISOString(),
            doc_version: 1,
            amendment_reason: null,
          },
          template: {
            name: templateName || 'Untitled Template',
            schema,
            report_renderer: renderer,
          },
          profile: {
            name: profile.name,
            licence_number: profile.licence_number,
          },
          company: {
            name: company.name,
            abn: company.abn,
            licence_number: company.licence_number,
            phone: company.phone,
            email: company.email,
            website: company.website,
            logo_url: company.logo_url,
            report_theme: (company as { report_theme?: Record<string, unknown> | null }).report_theme ?? null,
          },
          photos: [],
          reportNumber: 'PREVIEW-0000',
        });
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        revoked = next;
        setUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return next;
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'PDF preview failed');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open, schema, templateName, renderer, profile, company]);

  useEffect(() => {
    if (open) return;
    setUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError('');
  }, [open]);

  if (!open) return null;

  function download() {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(templateName || 'template').replace(/[<>:"/\\|?*]/g, '_')}-preview.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-3 md:inset-8 z-50 bg-white rounded-lg shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={16} className="text-[#2E75B6] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[#1A1A1A] truncate">Live PDF preview</h3>
              <p className="text-xs text-[#6B7280] truncate">Sample answers · not saved</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={download}
              disabled={!url || busy}
              className="flex items-center gap-1.5 text-xs border border-[#E5E7EB] px-2.5 py-1.5 rounded-md hover:bg-[#F9FAFB] disabled:opacity-50"
            >
              <Download size={13} /> Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-[#6B7280] hover:bg-[#F3F4F6]"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-[#F3F4F6] min-h-0 relative">
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-[#4A5568]">
              <Loader2 size={22} className="animate-spin text-[#2E75B6]" />
              Generating preview…
            </div>
          )}
          {error && !busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 text-xs text-[#2E75B6] hover:underline"
              >
                <RefreshCw size={12} /> Close and fix template
              </button>
            </div>
          )}
          {url && !busy && (
            <iframe title="PDF preview" src={url} className="w-full h-full border-0" />
          )}
        </div>
      </div>
    </>
  );
}
