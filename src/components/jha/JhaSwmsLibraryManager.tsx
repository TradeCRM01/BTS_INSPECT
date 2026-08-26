import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2, ExternalLink, Pencil, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { nanoid } from '../../lib/nanoid';
import { getAuditEmptyList } from '../../lib/devFieldAuditDocs';

export type SwmsLibraryRow = {
  id: string;
  title: string;
  description: string | null;
  filename: string;
  storage_path: string;
  file_size: number | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  companyId: string;
  profileId?: string;
  /** When true, show denser layout for embedding in settings-style pages */
  compact?: boolean;
};

function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function JhaSwmsLibraryManager({ companyId, profileId, compact }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const { data: library = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['jha-swms-library', companyId],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as SwmsLibraryRow[];
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

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['jha-swms-library', companyId] });
  }

  async function upload(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are allowed');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const safeName = file.name.replace(/[^\w.-]/g, '_');
      const storagePath = `jha-swms/${companyId}/${nanoid()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('uploaded-pdfs')
        .upload(storagePath, file, { contentType: 'application/pdf', upsert: false });
      if (upErr) throw upErr;

      const docTitle = title.trim() || file.name.replace(/\.pdf$/i, '');
      const { error: dbErr } = await supabase.from('jha_swms_library').insert({
        company_id: companyId,
        uploaded_by: profileId ?? null,
        title: docTitle,
        description: description.trim() || null,
        filename: file.name,
        storage_path: storagePath,
        file_size: file.size,
      });
      if (dbErr) {
        await supabase.storage.from('uploaded-pdfs').remove([storagePath]);
        throw dbErr;
      }
      setTitle('');
      setDescription('');
      invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function openPdf(row: SwmsLibraryRow) {
    const { data, error: sErr } = await supabase.storage
      .from('uploaded-pdfs')
      .createSignedUrl(row.storage_path, 3600);
    if (sErr || !data?.signedUrl) {
      setError(sErr?.message || 'Could not open PDF');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  function startEdit(row: SwmsLibraryRow) {
    setEditingId(row.id);
    setEditTitle(row.title);
    setEditDescription(row.description ?? '');
    setError('');
  }

  async function saveEdit(id: string) {
    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      setError('Title is required');
      return;
    }
    setSavingEdit(true);
    setError('');
    try {
      const { error: uErr } = await supabase
        .from('jha_swms_library')
        .update({
          title: nextTitle,
          description: editDescription.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (uErr) throw uErr;
      setEditingId(null);
      invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSavingEdit(false);
    }
  }

  async function archive(row: SwmsLibraryRow) {
    if (!confirm(`Remove "${row.title}" from the company SWMS library?\n\nExisting JHAs that linked it will keep the reference, but it will no longer appear for new links.`)) {
      return;
    }
    const { error: aErr } = await supabase
      .from('jha_swms_library')
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (aErr) {
      setError(aErr.message);
      return;
    }
    if (editingId === row.id) setEditingId(null);
    invalidate();
  }

  return (
    <div className={compact ? '' : 'space-y-4'}>
      <div className={`bg-white rounded-xl border border-[#E5E7EB] shadow-sm ${compact ? 'p-4' : 'p-5'}`}>
        <div className="flex items-center gap-2 mb-2">
          <FileText size={16} className="text-[#4A5568]" />
          <h2 className="text-sm font-medium text-[#1A1A1A]">Upload SWMS PDF</h2>
        </div>
        <p className="text-xs text-[#6B7280] mb-3">
          Store company SWMS documents once. JHA templates and job JHAs can tick which ones apply — no re-upload per job.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Document title"
            className="form-input-sm flex-1 min-w-[160px]"
          />
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            className="form-input-sm flex-1 min-w-[160px]"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-1 text-xs font-medium text-white bg-[#0A2540] px-3 py-1.5 rounded-md hover:bg-[#0d3050] disabled:opacity-50"
          >
            <Plus size={12} /> {uploading ? 'Uploading…' : 'Choose PDF'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      <div className={`bg-white rounded-xl border border-[#E5E7EB] shadow-sm ${compact ? 'p-4 mt-4' : 'p-5'}`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-medium text-[#1A1A1A]">Library ({library.length})</h2>
        </div>

        {isLoading && <p className="text-sm text-[#9CA3AF]">Loading library…</p>}

        {!isLoading && isError && (
          <p className="text-sm text-red-600">
            Could not load the SWMS library.{' '}
            <button type="button" onClick={() => refetch()} className="underline font-medium">
              Retry
            </button>
          </p>
        )}

        {!isLoading && !isError && library.length === 0 && (
          <p className="text-sm text-[#9CA3AF] text-center py-8 border border-dashed border-[#E5E7EB] rounded-lg">
            No SWMS PDFs yet — upload your first company document above.
          </p>
        )}

        <div className="space-y-2">
          {library.map(row => {
            const isEditing = editingId === row.id;
            return (
              <div key={row.id} className="rounded-lg border border-[#E5E7EB] p-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="form-input-sm w-full"
                      placeholder="Title"
                    />
                    <textarea
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      rows={2}
                      className="w-full text-sm border border-[#E5E7EB] rounded px-3 py-2 resize-none"
                      placeholder="Description"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={savingEdit}
                        onClick={() => void saveEdit(row.id)}
                        className="flex items-center gap-1 text-xs font-medium text-white bg-[#0A2540] px-3 py-1.5 rounded-md disabled:opacity-50"
                      >
                        <Check size={12} /> Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="flex items-center gap-1 text-xs text-[#6B7280] border border-[#E5E7EB] px-3 py-1.5 rounded-md"
                      >
                        <X size={12} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <FileText size={18} className="text-[#2E75B6] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1A1A1A] truncate">{row.title}</p>
                      {row.description && (
                        <p className="text-xs text-[#6B7280] mt-0.5 line-clamp-2">{row.description}</p>
                      )}
                      <p className="text-[11px] text-[#9CA3AF] mt-1 truncate">
                        {row.filename}
                        {row.file_size != null ? ` · ${formatBytes(row.file_size)}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openPdf(row)}
                      className="text-[#6B7280] hover:text-[#2E75B6] p-1"
                      title="Open PDF"
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="text-[#6B7280] hover:text-[#2E75B6] p-1"
                      title="Edit title / description"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void archive(row)}
                      className="text-[#9CA3AF] hover:text-red-600 p-1"
                      title="Remove from library"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
