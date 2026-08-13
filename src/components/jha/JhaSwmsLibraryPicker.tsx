import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, ExternalLink, Check, Settings2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SwmsLibraryRow } from './JhaSwmsLibraryManager';

type Props = {
  companyId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Optional heading override */
  title?: string;
  /** Compact copy for template editor */
  variant?: 'jha' | 'template';
};

export function JhaSwmsLibraryPicker({
  companyId,
  selectedIds,
  onChange,
  title,
  variant = 'jha',
}: Props) {
  const { data: library = [], isLoading } = useQuery({
    queryKey: ['jha-swms-library', companyId],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from('jha_swms_library')
        .select('id, title, description, filename, storage_path, file_size, created_at, updated_at')
        .eq('archived', false)
        .order('title', { ascending: true });
      if (qErr) throw qErr;
      return (data ?? []) as SwmsLibraryRow[];
    },
    enabled: !!companyId,
  });

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  }

  async function openPdf(row: SwmsLibraryRow) {
    const { data, error: sErr } = await supabase.storage
      .from('uploaded-pdfs')
      .createSignedUrl(row.storage_path, 3600);
    if (sErr || !data?.signedUrl) return;
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const heading =
    title ??
    (variant === 'template' ? 'Default linked SWMS PDFs' : 'Linked SWMS PDFs');

  const help =
    variant === 'template'
      ? 'Tick company SWMS documents that should be pre-linked when a JHA is created from this template. Manage uploads in the company library.'
      : 'Tick which company SWMS documents apply to this JHA. Upload and edit documents in the company SWMS library — not per job.';

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[#4A5568]" />
          <h2 className="text-sm font-medium text-[#1A1A1A]">{heading}</h2>
        </div>
        <Link
          to="/jha/swms-library"
          className="flex items-center gap-1 text-xs font-medium text-[#2E75B6] hover:underline"
        >
          <Settings2 size={12} /> Manage company library
        </Link>
      </div>
      <p className="text-xs text-[#6B7280] mb-3">{help}</p>

      {isLoading && <p className="text-sm text-[#9CA3AF]">Loading library…</p>}

      {!isLoading && library.length === 0 && (
        <div className="text-center py-6 border border-dashed border-[#E5E7EB] rounded-lg">
          <p className="text-sm text-[#9CA3AF] mb-2">No SWMS PDFs in the company library yet.</p>
          <Link
            to="/jha/swms-library"
            className="text-sm font-medium text-[#2E75B6] hover:underline"
          >
            Upload SWMS documents
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {library.map(row => {
          const checked = selectedIds.includes(row.id);
          return (
            <div
              key={row.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${checked ? 'border-[#2E75B6] bg-[#2E75B6]/5' : 'border-[#E5E7EB]'}`}
            >
              <button
                type="button"
                onClick={() => toggle(row.id)}
                className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-[#0A2540] border-[#0A2540] text-white' : 'border-[#D1D5DB] bg-white'}`}
                aria-pressed={checked}
              >
                {checked && <Check size={12} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1A1A1A] truncate">{row.title}</p>
                {row.description && (
                  <p className="text-[11px] text-[#6B7280] line-clamp-1">{row.description}</p>
                )}
                <p className="text-[11px] text-[#9CA3AF] truncate">{row.filename}</p>
              </div>
              <button
                type="button"
                onClick={() => void openPdf(row)}
                className="text-[#6B7280] hover:text-[#2E75B6] p-1"
                title="Open PDF"
              >
                <ExternalLink size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {selectedIds.length > 0 && (
        <p className="text-xs text-[#1B7F3A] mt-3">
          {selectedIds.length} SWMS {variant === 'template' ? 'pre-linked on this template' : 'linked to this JHA'}
        </p>
      )}
    </div>
  );
}
