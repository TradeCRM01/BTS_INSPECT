import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PdfViewer } from '../components/pdf/PdfViewer';
import { AnnotationToolbar } from '../components/pdf/AnnotationToolbar';
import { flattenAnnotations } from '../lib/flattenAnnotations';
import { nanoid } from '../lib/nanoid';
import type { Annotation, AnnotationTool } from '../types/annotations';
import { ChevronLeft, Trash2, PenLine, FileText, Eye } from 'lucide-react';

export function UploadedPdfViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null);
  const [activeColor, setActiveColor] = useState('#000000');
  const [fontSize, setFontSize] = useState(14);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const originalPdfBytesRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const url = pdfUrl;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [pdfUrl]);

  const { data: pdfRecord, isLoading } = useQuery({
    queryKey: ['uploaded-pdf', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('uploaded_pdfs')
        .select('id, filename, storage_path, title, file_size, created_at')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: blob, error: dlErr } = await supabase.storage.from('uploaded-pdfs').download(data.storage_path);
      if (!dlErr && blob) {
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      }
      return data;
    },
    enabled: !!id,
  });

  useQuery({
    queryKey: ['uploaded-pdf-annotations', id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase
        .from('uploaded_pdf_annotations')
        .select('*')
        .eq('uploaded_pdf_id', id)
        .maybeSingle();
      if (data?.annotation_data) {
        setAnnotations(data.annotation_data as unknown as Annotation[]);
      }
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(pdfUrl);
        const buf = await res.arrayBuffer();
        if (!cancelled) originalPdfBytesRef.current = new Uint8Array(buf);
      } catch { /* flattening unavailable */ }
    })();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  const handleCreateAnnotation = useCallback((partial: Omit<Annotation, 'id'>): string => {
    const ann = { ...partial, id: nanoid() } as Annotation;
    setAnnotations(prev => [...prev, ann]);
    setSelectedAnnotationId(ann.id);
    return ann.id;
  }, []);

  const handleAnnotationUpdate = useCallback((updated: Annotation) => {
    setAnnotations(prev => prev.map(a => a.id === updated.id ? updated : a));
  }, []);

  function handleDeleteSelected() {
    if (!selectedAnnotationId) return;
    setAnnotations(prev => prev.filter(a => a.id !== selectedAnnotationId));
    setSelectedAnnotationId(null);
  }

  async function handleSaveAnnotations() {
    if (!id || !profile) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('uploaded_pdf_annotations')
        .select('id')
        .eq('uploaded_pdf_id', id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('uploaded_pdf_annotations')
          .update({
            annotation_data: annotations as unknown as Record<string, unknown>,
            updated_by: profile.id,
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('uploaded_pdf_annotations')
          .insert({
            uploaded_pdf_id: id,
            annotation_data: annotations as unknown as Record<string, unknown>,
            updated_by: profile.id,
          });
      }
      queryClient.invalidateQueries({ queryKey: ['uploaded-pdf-annotations', id] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save annotations');
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadAnnotated() {
    const sourceBytes = originalPdfBytesRef.current;
    if (!sourceBytes) return;
    setDownloading(true);
    try {
      const flattened = await flattenAnnotations(sourceBytes, annotations);
      const blob = new Blob([flattened as BlobPart], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${pdfRecord?.title ?? 'document'} (annotated).pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download annotated PDF');
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!pdfRecord || !confirm(`Delete "${pdfRecord.title}"? This cannot be undone.`)) return;
    await supabase.from('uploaded_pdfs').delete().eq('id', pdfRecord.id);
    await supabase.storage.from('uploaded-pdfs').remove([pdfRecord.storage_path]);
    navigate('/reports');
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      </AppShell>
    );
  }

  if (!pdfRecord) {
    return (
      <AppShell>
        <div className="max-w-[800px] mx-auto px-4 py-16 text-center">
          <FileText size={48} className="mx-auto text-[#E5E7EB] mb-3" />
          <p className="text-[#1A1A1A] font-medium">PDF not found</p>
          <button onClick={() => navigate('/reports')} className="mt-4 text-[#2E75B6] text-sm font-medium">
            Back to Reports
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
        <button onClick={() => navigate('/reports')} className="flex items-center gap-1 text-sm text-[#4A5568] hover:text-[#1A1A1A] mb-3">
          <ChevronLeft size={16} /> Reports
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-[#1A1A1A] truncate">{pdfRecord.title}</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
              {pdfRecord.filename} — {(pdfRecord.file_size / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode(m => m === 'edit' ? 'view' : 'edit')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'edit'
                  ? 'bg-[#2E75B6] text-white hover:bg-[#1e5394]'
                  : 'border border-[#E5E7EB] text-[#4A5568] hover:bg-[#F9FAFB]'
              }`}
            >
              {mode === 'edit' ? <><Eye size={15} /> View Only</> : <><PenLine size={15} /> Annotate</>}
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-2 rounded-md text-sm font-medium hover:bg-red-50 transition-colors"
            >
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-3">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0">
          {pdfUrl ? (
            <div className="flex flex-col h-full bg-white border border-[#E5E7EB] rounded-lg overflow-hidden shadow-sm">
              <AnnotationToolbar
                mode={mode}
                activeTool={activeTool}
                activeColor={activeColor}
                fontSize={fontSize}
                zoom={zoom}
                currentPage={currentPage}
                numPages={numPages}
                selectedAnnotationId={selectedAnnotationId}
                onToolChange={setActiveTool}
                onColorChange={setActiveColor}
                onFontSizeChange={setFontSize}
                onZoomIn={() => setZoom(z => Math.min(3, z + 0.25))}
                onZoomOut={() => setZoom(z => Math.max(0.5, z - 0.25))}
                onPageChange={setCurrentPage}
                onDeleteSelected={handleDeleteSelected}
                onSave={handleSaveAnnotations}
                onDownload={handleDownloadAnnotated}
                saving={saving || downloading}
              />
              <PdfViewer
                pdfUrl={pdfUrl}
                zoom={zoom}
                currentPage={currentPage}
                annotations={annotations}
                selectedAnnotationId={selectedAnnotationId}
                onSelectAnnotation={setSelectedAnnotationId}
                onAnnotationUpdate={handleAnnotationUpdate}
                onCreateAnnotation={handleCreateAnnotation}
                activeTool={activeTool}
                activeColor={activeColor}
                fontSize={fontSize}
                onPageChange={setCurrentPage}
                onDocumentLoad={setNumPages}
                mode={mode}
              />
            </div>
          ) : (
            <div className="bg-white border border-[#E5E7EB] rounded-lg py-16 text-center shadow-sm">
              <LoadingSpinner size="lg" />
              <p className="text-sm text-[#4A5568] mt-3">Loading PDF...</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
