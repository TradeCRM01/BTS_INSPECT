import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { nanoid } from '../lib/nanoid';
import { generateJhaPdf } from '../reports/generateJhaPdf';
import {
  LIKELIHOOD_OPTIONS,
  CONSEQUENCE_OPTIONS,
  normalizeJhaStep,
  parseCrewSignOns,
  parseLinkedSwmsIds,
  maxAcceptableResidual,
  lxCProduct,
  type JhaTemplateSchema,
  type JhaStep,
  type JhaSignOff,
  type JhaCrewMember,
} from '../types/jha';
import { JhaStepCard } from '../components/jha/JhaStepCard';
import { JhaCrewRegister } from '../components/jha/JhaCrewRegister';
import { JhaSwmsLibraryPicker } from '../components/jha/JhaSwmsLibraryPicker';
import { EMPTY_SWMS, HRCW_CATEGORIES, parseSwmsMeta, type JhaSwmsData } from '../lib/swmsHrcw';
import {
  ChevronLeft, Plus, Trash2, ShieldCheck, Save, FileText,
  Download, AlertCircle, HardHat, Check, X, CheckCircle, Printer,
  Phone, RefreshCw, ShieldAlert, Package,
} from 'lucide-react';
import { format } from 'date-fns';
import SignatureCanvas from 'react-signature-canvas';

function generateJhaNumber(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `JHA-${y}${m}${d}-${rand}`;
}

interface JhaDocRow {
  id: string;
  template_id: string;
  template_snapshot: { name?: string; schema: JhaTemplateSchema };
  company_id: string;
  created_by: string;
  status: string;
  meta: Record<string, string>;
  steps: JhaStep[];
  ppe: string[];
  sign_offs: JhaSignOff[];
  report_number: string | null;
  pdf_storage_path: string | null;
  client_id: string | null;
  job_id: string | null;
  doc_version: number | null;
  amended_from_id: string | null;
  amendment_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

const EMPTY_STEP: JhaStep = {
  id: '',
  description: '',
  hazards: '',
  consequence: '',
  likelihood: '',
  controls: '',
  controlMeasures: [],
  initialRisk: '',
  residualRisk: '',
  residualLikelihood: '',
  residualConsequence: '',
  residualEscalationNote: '',
  photos: [],
};

export function JhaFillPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();

  const templateId = searchParams.get('templateId');
  const docId = searchParams.get('docId');
  const isEditMode = !!docId;

