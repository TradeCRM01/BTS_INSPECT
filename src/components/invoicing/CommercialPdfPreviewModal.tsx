import { useEffect, useState } from 'react';
import { Download, Loader2, FileText } from 'lucide-react';
import { AppDialog } from '../ui/AppDialog';
import { generateCommercialPdf } from '../../reports/commercial/generateCommercialPdf';
import type { CommercialPdfData } from '../../reports/commercial/CommercialDocumentPdf';

interface CommercialPdfPreviewModalProps {
  data: CommercialPdfData;
  onClose: () => void;
}

export function CommercialPdfPreviewModal({ data, onClose }: CommercialPdfPreviewModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const blob = await generateCommercialPdf(data);
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        revoked = objectUrl;
        setUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to generate PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [data]);

  function handleDownload() {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.kind}-${data.docNumber.replace(/[#\s]/g, '_') || 'document'}.pdf`;
    a.click();
  }

  const quoteLook = data.kind === 'quote';
  const invoiceLook = data.kind === 'invoice';
  const creamLook = quoteLook || invoiceLook;

  return (
    <AppDialog
      open
      onClose={onClose}
      title={quoteLook ? 'Quote preview' : invoiceLook ? 'Invoice preview' : 'Document preview'}
      className={quoteLook ? 'hub-quote-pdf-preview' : invoiceLook ? 'hub-invoice-pdf-preview' : ''}
      panelClassName={`overlay-panel-xl flex flex-col max-h-[92vh] ${quoteLook ? 'hub-quote-pdf-sheet' : invoiceLook ? 'hub-invoice-pdf-sheet' : 'border border-[#E5E7EB]'}`}
      backdropClose
    >
          <div className={`flex items-center justify-between px-5 py-3 shrink-0 ${quoteLook ? 'hub-quote-pdf-head' : invoiceLook ? 'hub-invoice-pdf-head' : 'border-b border-[#E5E7EB]'}`}>
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[#2E75B6]" />
              <h2 className={`text-base font-semibold ${creamLook ? 'text-[#0A2540]' : 'text-[#1A1A1A]'}`}>
                {quoteLook ? 'Quote preview' : invoiceLook ? 'Invoice preview' : 'Document preview'}
              </h2>
              <span className={`text-xs ${creamLook ? 'text-[#5B6B7C]' : 'text-[#9CA3AF]'}`}>{data.docNumber}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!url}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-[#0A2540] text-[#0A2540] rounded-md hover:bg-[#0A2540]/5 disabled:opacity-40"
              >
                <Download size={14} /> Download
              </button>
              <button
                type="button"
                onClick={onClose}
                className="hub-pdf-preview-close"
              >
                Close
              </button>
            </div>
          </div>

          <div className={`flex-1 min-h-0 p-3 ${creamLook ? 'bg-[#F5F0E6]' : 'bg-[#E5E7EB]'} ${quoteLook ? 'hub-quote-pdf-frame' : ''}`}>
            {loading && (
              <div className="flex flex-col items-center justify-center h-[70vh] text-[#4A5568]">
                <Loader2 size={28} className="animate-spin mb-2 text-[#2E75B6]" />
                <p className="text-sm">Generating PDF…</p>
              </div>
            )}
            {error && !loading && (
              <div className="flex items-center justify-center h-[70vh]">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            {url && !loading && (
              <iframe
                src={quoteLook ? `${url}#toolbar=0&navpanes=0&view=FitH` : url}
                title="Document PDF preview"
                className="w-full rounded-md bg-white shadow-sm"
                style={{ height: '75vh' }}
              />
            )}
          </div>
    </AppDialog>
  );
}
