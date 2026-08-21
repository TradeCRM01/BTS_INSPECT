import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generatePdf } from '../reports/generatePdf';
import type { TemplateSchema } from '../types/template';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Download, Mail, FileText, ChevronLeft, RefreshCw, CreditCard as Edit2, Link2, Plus, PenLine, FilePlus2, Check, Share2 } from 'lucide-react';
import { ReportSendDialog } from '../components/inspection/ReportSendDialog';
import { reportIsSent } from '../lib/sendReport';
import { format } from 'date-fns';
import { PdfViewer } from '../components/pdf/PdfViewer';
import { AnnotationToolbar } from '../components/pdf/AnnotationToolbar';
import { flattenAnnotations } from '../lib/flattenAnnotations';
import { nanoid } from '../lib/nanoid';
import type { Annotation, AnnotationTool } from '../types/annotations';

function generateReportNumber(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `BTS-${y}${m}${d}-${rand}`;
}

export function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();

  const [generating, setGenerating] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [reportNumber, setReportNumber] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'report' | 'edit' | 'annotate'>('report');

  // PDF viewer/editor state
  const [zoom, setZoom] = useState(1.0);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null);
  const [activeColor, setActiveColor] = useState('#EF4444');
  const [fontSize, setFontSize] = useState(14);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [amending, setAmending] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [sendNotice, setSendNotice] = useState('');
  const originalPdfBytesRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const url = pdfUrl;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [pdfUrl]);

  const { data: inspection, isLoading: inspLoading } = useQuery({
    queryKey: ['inspection', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('inspections').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const snapshot = data.template_snapshot as Record<string, unknown> | null;
      if (snapshot && !snapshot.schema) {
        const templateId = snapshot.id as string | undefined;
        if (templateId) {
          const { data: tmpl } = await supabase
            .from('templates')
            .select('schema')
            .eq('id', templateId)
            .maybeSingle();
          if (tmpl?.schema) {
            data.template_snapshot = { ...snapshot, schema: tmpl.schema } as unknown as typeof data.template_snapshot;
          }
        }
      }

      return data;
    },
    enabled: !!id,
  });

  const { data: existingReport } = useQuery({
    queryKey: ['report', id],
    queryFn: async () => {
      const { data } = await supabase.from('reports').select('*').eq('inspection_id', id!).maybeSingle();
      if (data?.pdf_storage_path) {
        const { data: blob, error: dlErr } = await supabase.storage.from('reports').download(data.pdf_storage_path);
        if (!dlErr && blob) {
          const url = URL.createObjectURL(blob);
          setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
          setPdfBlob(blob);
        }
      }
      if (data?.report_number) setReportNumber(data.report_number);
      return data;
    },
    enabled: !!id,
  });

  // Load annotations when report is available
  useQuery({
    queryKey: ['pdf-annotations', existingReport?.id],
    queryFn: async () => {
      if (!existingReport?.id) return [];
      const { data } = await supabase
        .from('pdf_annotations')
        .select('*')
        .eq('report_id', existingReport.id)
        .maybeSingle();
      if (data?.annotation_data) {
        setAnnotations(data.annotation_data as unknown as Annotation[]);
      }
      return data;
    },
    enabled: !!existingReport?.id,
  });

  const { data: photoRecords } = useQuery({
    queryKey: ['inspection-photos', id],
    queryFn: async () => {
      const { data } = await supabase.from('photos').select('*').eq('inspection_id', id!);
      if (!data) return [];
      return Promise.all(
        data.map(async p => {
          const { data: sd } = await supabase.storage.from('photos').createSignedUrl(p.storage_path, 3600);
          return { ...p, url: sd?.signedUrl ?? '' };
        })
      );
    },
    enabled: !!id,
  });

  // Fetch original PDF bytes for flattening
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(pdfUrl);
        const buf = await res.arrayBuffer();
        if (!cancelled) {
          const bytes = new Uint8Array(buf);
          originalPdfBytesRef.current = bytes;
          setPdfBytes(bytes);
        }
      } catch {
        // ignore — flattening will just be unavailable
      }
    })();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  async function handleGenerate() {
    if (!inspection || !profile || !company) return;
    setGenerating(true);
    setError('');

    try {
      const rn = existingReport?.report_number ?? generateReportNumber();
      setReportNumber(rn);

      const snapshot = inspection.template_snapshot as unknown as {
        name: string;
        schema: TemplateSchema;
        report_renderer: string;
      };

      const blob = await generatePdf({
        inspection: {
          id: inspection.id,
          meta: inspection.meta as Record<string, string>,
          responses: inspection.responses as Record<string, unknown>,
          completed_at: inspection.completed_at,
          doc_version: (inspection as { doc_version?: number | null }).doc_version ?? 1,
          amendment_reason: (inspection as { amendment_reason?: string | null }).amendment_reason ?? null,
        },
        template: snapshot,
        profile,
        company: {
          ...company,
          report_theme: (company as { report_theme?: Record<string, unknown> | null }).report_theme ?? null,
        },
        photos: photoRecords ?? [],
        reportNumber: rn,
      });

      const url = URL.createObjectURL(blob);
      setPdfBlob(blob);
      setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });

      const meta = inspection.meta as Record<string, string>;
      const siteName = (meta.siteName ?? 'Site').replace(/[<>:"/\\|?*]/g, '_');
      const filename = `${siteName} - ${rn}.pdf`;
      const storagePath = `${inspection.id}/${filename}`;
      const { error: upErr } = await supabase.storage
        .from('reports')
        .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true });

      if (!upErr && !existingReport) {
        await supabase.from('reports').insert({
          company_id: profile.company_id,
          inspection_id: inspection.id,
          report_number: rn,
          pdf_storage_path: storagePath,
        });
        await supabase.from('inspections').update({ status: 'issued' }).eq('id', inspection.id);
        queryClient.invalidateQueries({ queryKey: ['report', id] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF generation failed');
    } finally {
      setGenerating(false);
    }
  }

  function handleDownloadOriginal() {
    const rn = reportNumber ?? existingReport?.report_number;
    if (!pdfBlob || !rn) return;
    const meta = inspection?.meta as Record<string, string> ?? {};
    const siteName = (meta.siteName ?? 'Site').replace(/[<>:"/\\|?*]/g, '_');
    const filename = `${siteName} - ${rn}.pdf`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(pdfBlob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function handleDownloadAnnotated() {
    const sourceBytes = originalPdfBytesRef.current;
    const rn = reportNumber ?? existingReport?.report_number;
    if (!sourceBytes || !rn) return;
    setDownloading(true);
    try {
      const flattened = await flattenAnnotations(sourceBytes, annotations);
      const meta = inspection?.meta as Record<string, string> ?? {};
      const siteName = (meta.siteName ?? 'Site').replace(/[<>:"/\\|?*]/g, '_');
      const filename = `${siteName} - ${rn} (annotated).pdf`;
      const blob = new Blob([flattened as BlobPart], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download annotated PDF');
    } finally {
      setDownloading(false);
    }
  }

  function handleEmail() {
    if (!existingReport?.id) {
      setError('No report yet. Generate the PDF before you send.');
      return;
    }
    if (!company?.id) {
      setError('Could not load company for send.');
      return;
    }
    setError('');
    setSendNotice('');
    setSendingReport(true);
  }

  async function handleAmendAndReissue() {
    if (!inspection || !profile) return;
    const reason = window.prompt('Amendment reason (required — why is this report being re-issued?):');
    if (!reason?.trim()) return;

    setAmending(true);
    setError('');
    try {
      const oldMeta = (inspection.meta as Record<string, unknown>) ?? {};
      const oldVersion = (inspection as { doc_version?: number | null }).doc_version ?? 1;
      const { data, error: insertErr } = await supabase
        .from('inspections')
        .insert({
          template_id: inspection.template_id,
          template_snapshot: inspection.template_snapshot,
          inspector_id: profile.id,
          status: 'draft',
          responses: inspection.responses,
          meta: {
            ...oldMeta,
            amendmentReason: reason.trim(),
          },
          parent_inspection_id: inspection.parent_inspection_id ?? null,
          client_id: (inspection as { client_id?: string | null }).client_id ?? null,
          crm_job_id: (inspection as { crm_job_id?: string | null }).crm_job_id ?? null,
          doc_version: oldVersion + 1,
          amended_from_id: inspection.id,
          amendment_reason: reason.trim(),
          completed_at: null,
        })
        .select()
        .maybeSingle();
      if (insertErr) throw insertErr;
      if (!data) throw new Error('Failed to create amendment');
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      navigate(`/inspections/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create amendment');
    } finally {
      setAmending(false);
    }
  }

  async function handleCopyClientShareLink() {
    if (!inspection || !profile || !existingReport) return;
    setSharing(true);
    setError('');
    try {
      const { data: existing } = await supabase
        .from('inspection_report_shares')
        .select('id, token, revoked, expires_at')
        .eq('inspection_id', inspection.id)
        .eq('revoked', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let token = existing?.token as string | undefined;
      const expired = existing?.expires_at && new Date(existing.expires_at).getTime() < Date.now();
      if (!token || expired) {
        token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const { error: insErr } = await supabase.from('inspection_report_shares').insert({
          company_id: profile.company_id,
          inspection_id: inspection.id,
          token,
          created_by: profile.id,
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
        if (insErr) throw insErr;
      }

      const url = `${window.location.origin}/p?t=${token}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create share link');
    } finally {
      setSharing(false);
    }
  }

  const handleCreateAnnotation = useCallback((partial: Omit<Annotation, 'id'>) => {
    const ann = { ...partial, id: nanoid() } as Annotation;
    setAnnotations(prev => [...prev, ann]);
    setSelectedAnnotationId(ann.id);
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
    if (!existingReport?.id || !profile) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('pdf_annotations')
        .select('id')
        .eq('report_id', existingReport.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('pdf_annotations')
          .update({
            annotation_data: annotations as unknown as Record<string, unknown>,
            updated_by: profile.id,
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('pdf_annotations')
          .insert({
            report_id: existingReport.id,
            annotation_data: annotations as unknown as Record<string, unknown>,
            updated_by: profile.id,
          });
      }
      queryClient.invalidateQueries({ queryKey: ['pdf-annotations', existingReport.id] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save annotations');
    } finally {
      setSaving(false);
    }
  }

  if (inspLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      </AppShell>
    );
  }

  const meta = inspection?.meta as Record<string, string> ?? {};
  const showPdf = pdfUrl || existingReport;
  const docVersion = (inspection as { doc_version?: number | null } | undefined)?.doc_version ?? 1;
  const amendmentReason = (inspection as { amendment_reason?: string | null } | undefined)?.amendment_reason;

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
        <button onClick={() => navigate('/inspections')} className="flex items-center gap-1 text-sm text-[#4A5568] hover:text-[#1A1A1A] mb-3">
          <ChevronLeft size={16} /> Inspections
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-[#1A1A1A]">{meta.siteName ?? 'Inspection Report'}</h1>
              {docVersion > 1 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  v{docVersion}
                </span>
              )}
            </div>
            {existingReport && (
              <p className="text-sm text-[#4A5568] font-mono mt-0.5">
                {existingReport.report_number}
                {reportIsSent((existingReport as { sent_at?: string | null }).sent_at) ? ' · Sent' : ''}
              </p>
            )}
            {docVersion > 1 && amendmentReason && (
              <p className="text-xs text-[#6B7280] mt-1">Amendment: {amendmentReason}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => navigate(`/inspections/new?jobId=${id}`)}
              className="flex items-center gap-1.5 border border-[#2E75B6] text-[#2E75B6] px-3 py-2 rounded-md text-sm font-medium hover:bg-[#EFF6FF] transition-colors"
            >
              <Link2 size={15} /> <Plus size={13} /> Add inspection to job
            </button>
            {existingReport && (
              <button
                onClick={handleCopyClientShareLink}
                disabled={sharing}
                className="flex items-center gap-1.5 border border-[#2E75B6] text-[#2E75B6] px-3 py-2 rounded-md text-sm font-medium hover:bg-[#EFF6FF] disabled:opacity-50 transition-colors"
              >
                {shareCopied ? <Check size={15} /> : <Share2 size={15} />}
                {shareCopied ? 'Link copied' : sharing ? 'Creating…' : 'Client share link'}
              </button>
            )}
            {existingReport && (
              <button
                onClick={handleAmendAndReissue}
                disabled={amending}
                className="flex items-center gap-1.5 border border-amber-300 text-amber-800 px-3 py-2 rounded-md text-sm font-medium hover:bg-amber-50 disabled:opacity-50 transition-colors"
              >
                <FilePlus2 size={15} /> {amending ? 'Creating…' : 'Amend & re-issue'}
              </button>
            )}
            {existingReport && (
              <button onClick={handleEmail} className="flex items-center gap-1.5 border border-[#E5E7EB] text-[#4A5568] px-3 py-2 rounded-md text-sm hover:bg-[#F9FAFB]">
                <Mail size={15} /> {reportIsSent((existingReport as { sent_at?: string | null }).sent_at) ? 'Send again' : 'Send'}
              </button>
            )}
            {pdfUrl && activeTab !== 'annotate' && (
              <button onClick={handleDownloadOriginal} className="flex items-center gap-1.5 border border-[#0A2540] text-[#0A2540] px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0A2540]/5">
                <Download size={15} /> Download PDF
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50"
            >
              {generating ? <><LoadingSpinner size="sm" /> Generating...</> : <><RefreshCw size={15} /> {existingReport ? 'Regenerate PDF' : 'Generate PDF'}</>}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[#E5E7EB] mb-0">
          <button
            onClick={() => setActiveTab('report')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'report' ? 'border-[#2E75B6] text-[#2E75B6]' : 'border-transparent text-[#6B7280] hover:text-[#374151]'
            }`}
          >
            <div className="flex items-center gap-2"><FileText size={16} /> Report</div>
          </button>
          <button
            onClick={() => setActiveTab('annotate')}
            disabled={!showPdf}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors disabled:opacity-40 ${
              activeTab === 'annotate' ? 'border-[#2E75B6] text-[#2E75B6]' : 'border-transparent text-[#6B7280] hover:text-[#374151]'
            }`}
          >
            <div className="flex items-center gap-2"><PenLine size={16} /> Annotate</div>
          </button>
          <button
            onClick={() => setActiveTab('edit')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'edit' ? 'border-[#2E75B6] text-[#2E75B6]' : 'border-transparent text-[#6B7280] hover:text-[#374151]'
            }`}
          >
            <div className="flex items-center gap-2"><Edit2 size={16} /> Edit</div>
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mt-3">
            {error}
          </div>
        )}
        {sendNotice && !error && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm mt-3">
            {sendNotice}
          </div>
        )}

        <div className="flex-1 min-h-0 mt-3">
          {/* Report Tab - simple viewer */}
          {activeTab === 'report' && (
            <>
              {pdfUrl ? (
                <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden shadow-sm h-full">
                  <iframe src={pdfUrl} type="application/pdf" className="w-full h-full" style={{ minHeight: '500px' }} title="PDF Report" />
                </div>
              ) : !generating && (
                <div className="bg-white border border-[#E5E7EB] rounded-lg py-16 text-center shadow-sm">
                  <FileText size={48} className="mx-auto text-[#E5E7EB] mb-3" />
                  <p className="text-[#1A1A1A] font-medium">No PDF generated yet</p>
                  <p className="text-sm text-[#4A5568] mt-1">Click "Generate PDF" to create the report.</p>
                  {existingReport && (
                    <p className="text-xs text-[#4A5568] mt-2">
                      Last generated: {format(new Date(existingReport.generated_at), 'd MMM yyyy HH:mm')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Annotate Tab - full viewer + editor */}
          {activeTab === 'annotate' && pdfUrl && (
            <div className="flex flex-col h-full bg-white border border-[#E5E7EB] rounded-lg overflow-hidden shadow-sm">
              <AnnotationToolbar
                mode="edit"
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
                mode="edit"
              />
            </div>
          )}

          {activeTab === 'annotate' && !pdfUrl && (
            <div className="bg-white border border-[#E5E7EB] rounded-lg py-16 text-center shadow-sm">
              <PenLine size={48} className="mx-auto text-[#E5E7EB] mb-3" />
              <p className="text-[#1A1A1A] font-medium">Generate a PDF first</p>
              <p className="text-sm text-[#4A5568] mt-1">You need to generate the report before you can annotate it.</p>
            </div>
          )}

          {/* Edit Tab */}
          {activeTab === 'edit' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-6 py-12 text-center">
              <Edit2 size={48} className="mx-auto text-blue-300 mb-3" />
              <p className="text-[#1A1A1A] font-medium">Edit Inspection</p>
              <button
                onClick={() => navigate(`/inspections/${id}`)}
                className="mt-4 inline-flex items-center gap-2 bg-[#2E75B6] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#1e5394] transition-colors"
              >
                <Edit2 size={15} /> Open in Editor
              </button>
            </div>
          )}
        </div>
      </div>
      {sendingReport && existingReport?.id && company?.id && (
        <ReportSendDialog
          reportId={existingReport.id}
          company={{
            id: company.id,
            name: company.name,
            abn: (company as { abn?: string | null }).abn ?? null,
            licence_number: (company as { licence_number?: string | null }).licence_number ?? null,
            phone: (company as { phone?: string | null }).phone ?? null,
            email: (company as { email?: string | null }).email ?? null,
            website: (company as { website?: string | null }).website ?? null,
            logo_url: (company as { logo_url?: string | null }).logo_url ?? null,
          }}
          onClose={() => setSendingReport(false)}
          onSent={(_to, message) => {
            setSendingReport(false);
            setSendNotice(message ?? 'Report sent.');
            queryClient.invalidateQueries({ queryKey: ['report', id] });
            queryClient.invalidateQueries({ queryKey: ['inspection', id] });
          }}
        />
      )}
    </AppShell>
  );
}