  const [docIdState, setDocIdState] = useState<string | null>(docId);
  const [meta, setMeta] = useState<Record<string, string>>({ date: format(new Date(), 'yyyy-MM-dd') });
  const [steps, setSteps] = useState<JhaStep[]>([{ ...EMPTY_STEP, id: nanoid() }]);
  const [selectedPpe, setSelectedPpe] = useState<string[]>([]);
  const [customPpeInput, setCustomPpeInput] = useState('');
  const [showRiskMatrix, setShowRiskMatrix] = useState(false);
  const [signOffs, setSignOffs] = useState<JhaSignOff[]>([]);
  const [crew, setCrew] = useState<JhaCrewMember[]>([]);
  const [clientId, setClientId] = useState('');
  const [jobId, setJobId] = useState('');
  const [docVersion, setDocVersion] = useState(1);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [amendedFromId, setAmendedFromId] = useState<string | null>(null);
  const [librarySeeded, setLibrarySeeded] = useState(false);
  const [swms, setSwms] = useState<JhaSwmsData>({ ...EMPTY_SWMS });
  const [linkedSwmsIds, setLinkedSwmsIds] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [publishing, setPublishing] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');
  const sigRefs = useRef<Record<string, SignatureCanvas | null>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: template, isLoading: tmplLoading } = useQuery({
    queryKey: ['jha-template-for-fill', templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jha_templates')
        .select('*')
        .eq('id', templateId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !isEditMode && !!templateId,
  });

  const { data: existingDoc, isLoading: docLoading, isError: docError, refetch: refetchDoc } = useQuery({
    queryKey: ['jha-document', docId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jha_documents')
        .select('*')
        .eq('id', docId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as JhaDocRow;
    },
    enabled: isEditMode,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-for-jha'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name').eq('archived', false).order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs-for-jha'],
    queryFn: async () => {
      const { data, error } = await supabase.from('jobs').select('id, title, client_id').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const { data: take5List = [] } = useQuery({
    queryKey: ['jha-take5-list', docIdState],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jha_take5')
        .select('id, status, created_at, go_no_go, signed_name')
        .eq('jha_document_id', docIdState!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!docIdState,
  });

  const clientJobs = jobs.filter(j => !clientId || j.client_id === clientId);

  const schema: JhaTemplateSchema | null = isEditMode
    ? (existingDoc?.template_snapshot?.schema ?? null)
    : (template?.schema as unknown as JhaTemplateSchema ?? null);

  const templateName = isEditMode
    ? (existingDoc?.template_snapshot?.name ?? 'JHA')
    : (template?.name ?? 'JHA');

  useEffect(() => {
    if (existingDoc) {
      setMeta(existingDoc.meta || { date: format(new Date(), 'yyyy-MM-dd') });
      setSteps(existingDoc.steps?.length
        ? existingDoc.steps.map(s => normalizeJhaStep({ ...EMPTY_STEP, ...s, id: s.id || nanoid() }))
        : [{ ...EMPTY_STEP, id: nanoid() }]);
      setSelectedPpe(existingDoc.ppe || []);
      setSignOffs(existingDoc.sign_offs || []);
      setCrew(parseCrewSignOns(existingDoc.meta?.crewSignOns));
      setDocIdState(existingDoc.id);
      setClientId(existingDoc.client_id ?? '');
      setJobId(existingDoc.job_id ?? '');
      setDocVersion(existingDoc.doc_version ?? 1);
      setAmendmentReason(existingDoc.amendment_reason ?? existingDoc.meta?.amendmentReason ?? '');
      setAmendedFromId(existingDoc.amended_from_id ?? null);
      setLibrarySeeded(true);
      setSwms(parseSwmsMeta(existingDoc.meta?.swms));
      setLinkedSwmsIds(parseLinkedSwmsIds(existingDoc.meta?.linkedSwmsIds));

      if (existingDoc.pdf_storage_path) {
        supabase.storage.from('reports').download(existingDoc.pdf_storage_path).then(({ data: blob, error: dlErr }) => {
          if (!dlErr && blob) {
            const url = URL.createObjectURL(blob);
            setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
          }
        });
      }
    }
  }, [existingDoc]);

  useEffect(() => {
    if (isEditMode || librarySeeded || !template?.schema) return;
    const tmplSchema = template.schema as JhaTemplateSchema;
    const lib = tmplSchema.stepLibrary;
    if (lib?.length) {
      setSteps(lib.map(s => normalizeJhaStep({
        ...EMPTY_STEP,
        ...s,
        id: nanoid(),
        controlMeasures: (s.controlMeasures ?? []).map(m => ({ ...m, id: nanoid(), verify: m.verify ?? '' })),
      })));
    }
    const defaultSwms = tmplSchema.meta?.defaultLinkedSwmsIds;
    if (defaultSwms?.length) {
      setLinkedSwmsIds(defaultSwms.map(String).filter(Boolean));
    }
    setLibrarySeeded(true);
  }, [template, isEditMode, librarySeeded]);

  useEffect(() => {
    if (!isEditMode && schema?.signOffRoles && signOffs.length === 0) {
      setSignOffs(schema.signOffRoles.map(role => ({
        roleId: role.id,
        roleLabel: role.label,
        name: '',
        signature: '',
        date: '',
      })));
    }
  }, [schema, isEditMode, signOffs.length]);

  useEffect(() => {
    if (saveState !== 'unsaved' || !docIdState) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void doSave('draft').catch(() => {});
    }, 2000);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, docIdState, meta, steps, selectedPpe, signOffs, crew, clientId, jobId, swms, linkedSwmsIds]);

  function markUnsaved() { setSaveState('unsaved'); }

  function persistableMeta(): Record<string, string> {
    return {
      ...meta,
      crewSignOns: JSON.stringify(crew),
      swms: JSON.stringify(swms),
      linkedSwmsIds: JSON.stringify(linkedSwmsIds),
    };
  }

  function updateMeta(key: string, value: string) {
    setMeta(prev => ({ ...prev, [key]: value }));
    markUnsaved();
  }

  function updateStep(stepId: string, updates: Partial<JhaStep>) {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...updates } : s));
    markUnsaved();
  }

  function addStep() {
    setSteps(prev => [...prev, { ...EMPTY_STEP, id: nanoid() }]);
    markUnsaved();
  }

  function deleteStep(stepId: string) {
    setSteps(prev => prev.length > 1 ? prev.filter(s => s.id !== stepId) : prev);
    markUnsaved();
  }

  function togglePpe(label: string) {
    setSelectedPpe(prev => prev.includes(label) ? prev.filter(p => p !== label) : [...prev, label]);
    markUnsaved();
  }

  function addCustomPpe() {
    const trimmed = customPpeInput.trim();
    if (!trimmed) return;
    if (!selectedPpe.includes(trimmed)) {
      setSelectedPpe(prev => [...prev, trimmed]);
      markUnsaved();
    }
    setCustomPpeInput('');
  }

  function removePpe(label: string) {
    setSelectedPpe(prev => prev.filter(p => p !== label));
    markUnsaved();
  }

  function updateSignOff(idx: number, updates: Partial<JhaSignOff>) {
    setSignOffs(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
    markUnsaved();
  }

  function clearSignature(idx: number) {
    sigRefs.current[`${idx}`]?.clear();
    updateSignOff(idx, { signature: '' });
  }

  function saveSignature(idx: number) {
    const sig = sigRefs.current[`${idx}`];
    if (!sig) return;
    const dataUrl = sig.toDataURL('image/png');
    updateSignOff(idx, { signature: dataUrl, date: format(new Date(), 'yyyy-MM-dd') });
  }

  function validate(): string[] {
    const errors: string[] = [];
    if (schema?.meta.requiresTaskName && !meta.taskName?.trim()) errors.push('Task / Activity name is required');
    if (schema?.meta.requiresSiteName && !meta.siteName?.trim()) errors.push('Site / Location is required');
    if (schema?.meta.requiresDate && !meta.date?.trim()) errors.push('Date is required');
    if (schema?.meta.requiresSupervisor && !meta.supervisor?.trim()) errors.push('Supervisor is required');
    if (schema?.meta.requiresClient && !meta.clientName?.trim()) errors.push('Client is required');
    if (schema?.meta.requiresPlantArea && !meta.plantArea?.trim()) errors.push('Plant / Area is required');
    if (schema?.meta.requiresShift && !meta.shift?.trim()) errors.push('Shift is required');
    if (schema?.meta.requiresPermitRefs && !meta.permitRefs?.trim()) errors.push('Permit / PTW refs are required');
    if (schema?.meta.requiresMusterPoint && !meta.musterPoint?.trim()) errors.push('Muster point is required');

    (schema?.meta.customFields ?? []).forEach(field => {
      if (field.required && !meta[`custom_${field.id}`]?.trim()) {
        errors.push(`${field.label} is required`);
      }
    });

    const threshold = schema ? maxAcceptableResidual(schema) : 9;

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const n = i + 1;
      if (!s.description.trim()) errors.push(`Step ${n}: description is required`);
      if (!s.likelihood || !s.consequence) errors.push(`Step ${n}: inherent likelihood and consequence are required`);
      const hasControl = (s.controlMeasures ?? []).some(m => m.text.trim()) || !!s.controls.trim();
      if (!hasControl) errors.push(`Step ${n}: add at least one control measure`);
      if (!s.residualLikelihood || !s.residualConsequence) {
        errors.push(`Step ${n}: residual likelihood and consequence are required`);
      }
      const residual = lxCProduct(s.residualLikelihood || '', s.residualConsequence || '');
      if (residual != null && residual > threshold && !s.residualEscalationNote?.trim()) {
        errors.push(`Step ${n}: residual L×C ${residual} exceeds ${threshold} — escalation note required`);
      }
    }

    if (crew.length === 0 || crew.every(c => !c.name.trim())) {
      errors.push('Add at least one crew member to the sign-on register');
    }
    crew.forEach((c, i) => {
      if (!c.name.trim()) return;
      if (!c.signature) {
        errors.push(`Crew ${i + 1} (${c.name}): signature required — sign on this device or send a remote sign link`);
      }
    });

    const requiredSignOffs = (schema?.signOffRoles ?? []).filter(r => r.required);
    for (const role of requiredSignOffs) {
      const sign = signOffs.find(s => s.roleId === role.id);
      if (!sign || !sign.signature) {
        errors.push(`${role.label} signature is required to publish`);
      }
    }

    return errors;
  }

  async function doSave(
    status: 'draft' | 'completed' = 'draft',
    opts?: { navigateOnCreate?: boolean },
  ): Promise<string | null> {
    if (!profile || !schema) return docIdState;
    setSaveState('saving');
    setError('');

    try {
      const payload = {
        meta: persistableMeta(),
        steps,
        ppe: selectedPpe,
        sign_offs: signOffs,
        status,
        client_id: clientId || null,
        job_id: jobId || null,
        doc_version: docVersion,
        amended_from_id: amendedFromId,
        amendment_reason: amendmentReason || null,
        ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      };

      let savedId = docIdState;

      if (docIdState) {
        const { error } = await supabase.from('jha_documents').update(payload).eq('id', docIdState);
        if (error) throw error;
      } else {
        if (!templateId) throw new Error('Missing JHA template — go back and start from a template.');
        const { data, error } = await supabase
          .from('jha_documents')
          .insert({
            template_id: templateId,
            template_snapshot: { name: templateName, schema },
            company_id: profile.company_id,
            created_by: profile.id,
            ...payload,
          })
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error('Failed to create JHA document');
        savedId = data.id;
        setDocIdState(data.id);
        if (opts?.navigateOnCreate !== false) {
          navigate(`/jha/new?docId=${data.id}`, { replace: true });
        }
      }
      setSaveState('saved');
      queryClient.invalidateQueries({ queryKey: ['jha-documents'] });
      queryClient.invalidateQueries({ queryKey: ['jha-document', savedId] });
      return savedId;
    } catch (err) {
      console.error('Save failed:', err);
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Save failed');
      throw err;
    }
  }

  async function handlePublish() {
    if (!profile || !company || !schema) return;
    const errors = validate();
    if (errors.length > 0) {
      setError(errors.join('\n'));
      return;
    }

    setPublishing(true);
    setError('');

    try {
      // Do not navigate mid-publish — that blanked the page ("Failed to load")
      // and left docIdState stale so PDF upload targeted a null path.
      const savedId = await doSave('completed', { navigateOnCreate: false });
      if (!savedId) throw new Error('Could not save JHA before publishing');

      const reportNumber = existingDoc?.report_number ?? generateJhaNumber();
      const snapshot = { name: templateName, schema };

      const blob = await generateJhaPdf({
        document: {
          id: savedId,
          meta: persistableMeta(),
          steps,
          ppe: selectedPpe,
          sign_offs: signOffs,
          completed_at: new Date().toISOString(),
          doc_version: docVersion,
          amendment_reason: amendmentReason || null,
        },
        template: snapshot,
        profile: { name: profile.name, licence_number: profile.licence_number },
        company: {
          name: company.name,
          abn: company.abn,
          phone: company.phone,
          email: company.email,
          website: company.website,
          logo_url: company.logo_url,
        },
        reportNumber,
      });

      const taskName = (meta.taskName ?? meta.siteName ?? 'JHA').replace(/[<>:"/\\|?*]/g, '_');
      const filename = `${taskName} - ${reportNumber}.pdf`;
      const storagePath = `${savedId}/${filename}`;
      const { error: upErr } = await supabase.storage
        .from('reports')
        .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true });

      if (upErr) throw upErr;

      const { error: pubErr } = await supabase.from('jha_documents').update({
        status: 'published',
        report_number: reportNumber,
        pdf_storage_path: storagePath,
      }).eq('id', savedId);
      if (pubErr) throw pubErr;

      const url = URL.createObjectURL(blob);
      setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      setActiveTab('preview');
      queryClient.invalidateQueries({ queryKey: ['jha-documents'] });
      queryClient.invalidateQueries({ queryKey: ['jha-document', savedId] });

      // Sync URL after success so refresh opens the saved doc
      if (searchParams.get('docId') !== savedId) {
        navigate(`/jha/new?docId=${savedId}`, { replace: true });
      }
    } catch (err) {
      console.error('Publish failed:', err);
      setError(err instanceof Error ? err.message : 'Publishing failed');
      setActiveTab('form');
    } finally {
      setPublishing(false);
    }
  }

  async function handleAmend() {
    if (!profile || !schema || !docIdState || !existingDoc) return;
    const reason = window.prompt('Amendment / re-brief reason (required — e.g. scope change, new crew, conditions changed):');
    if (!reason?.trim()) return;

    setError('');
    try {
      const freshSignOffs = schema.signOffRoles.map(role => ({
        roleId: role.id,
        roleLabel: role.label,
        name: '',
        signature: '',
        date: '',
      }));
      const { data, error: insertErr } = await supabase
        .from('jha_documents')
        .insert({
          template_id: existingDoc.template_id,
          template_snapshot: existingDoc.template_snapshot,
          company_id: profile.company_id,
          created_by: profile.id,
          status: 'draft',
          meta: {
            ...persistableMeta(),
            amendmentReason: reason.trim(),
            date: format(new Date(), 'yyyy-MM-dd'),
          },
          steps,
          ppe: selectedPpe,
          sign_offs: freshSignOffs,
          client_id: clientId || null,
          job_id: jobId || null,
          doc_version: (existingDoc.doc_version ?? 1) + 1,
          amended_from_id: existingDoc.id,
          amendment_reason: reason.trim(),
          report_number: null,
          pdf_storage_path: null,
        })
        .select()
        .maybeSingle();
      if (insertErr) throw insertErr;
      if (!data) throw new Error('Failed to create amendment');
      queryClient.invalidateQueries({ queryKey: ['jha-documents'] });
      navigate(`/jha/new?docId=${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create amendment');
    }
  }

  async function handleDownloadPack() {
    if (!profile || !company || !schema || !docIdState) return;
    setPublishing(true);
    setError('');
    try {
      const reportNumber = existingDoc?.report_number ?? generateJhaNumber();
      const blob = await generateJhaPdf({
        document: {
          id: docIdState,
          meta: persistableMeta(),
          steps,
          ppe: selectedPpe,
          sign_offs: signOffs,
          completed_at: new Date().toISOString(),
          doc_version: docVersion,
          amendment_reason: amendmentReason || null,
        },
        template: { name: templateName, schema },
        profile: { name: profile.name, licence_number: profile.licence_number },
        company: {
          name: company.name,
          abn: company.abn,
          phone: company.phone,
          email: company.email,
          website: company.website,
          logo_url: company.logo_url,
        },
        reportNumber,
        packMode: true,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const taskName = (meta.taskName ?? meta.siteName ?? 'JHA').replace(/[<>:"/\\|?*]/g, '_');
      a.download = `${taskName} - Client Pack - ${reportNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Client pack failed');
    } finally {
      setPublishing(false);
    }
  }

  function handleDownload() {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    const taskName = (meta.taskName ?? meta.siteName ?? 'JHA').replace(/[<>:"/\\|?*]/g, '_');
    a.download = `${taskName}.pdf`;
    a.click();
  }

  if (tmplLoading || docLoading) {
    return <AppShell><div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div></AppShell>;
  }

  if (isEditMode && (docError || !existingDoc)) {
    return (
      <AppShell>
        <div className="max-w-[1200px] mx-auto px-4 py-6">
          <PageError
            message="Could not open this JHA document. It may have been deleted or you may not have access."
            onRetry={() => refetchDoc()}
          />
        </div>
      </AppShell>
    );
  }

  if (!schema) {
    return (
      <AppShell>
        <div className="max-w-[1200px] mx-auto px-4 py-6">
          <PageError message="Template not found. Go back and select a JHA template." onRetry={() => navigate('/templates')} />
        </div>
      </AppShell>
    );
  }

  const customFields = schema.meta.customFields ?? [];
  const isPublished = existingDoc?.status === 'published' || (docIdState === existingDoc?.id && existingDoc?.status === 'published');

  function getRiskInfo(riskId: string) {
    return schema!.riskLevels.find(r => r.id === riskId);
  }

  return (
    <AppShell>
      <div className="max-w-[1000px] mx-auto px-4 py-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate('/jha')}
            className="flex items-center gap-1 text-sm text-[#4A5568] hover:text-[#1A1A1A] transition-colors"
          >
            <ChevronLeft size={16} /> JHA documents
          </button>
          <div className="flex items-center gap-3">
            {saveState === 'saved' && docIdState && <span className="text-xs text-[#1B7F3A] flex items-center gap-1"><Check size={12} /> Saved</span>}
            {saveState === 'saving' && <span className="text-xs text-[#4A5568] flex items-center gap-1"><LoadingSpinner size="sm" /> Saving...</span>}
            {saveState === 'unsaved' && <span className="text-xs text-[#92400E]">Unsaved changes</span>}
            {saveState === 'error' && <span className="text-xs text-[#B42318]">Save failed</span>}
            <span className="text-xs text-[#6B7280]">Rev v{docVersion}</span>
            {isPublished && (
              <span className="text-xs text-[#1B7F3A] flex items-center gap-1 bg-[#DCFCE7] px-2 py-1 rounded font-medium">
                <CheckCircle size={12} /> Published
              </span>
            )}
            {isPublished && (
              <button
                type="button"
                onClick={handleAmend}
                className="flex items-center gap-1.5 border border-[#E5E7EB] bg-white text-[#0A2540] px-3 py-2 rounded-md text-sm font-medium hover:bg-[#F9FAFB]"
                title="Create a new revision for re-brief"
              >
                <RefreshCw size={14} /> Amend / re-brief
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleDownloadPack()}
              disabled={publishing || !docIdState}
              className="flex items-center gap-1.5 border border-[#E5E7EB] bg-white text-[#0A2540] px-3 py-2 rounded-md text-sm font-medium hover:bg-[#F9FAFB] disabled:opacity-50"
              title="Branded PDF with SWMS + photos"
            >
              <Package size={14} /> Client pack
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="flex items-center gap-1.5 bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors disabled:opacity-50"
            >
              {publishing ? <><LoadingSpinner size="sm" /> Publishing...</> : <><Printer size={14} /> Publish JHA</>}
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={20} className="text-[#0A2540]" />
            <h1 className="text-xl font-semibold text-[#1A1A1A]">{templateName}</h1>
          </div>
          <p className="text-sm text-[#4A5568]">
            Job Hazard Analysis
            {amendedFromId && amendmentReason ? ` · Amendment: ${amendmentReason}` : ''}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm whitespace-pre-line">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[#E5E7EB] mb-4">
          <button
            onClick={() => setActiveTab('form')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'form' ? 'border-[#2E75B6] text-[#2E75B6]' : 'border-transparent text-[#6B7280] hover:text-[#374151]'}`}
          >
            <span className="flex items-center gap-2"><FileText size={16} /> Form</span>
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'preview' ? 'border-[#2E75B6] text-[#2E75B6]' : 'border-transparent text-[#6B7280] hover:text-[#374151]'}`}
          >
            <span className="flex items-center gap-2"><Printer size={16} /> Published Document</span>
          </button>
        </div>

        {/* FORM TAB */}
        {activeTab === 'form' && (
          <div className="space-y-4">
            {/* Job Details */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <HardHat size={16} className="text-[#4A5568]" />
                <h2 className="text-sm font-medium text-[#1A1A1A]">Job Details</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#4A5568] mb-1 block">Client (CRM)</label>
                  <select
                    value={clientId}
                    onChange={e => {
                      const next = e.target.value;
                      setClientId(next);
                      setJobId('');
                      const name = clients.find(c => c.id === next)?.name ?? '';
                      if (name) updateMeta('clientName', name);
                      markUnsaved();
                    }}
                    className="w-full text-sm border border-[#E5E7EB] rounded px-3 py-2 bg-white"
                  >
                    <option value="">No linked client</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#4A5568] mb-1 block">Job (CRM)</label>
                  <select
                    value={jobId}
                    onChange={e => {
                      setJobId(e.target.value);
                      markUnsaved();
                    }}
                    className="w-full text-sm border border-[#E5E7EB] rounded px-3 py-2 bg-white"
                    disabled={!clientId}
                  >
                    <option value="">{clientId ? 'No linked job' : 'Select a client first'}</option>
                    {clientJobs.map(j => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
                </div>
                {schema.meta.requiresTaskName && (
                  <InputField label="Task / Activity" required value={meta.taskName ?? ''} onChange={v => updateMeta('taskName', v)} />
                )}
                {schema.meta.requiresSiteName && (
                  <InputField label="Site / Location" required value={meta.siteName ?? ''} onChange={v => updateMeta('siteName', v)} />
                )}
                {schema.meta.requiresDate && (
                  <InputField label="Date" required type="date" value={meta.date ?? ''} onChange={v => updateMeta('date', v)} />
                )}
                {schema.meta.requiresSupervisor && (
                  <InputField label="Supervisor" required value={meta.supervisor ?? ''} onChange={v => updateMeta('supervisor', v)} />
                )}
                {schema.meta.requiresClient && (
                  <InputField label="Client" required value={meta.clientName ?? ''} onChange={v => updateMeta('clientName', v)} />
                )}
                {schema.meta.requiresPlantArea && (
                  <InputField label="Plant / Area / Panel" required value={meta.plantArea ?? ''} onChange={v => updateMeta('plantArea', v)} />
                )}
                {schema.meta.requiresShift && (
                  <InputField label="Shift" required value={meta.shift ?? ''} onChange={v => updateMeta('shift', v)} placeholder="e.g. Day / Night / 06:00–18:00" />
                )}
                {schema.meta.requiresPermitRefs && (
                  <InputField label="Permit / PTW / Isolation refs" required value={meta.permitRefs ?? ''} onChange={v => updateMeta('permitRefs', v)} placeholder="Permit #, LOTO #, energy isolation" />
                )}
                {schema.meta.requiresMusterPoint && (
                  <InputField label="Muster point" required value={meta.musterPoint ?? ''} onChange={v => updateMeta('musterPoint', v)} />
                )}
                <InputField label="Site Contact (optional)" value={meta.siteContact ?? ''} onChange={v => updateMeta('siteContact', v)} />
                {customFields.map(field => (
                  <InputField
                    key={field.id}
                    label={field.label}
                    required={field.required}
                    type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                    value={meta[`custom_${field.id}`] ?? ''}
                    onChange={v => updateMeta(`custom_${field.id}`, v)}
                  />
                ))}
              </div>
            </div>

            {/* PPE Selection */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <HardHat size={16} className="text-[#4A5568]" />
                <h2 className="text-sm font-medium text-[#1A1A1A]">Required PPE</h2>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {schema.ppeOptions.map(opt => {
                  const selected = selectedPpe.includes(opt.label);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => togglePpe(opt.label)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                        selected
                          ? 'bg-[#0A2540] text-white border-[#0A2540]'
                          : 'bg-white text-[#4A5568] border-[#E5E7EB] hover:border-[#D1D5DB]'
                      }`}
                    >
                      {selected && <Check size={13} />}
                      {opt.label}
                    </button>
                  );
                })}
                {/* Custom PPE items with remove button */}
                {selectedPpe.filter(p => !schema.ppeOptions.some(o => o.label === p)).map(label => (
                  <span key={label} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border bg-[#2E75B6]/10 text-[#2E75B6] border-[#2E75B6]">
                    {label}
                    <button onClick={() => removePpe(label)} className="hover:text-[#1e5394]">
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
              {/* Add custom PPE */}
              <div className="flex items-center gap-2 pt-2 border-t border-[#F3F4F6]">
                <input
                  type="text"
                  value={customPpeInput}
                  onChange={e => setCustomPpeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomPpe(); } }}
                  placeholder="Add custom PPE item..."
                  className="flex-1 text-sm border border-[#E5E7EB] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                />
                <button
                  onClick={addCustomPpe}
                  disabled={!customPpeInput.trim()}
                  className="flex items-center gap-1 text-sm text-[#2E75B6] hover:text-[#1e5394] font-medium px-3 py-2 border border-[#2E75B6] rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#2E75B6]/5 transition-colors"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            {/* Emergency Contacts (optional) */}
            <EmergencyContactsSection
              contacts={meta.emergencyContacts ? JSON.parse(meta.emergencyContacts) : []}
              onChange={contacts => updateMeta('emergencyContacts', JSON.stringify(contacts))}
            />

            {/* SWMS merge */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-[#4A5568]" />
                  <h2 className="text-sm font-medium text-[#1A1A1A]">SWMS (AU high-risk construction)</h2>
                </div>
                <label className="flex items-center gap-2 text-sm text-[#4A5568]">
                  <input
                    type="checkbox"
                    checked={swms.enabled}
                    onChange={e => {
                      setSwms(s => ({ ...s, enabled: e.target.checked }));
                      markUnsaved();
                    }}
                    className="accent-[#2E75B6]"
                  />
                  Include SWMS page in PDF
                </label>
              </div>
              <p className="text-xs text-[#6B7280] mb-3">
                For Schedule 3 high-risk construction work. Step controls stay in the JHA table; this captures HRCW categories and method notes.
              </p>
              {swms.enabled && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InputField
                      label="Principal contractor"
                      value={swms.principalContractor}
                      onChange={v => { setSwms(s => ({ ...s, principalContractor: v })); markUnsaved(); }}
                    />
                    <InputField
                      label="PCBU"
                      value={swms.pcie}
                      onChange={v => { setSwms(s => ({ ...s, pcie: v })); markUnsaved(); }}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#4A5568] mb-2">HRCW categories</p>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 border border-[#E5E7EB] rounded-lg p-3">
                      {HRCW_CATEGORIES.map(c => {
                        const checked = swms.hrcwCategories.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-start gap-2 text-xs text-[#1A1A1A] cursor-pointer">
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-[#2E75B6]"
                              checked={checked}
                              onChange={() => {
                                setSwms(s => ({
                                  ...s,
                                  hrcwCategories: checked
                                    ? s.hrcwCategories.filter(id => id !== c.id)
                                    : [...s.hrcwCategories, c.id],
                                }));
                                markUnsaved();
                              }}
                            />
                            <span>{c.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#4A5568] mb-1 block">High-risk notes / method</label>
                    <textarea
                      value={swms.highRiskNotes}
                      onChange={e => { setSwms(s => ({ ...s, highRiskNotes: e.target.value })); markUnsaved(); }}
                      rows={2}
                      className="w-full text-sm border border-[#E5E7EB] rounded px-3 py-2 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#4A5568] mb-1 block">Emergency procedures</label>
                    <textarea
                      value={swms.emergencyProcedures}
                      onChange={e => { setSwms(s => ({ ...s, emergencyProcedures: e.target.value })); markUnsaved(); }}
                      rows={2}
                      className="w-full text-sm border border-[#E5E7EB] rounded px-3 py-2 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {profile?.company_id && (
              <JhaSwmsLibraryPicker
                companyId={profile.company_id}
                selectedIds={linkedSwmsIds}
                onChange={ids => {
                  setLinkedSwmsIds(ids);
                  markUnsaved();
                }}
              />
            )}

            {/* Take 5 companions */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} className="text-[#4A5568]" />
                  <h2 className="text-sm font-medium text-[#1A1A1A]">Take 5 / POWRA companions</h2>
                </div>
                <button
                  type="button"
                  disabled={!docIdState}
                  onClick={() => docIdState && navigate(`/jha/take5?jhaId=${docIdState}`)}
                  className="text-xs text-[#2E75B6] hover:underline disabled:opacity-40"
                >
                  + New Take 5
                </button>
              </div>
              <p className="text-xs text-[#6B7280] mb-3">
                Point-of-work checks that reference this JHA. Save the JHA first, then add Take 5s at the workface.
              </p>
              {take5List.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] text-center py-3 border border-dashed border-[#E5E7EB] rounded-lg">No Take 5 records yet</p>
              ) : (
                <ul className="space-y-2">
                  {take5List.map(t => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/jha/take5?jhaId=${docIdState}&id=${t.id}`)}
                        className="w-full text-left text-sm px-3 py-2 rounded-lg border border-[#E5E7EB] hover:border-[#2E75B6] flex items-center justify-between"
                      >
                        <span>{t.signed_name || 'Take 5'} · {t.status} · {t.go_no_go === 'stop' ? 'STOP' : 'GO'}</span>
                        <span className="text-xs text-[#9CA3AF]">{format(new Date(t.created_at), 'd MMM HH:mm')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Job Steps */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-[#4A5568]" />
                  <h2 className="text-sm font-medium text-[#1A1A1A]">Job Steps & Risk Assessment</h2>
                </div>
                <button onClick={addStep} className="flex items-center gap-1 text-xs text-[#2E75B6] hover:text-[#1e5394] font-medium">
                  <Plus size={13} /> Add Step
                </button>
              </div>
              <p className="text-xs text-[#4A5568] mb-3">
                For each task step, identify the hazards and their consequences, then implement controls and assess the residual risk after controls are applied.
              </p>

              {/* Risk Matrix toggle */}
              <button
                onClick={() => setShowRiskMatrix(v => !v)}
                className="flex items-center gap-1.5 text-xs text-[#2E75B6] hover:text-[#1e5394] font-medium mb-3"
              >
                <ShieldCheck size={13} />
                {showRiskMatrix ? 'Hide Risk Matrix' : 'Show Risk Matrix'}
              </button>
              {showRiskMatrix && (
                <div className="mb-4 border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] p-4">
                  <p className="text-xs font-semibold text-[#0A2540] mb-3 uppercase tracking-wide">5×5 Risk Assessment Matrix</p>
                  <p className="text-xs text-[#4A5568] mb-3">Risk = Likelihood × Consequence. Use this matrix to determine the initial and residual risk ratings.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="border border-[#E5E7EB] bg-[#0A2540] text-white px-2 py-1.5 text-left font-medium whitespace-nowrap">
                            Likelihood ↓ / Consequence →
                          </th>
                          {CONSEQUENCE_OPTIONS.map(c => (
                            <th key={c.id} className="border border-[#E5E7EB] bg-[#0A2540] text-white px-1.5 py-1.5 text-center font-medium whitespace-nowrap" title={c.description}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...LIKELIHOOD_OPTIONS].reverse().map(l => (
                          <tr key={l.id}>
                            <td className="border border-[#E5E7EB] bg-[#F3F4F6] px-2 py-1.5 font-medium text-[#1A1A1A] whitespace-nowrap" title={l.description}>
                              {l.label}
                            </td>
                            {CONSEQUENCE_OPTIONS.map(c => {
                              const score = l.score * c.score;
                              const { bg, text } = riskCellStyle(score);
                              return (
                                <td key={c.id} className={`border border-[#E5E7EB] px-1.5 py-1.5 text-center font-bold ${bg} ${text}`}>
                                  {score}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-[#E5E7EB]">
                    {[
                      { label: 'Low (1-4)', color: '#166534' },
                      { label: 'Moderate (5-9)', color: '#B45309' },
                      { label: 'Significant (10-15)', color: '#C2410C' },
                      { label: 'Severe (16-25)', color: '#B91C1C' },
                    ].map(r => (
                      <div key={r.label} className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: r.color }} />
                        <span className="text-xs text-[#4A5568] font-medium">{r.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {steps.map((step, idx) => (
                  <JhaStepCard
                    key={step.id}
                    step={step}
                    index={idx}
                    schema={schema}
                    canDelete={steps.length > 1}
                    maxAcceptableResidual={maxAcceptableResidual(schema)}
                    documentId={docIdState}
                    getRiskInfo={getRiskInfo}
                    onChange={updates => updateStep(step.id, updates)}
                    onDelete={() => deleteStep(step.id)}
                  />
                ))}
              </div>
            </div>

            {profile?.company_id && (
              <JhaCrewRegister
                companyId={profile.company_id}
                documentId={docIdState}
                crew={crew}
                currentUserId={profile.id}
                onChange={next => {
                  setCrew(next);
                  markUnsaved();
                }}
              />
            )}
            {/* Sign-Offs */}
            {signOffs.length > 0 && (
              <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck size={16} className="text-[#4A5568]" />
                  <h2 className="text-sm font-medium text-[#1A1A1A]">Sign-Off & Approval</h2>
                </div>
                <div className="space-y-4">
                  {signOffs.map((sign, idx) => (
                    <div key={sign.roleId} className="border border-[#E5E7EB] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#1A1A1A]">{sign.roleLabel}</span>
                          {schema.signOffRoles.find(r => r.id === sign.roleId)?.required && (
                            <span className="text-xs text-[#B42318] font-medium">* Required</span>
                          )}
                        </div>
                        {sign.signature && (
                          <span className="text-xs text-[#1B7F3A] flex items-center gap-1">
                            <CheckCircle size={12} /> Signed {sign.date && format(new Date(sign.date), 'd MMM yyyy')}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={sign.name}
                        onChange={e => updateSignOff(idx, { name: e.target.value })}
                        placeholder="Full name"
                        className="w-full text-sm border border-[#E5E7EB] rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                      />
                      <div className="border border-[#E5E7EB] rounded-lg bg-white overflow-hidden">
                        <SignatureCanvas
                          ref={(ref: SignatureCanvas | null) => { sigRefs.current[`${idx}`] = ref; }}
                          canvasProps={{ className: 'w-full h-32', style: { touchAction: 'none' } }}
                          onEnd={() => saveSignature(idx)}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <button onClick={() => clearSignature(idx)} className="text-xs text-[#4A5568] hover:text-[#B42318] flex items-center gap-1">
                          <X size={12} /> Clear signature
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save buttons */}
            <div className="flex items-center justify-end gap-3 pb-4">
              <button
                onClick={() => { void doSave('draft').catch(() => {}); }}
                disabled={saveState === 'saving' || publishing}
                className="flex items-center gap-1.5 border border-[#E5E7EB] text-[#4A5568] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#F9FAFB] transition-colors disabled:opacity-50"
              >
                <Save size={14} /> Save Draft
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex items-center gap-1.5 bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors disabled:opacity-50"
              >
                {publishing ? <><LoadingSpinner size="sm" /> Publishing...</> : <><Printer size={14} /> Publish JHA</>}
              </button>
            </div>
          </div>
        )}

        {/* PREVIEW TAB */}
        {activeTab === 'preview' && (
          <div>
            {pdfUrl ? (
              <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB]">
                  <span className="text-sm font-medium text-[#1A1A1A]">Published Document</span>
                  <button onClick={handleDownload} className="flex items-center gap-1.5 border border-[#0A2540] text-[#0A2540] px-3 py-1.5 rounded text-sm font-medium hover:bg-[#0A2540]/5">
                    <Download size={14} /> Download PDF
                  </button>
                </div>
                <iframe src={pdfUrl} className="w-full" style={{ height: '75vh' }} title="JHA PDF" />
              </div>
            ) : (
              <div className="bg-white border border-[#E5E7EB] rounded-lg py-16 text-center shadow-sm">
                <Printer size={48} className="mx-auto text-[#E5E7EB] mb-3" />
                <p className="text-[#1A1A1A] font-medium">No published document yet</p>
                <p className="text-sm text-[#4A5568] mt-1">Fill out the form and click "Publish JHA" to generate a polished PDF.</p>
                <button
                  onClick={() => setActiveTab('form')}
                  className="mt-4 inline-flex items-center gap-2 bg-[#2E75B6] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#1e5394] transition-colors"
                >
                  <FileText size={15} /> Go to Form
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

interface EmergencyContact {
  name: string;
  phone: string;
  role: string;
}

function EmergencyContactsSection({ contacts, onChange }: {
  contacts: EmergencyContact[];
  onChange: (contacts: EmergencyContact[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  function update(i: number, field: keyof EmergencyContact, value: string) {
    const next = contacts.map((c, idx) => idx === i ? { ...c, [field]: value } : c);
    onChange(next);
  }
  function add() {
    onChange([...contacts, { name: '', phone: '', role: '' }]);
  }
  function remove(i: number) {
    onChange(contacts.filter((_, idx) => idx !== i));
  }

  return (
    <div className="mb-5 border border-[#E5E7EB] rounded-lg bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F9FAFB] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Phone size={16} className="text-[#B91C1C]" />
          <span className="text-sm font-semibold text-[#1A1A1A]">Emergency Contacts</span>
          <span className="text-xs text-[#6B7280]">(optional)</span>
          {contacts.length > 0 && (
            <span className="text-xs font-medium text-white bg-[#2E75B6] rounded-full px-2 py-0.5">
              {contacts.filter(c => c.name || c.phone).length}
            </span>
          )}
        </div>
        <Plus size={16} className={`text-[#6B7280] transition-transform ${expanded ? 'rotate-45' : ''}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-[#E5E7EB]">
          <p className="text-xs text-[#6B7280] mb-3">Add site emergency contacts, first aid officers, or key personnel. These appear on the cover page of the finished document.</p>
          {contacts.length === 0 ? (
            <button
              type="button"
              onClick={add}
              className="flex items-center gap-2 text-sm text-[#2E75B6] font-medium hover:underline"
            >
              <Plus size={14} /> Add emergency contact
            </button>
          ) : (
            <div className="space-y-2">
              {contacts.map((c, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                  <input
                    type="text"
                    value={c.role}
                    onChange={e => update(i, 'role', e.target.value)}
                    placeholder="Role (e.g. First Aid Officer)"
                    className="sm:col-span-4 text-sm border border-[#E5E7EB] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] bg-white"
                  />
                  <input
                    type="text"
                    value={c.name}
                    onChange={e => update(i, 'name', e.target.value)}
                    placeholder="Name"
                    className="sm:col-span-4 text-sm border border-[#E5E7EB] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] bg-white"
                  />
                  <input
                    type="tel"
                    value={c.phone}
                    onChange={e => update(i, 'phone', e.target.value)}
                    placeholder="Phone"
                    className="sm:col-span-3 text-sm border border-[#E5E7EB] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="sm:col-span-1 flex items-center justify-center py-2 text-[#B91C1C] hover:bg-[#FEE2E2] rounded transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={add}
                className="flex items-center gap-2 text-sm text-[#2E75B6] font-medium hover:underline mt-1"
              >
                <Plus size={14} /> Add another
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function riskCellStyle(score: number): { bg: string; text: string } {
  if (score >= 16) return { bg: 'bg-[#B91C1C]', text: 'text-white' };
  if (score >= 10) return { bg: 'bg-[#C2410C]', text: 'text-white' };
  if (score >= 5) return { bg: 'bg-[#B45309]', text: 'text-white' };
  return { bg: 'bg-[#166534]', text: 'text-white' };
}

function InputField({ label, required, value, onChange, type = 'text', placeholder }: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-[#4A5568] mb-1 block">
        {label}{required && <span className="text-[#B42318]"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full text-sm border border-[#E5E7EB] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
      />
    </div>
  );
}
