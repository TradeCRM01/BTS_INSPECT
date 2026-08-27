import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { OpsStatus, opsSiteLabel } from '../components/ui';
import { nanoid } from '../lib/nanoid';
import { generateJhaPdf, jhaPdfCompanyFrom } from '../reports/generateJhaPdf';
import { jhaDocumentColors } from '../reports/jha/theme';
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
import { SignatureCapture } from '../components/ui/SignatureCapture';
import { EMPTY_SWMS, HRCW_CATEGORIES, parseSwmsMeta, type JhaSwmsData } from '../lib/swmsHrcw';
import { getAuditClients, getAuditJhaDoc, getAuditJobs, getAuditTake5List, getAuditTeamMembers } from '../lib/devFieldAuditDocs';
import { isDevFieldAuditAuth } from '../lib/devFieldAuditAuth';
import { jhaFillContext, jhaStatusLabel, recommendJhaFillAction } from '../lib/jhaNextAction';
import { applyLivingJobToJha, livingJobSite, livingTake5MetaPatches } from '../lib/livingJha';
import { take5FillPath, take5ListContext, take5StatusClass, take5StatusLabel, recommendTake5ListAction } from '../lib/take5NextAction';
import {
  ChevronDown, Plus, Trash2, ShieldCheck, FileText,
  Download, AlertCircle, HardHat, Check, X, CheckCircle, Printer,
  Phone, RefreshCw, ShieldAlert, Package, Copy, MoreHorizontal,
} from 'lucide-react';
import { format } from 'date-fns';
import { duplicateJhaDocument } from '../lib/duplicateJhaDocument';

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
  const presetJobId = searchParams.get('jobId') ?? '';
  const presetClientId = searchParams.get('clientId') ?? '';
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
  const [duplicating, setDuplicating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');
  const [showMoreIdentity, setShowMoreIdentity] = useState(false);
  const [showMoreDoc, setShowMoreDoc] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const crewRef = useRef(crew);
  const metaRef = useRef(meta);
  crewRef.current = crew;
  metaRef.current = meta;

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
      const mock = getAuditJhaDoc(docId!);
      if (mock) return mock as unknown as JhaDocRow;
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
      const mock = getAuditClients();
      if (mock) return mock.map(c => ({ id: c.id, name: c.name }));
      const { data, error } = await supabase.from('clients').select('id, name').eq('archived', false).order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs-for-jha'],
    queryFn: async () => {
      const mock = getAuditJobs();
      if (mock) return mock;
      const { data, error } = await supabase.from('jobs').select('id, title, client_id, address, assigned_team').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const { data: teamMembers = [], isSuccess: membersReady } = useQuery({
    queryKey: ['company-members-jha', profile?.company_id],
    queryFn: async () => {
      const mock = getAuditTeamMembers();
      if (mock) return mock;
      const { data, error } = await supabase.rpc('get_company_members', { p_company_id: profile!.company_id });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; email: string; role: string }>;
    },
    enabled: !!profile?.company_id,
  });

  const { data: take5List = [] } = useQuery({
    queryKey: ['jha-take5-list', docIdState],
    queryFn: async () => {
      const mock = getAuditTake5List(docIdState!);
      if (mock) return mock;
      const { data, error } = await supabase
        .from('jha_take5')
        .select('id, status, created_at, go_no_go, signed_name, meta, stop_think, identify_hazards, control_actions, signature')
        .eq('jha_document_id', docIdState!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!docIdState,
  });

  const clientJobs = jobs.filter(j => j.id === jobId || !clientId || j.client_id === clientId);

  const schema: JhaTemplateSchema | null = isEditMode
    ? (existingDoc?.template_snapshot?.schema ?? null)
    : (template?.schema as unknown as JhaTemplateSchema ?? null);

  const templateName = isEditMode
    ? (existingDoc?.template_snapshot?.name ?? 'JHA')
    : (template?.name ?? 'JHA');

  useEffect(() => {
    if (existingDoc) {
      const snapName = existingDoc.template_snapshot?.name ?? 'Job Hazard Analysis';
      const loadedMeta = existingDoc.meta || { date: format(new Date(), 'yyyy-MM-dd') };
      setMeta({
        ...loadedMeta,
        documentTitle: loadedMeta.documentTitle || snapName,
        date: loadedMeta.date || format(new Date(), 'yyyy-MM-dd'),
      });
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
    if (isEditMode) return;
    if (presetClientId) setClientId(presetClientId);
    if (presetJobId) setJobId(presetJobId);
  }, [isEditMode, presetClientId, presetJobId]);

  useEffect(() => {
    if (isEditMode || !presetJobId || jobs.length === 0) return;
    const job = jobs.find(j => j.id === presetJobId);
    if (!job) return;
    if (job.client_id) setClientId(job.client_id);
    const clientName = clients.find(c => c.id === (job.client_id || presetClientId))?.name ?? '';
    setMeta(prev => ({
      ...prev,
      siteName: livingJobSite(job) || prev.siteName || '',
      clientName: prev.clientName || clientName,
    }));
  }, [isEditMode, presetJobId, presetClientId, jobs, clients]);

  const selectedJobForLiving = jobs.find(j => j.id === jobId);
  const livingJobKey = selectedJobForLiving
    ? `${selectedJobForLiving.id}\0${selectedJobForLiving.address ?? ''}\0${(selectedJobForLiving.assigned_team ?? []).join(',')}`
    : '';

  useEffect(() => {
    if (!selectedJobForLiving) return;
    const applied = applyLivingJobToJha(
      { ...metaRef.current, crewSignOns: JSON.stringify(crewRef.current) },
      selectedJobForLiving,
      membersReady ? teamMembers : [],
      {
        skipCrew: !membersReady && (selectedJobForLiving.assigned_team ?? []).length > 0,
        currentUserId: profile?.id,
      },
    );
    if (!applied.changed) return;
    setMeta(prev => ({ ...prev, siteName: applied.siteName || prev.siteName }));
    setCrew(applied.crew);
    if (!docIdState || isDevFieldAuditAuth()) return;
    void supabase
      .from('jha_documents')
      .select('meta')
      .eq('id', docIdState)
      .eq('job_id', selectedJobForLiving.id)
      .maybeSingle()
      .then(async ({ data, error: loadErr }) => {
        if (loadErr) {
          setError(loadErr.message);
          return;
        }
        const merged = {
          ...((data?.meta ?? {}) as Record<string, string>),
          siteName: applied.siteName,
          crewSignOns: JSON.stringify(applied.crew),
        };
        const { error: upErr } = await supabase
          .from('jha_documents')
          .update({ meta: merged })
          .eq('id', docIdState)
          .eq('job_id', selectedJobForLiving.id);
        if (upErr) {
          setError(upErr.message);
          return;
        }
        const { data: take5s, error: take5LoadErr } = await supabase
          .from('jha_take5')
          .select('id, meta')
          .eq('jha_document_id', docIdState);
        if (take5LoadErr) {
          setError(take5LoadErr.message);
          return;
        }
        const take5Patches = livingTake5MetaPatches(
          take5s ?? [],
          selectedJobForLiving,
          membersReady ? teamMembers : [],
          {
            skipCrew: !membersReady && (selectedJobForLiving.assigned_team ?? []).length > 0,
            currentUserId: profile?.id,
          },
        );
        for (const patch of take5Patches) {
          const { error: take5UpErr } = await supabase
            .from('jha_take5')
            .update({ meta: patch.meta, updated_at: new Date().toISOString() })
            .eq('id', patch.id)
            .eq('jha_document_id', docIdState);
          if (take5UpErr) {
            setError(take5UpErr.message);
            return;
          }
        }
        queryClient.invalidateQueries({ queryKey: ['job-jhas', selectedJobForLiving.id] });
        queryClient.invalidateQueries({ queryKey: ['job-take5s', selectedJobForLiving.id] });
        queryClient.invalidateQueries({ queryKey: ['jha-take5-list', docIdState] });
      });
  }, [livingJobKey, membersReady, teamMembers, selectedJobForLiving, docIdState, profile?.id, queryClient]);

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
    // Default published document title from the template name (user can edit)
    setMeta(prev => ({
      ...prev,
      documentTitle: prev.documentTitle || (template.name as string) || 'Job Hazard Analysis',
    }));
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
    const job = jobs.find(j => j.id === jobId);
    const siteName = job ? (livingJobSite(job) || meta.siteName || '') : (meta.siteName ?? '');
    return {
      ...meta,
      siteName,
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

  function validate(): string[] {
    const errors: string[] = [];
    if (schema?.meta.requiresTaskName && !meta.taskName?.trim()) errors.push('Task / Activity name is required');
    const boundJob = jobs.find(j => j.id === jobId);
    if (schema?.meta.requiresSiteName && !(livingJobSite(boundJob) || meta.siteName?.trim())) {
      errors.push('Site / Location is required');
    }
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
      if (jobId) queryClient.invalidateQueries({ queryKey: ['job-jhas', jobId] });
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
        company: jhaPdfCompanyFrom({
          name: company.name,
          abn: company.abn,
          phone: company.phone,
          email: company.email,
          website: company.website,
          logo_url: company.logo_url,
          report_theme: (company as { report_theme?: Record<string, unknown> | null }).report_theme ?? null,
        }),
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

  async function handleDuplicate() {
    if (!profile?.id || !docIdState) return;
    if (!window.confirm('Duplicate this JHA as a new draft? Steps and job details are copied; signatures are cleared.')) {
      return;
    }
    setDuplicating(true);
    setError('');
    try {
      // Persist current edits first so the copy matches what you see
      if (saveState === 'unsaved') {
        const saved = await doSave('draft', { navigateOnCreate: false });
        if (!saved) return;
      }
      const newId = await duplicateJhaDocument(docIdState, profile.id);
      queryClient.invalidateQueries({ queryKey: ['jha-documents'] });
      navigate(`/jha/new?docId=${newId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate JHA');
    } finally {
      setDuplicating(false);
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
        company: jhaPdfCompanyFrom({
          name: company.name,
          abn: company.abn,
          phone: company.phone,
          email: company.email,
          website: company.website,
          logo_url: company.logo_url,
          report_theme: (company as { report_theme?: Record<string, unknown> | null }).report_theme ?? null,
        }),
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
    return (
      <AppShell>
        <div className="ops-page hub-jha is-record-open">
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        </div>
      </AppShell>
    );
  }

  if (isEditMode && (docError || !existingDoc)) {
    return (
      <AppShell>
        <div className="ops-page hub-jha is-record-open">
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
        <div className="ops-page hub-jha is-record-open">
          <PageError message="Template not found. Go back and select a JHA template." onRetry={() => navigate('/templates')} />
        </div>
      </AppShell>
    );
  }

  const customFields = schema.meta.customFields ?? [];
  const isPublished = existingDoc?.status === 'published' || (docIdState === existingDoc?.id && existingDoc?.status === 'published');
  const selectedJob = jobs.find(j => j.id === jobId);
  const siteLabel = opsSiteLabel(
    livingJobSite(selectedJob),
    selectedJob?.address,
    meta.siteName,
    selectedJob?.title,
    meta.taskName,
  );
  const statusKey = isPublished ? 'published' : (existingDoc?.status || 'draft');
  const jobNumber = (selectedJob as { job_number?: number | null } | undefined)?.job_number != null
    ? String((selectedJob as { job_number?: number | null }).job_number).padStart(4, '0')
    : '';
  const when = meta.date ? format(new Date(meta.date), 'd MMM yyyy') : null;
  const jobLine = [jobNumber ? `#${jobNumber}` : null, selectedJob?.title || meta.taskName || templateName || null]
    .filter(Boolean)
    .join(' ');
  const clientLine = meta.clientName || clients.find(c => c.id === clientId)?.name || '';
  const sheetPill = statusKey === 'published' ? 'is-published' : statusKey === 'completed' ? 'is-ready' : 'is-draft';
  const next = recommendJhaFillAction(jhaFillContext({
    status: statusKey,
    saved: !!docIdState,
    hasPdf: !!pdfUrl,
    siteParts: [meta.siteName, selectedJob?.address, selectedJob?.title, meta.taskName],
    steps,
    crew,
    signOffRoles: schema.signOffRoles ?? [],
    signOffs,
  }));
  const nextBusy = publishing || saveState === 'saving' || duplicating;

  function getRiskInfo(riskId: string) {
    return schema!.riskLevels.find(r => r.id === riskId);
  }

  function runNext() {
    if (next.key === 'save') {
      void doSave('draft').catch(() => {});
      return;
    }
    if (next.key === 'publish') {
      void handlePublish();
      return;
    }
    setActiveTab('form');
    if (next.key === 'pdf') {
      setActiveTab('preview');
      return;
    }
    const target =
      next.key === 'site' ? 'jha-identity'
        : next.key === 'steps' ? 'jha-steps'
          : next.key === 'crew' ? 'jha-crew'
            : 'jha-signoff';
    if (next.key === 'sign' && crew.some(c => c.name.trim() && !c.signature)) {
      scrollToId('jha-crew');
      return;
    }
    scrollToId(target);
  }

  const saveHint =
    saveState === 'saved' && docIdState ? 'Saved'
      : saveState === 'saving' ? 'Saving…'
        : saveState === 'unsaved' ? 'Unsaved'
          : saveState === 'error' ? 'Save failed'
            : null;

  const jobBound = !!jobId;
  const docColors = jhaDocumentColors(
    (company as { report_theme?: unknown } | null)?.report_theme ?? null,
  );

  return (
    <AppShell>
      <div
        className="ops-page hub-jha is-record-open jha-doc-theme"
        style={{
          '--jha-navy': docColors.navy,
          '--jha-accent': docColors.accent,
          '--jha-navy-light': docColors.navyLight,
          '--jha-accent-light': docColors.accentLight,
        } as CSSProperties}
      >
        <div className="hub-jha-open-chrome">
          <Link
            to={jobBound ? `/jobs/${jobId}` : '/jha'}
            className="hub-jha-label"
          >
            JHA documents
          </Link>
          {saveHint && saveState !== 'saved' && (
            <span className={`hub-jha-save ${saveState === 'error' ? 'is-bad' : ''}`}>
              {saveHint}
            </span>
          )}
        </div>

        <article className="hub-jha-document">
          <header className="hub-jha-sheet-bar">
            <span className="hub-jha-hours">{when || jhaStatusLabel(statusKey)}</span>
            <span className={`hub-jha-pill ${sheetPill}`}>{jhaStatusLabel(statusKey)}</span>
          </header>
          <div className="hub-jha-sheet-body">
            <h1 className="hub-jha-hero">{siteLabel}</h1>
            {jobLine ? <p className="hub-jha-jobline">{jobLine}</p> : null}

            <div className="hub-jha-tools">
              <button
                type="button"
                onClick={runNext}
                disabled={nextBusy}
                className="hub-jha-primary"
              >
                {publishing || (saveState === 'saving' && next.key === 'save')
                  ? <><LoadingSpinner size="sm" /> {publishing ? 'Publishing…' : 'Saving…'}</>
                  : <><FileText size={16} /> {next.label}</>}
              </button>
              <button
                type="button"
                onClick={() => setShowMoreIdentity(v => !v)}
                className="hub-jha-sub"
              >
                {showMoreIdentity ? 'Hide extra details' : 'More job details'}
              </button>
              <details className="hub-jha-more">
                <summary aria-label="More">
                  <MoreHorizontal size={16} />
                </summary>
                <div className="hub-jha-more-menu">
                  {docIdState && (
                    <button
                      type="button"
                      onClick={() => void handleDuplicate()}
                      disabled={duplicating || publishing}
                    >
                      {duplicating ? 'Duplicating…' : 'Duplicate as new draft'}
                    </button>
                  )}
                  {isPublished && (
                    <button type="button" onClick={handleAmend}>
                      Amend / re-brief
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDownloadPack()}
                    disabled={publishing || !docIdState}
                  >
                    Client pack
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab(activeTab === 'preview' ? 'form' : 'preview')}
                  >
                    {activeTab === 'preview' ? 'Fill' : 'PDF'}
                  </button>
                </div>
              </details>
            </div>

            <div className="hub-jha-ledger">
              {clientLine ? (
                <p className="hub-jha-ledger-row">
                  <span className="hub-jha-muted">{clientLine}</span>
                </p>
              ) : null}
              {templateName ? (
                <p className="hub-jha-ledger-row">
                  <span className="hub-jha-muted">{templateName}</span>
                </p>
              ) : null}
              <p className="hub-jha-ledger-row">
                <span className="hub-jha-muted">{jobNumber ? `#${jobNumber}` : existingDoc?.report_number || 'JHA'}</span>
                {when ? <span className="hub-jha-hours">{when}</span> : null}
              </p>
            </div>

            {error && (
              <div className="hub-jha-alert whitespace-pre-line">
                {error}
              </div>
            )}

            <section id="jha-identity" className={`hub-jha-identity${showMoreIdentity || next.key === 'site' ? ' is-open' : ''}`}>
              <div className="hub-jha-ledger-row hub-jha-field">
                <label className="hub-jha-muted">
                  Document title
                </label>
                <input
                  type="text"
                  value={meta.documentTitle ?? ''}
                  onChange={e => updateMeta('documentTitle', e.target.value)}
                  placeholder={templateName || 'Job Hazard Analysis'}
                  className="hub-jha-input"
                />
              </div>
              <div className="hub-jha-ledger-row hub-jha-field">
                <label className="hub-jha-muted">
                  Site / location{schema.meta.requiresSiteName && <span className="hub-jha-req"> *</span>}
                </label>
                {jobId && selectedJob ? (
                  <p className="hub-jha-field-value">
                    {livingJobSite(selectedJob) || 'No site address on this job yet'}
                    <span className="hub-jha-muted"> Site follows this job.</span>
                  </p>
                ) : (
                  <input
                    type="text"
                    value={meta.siteName ?? ''}
                    onChange={e => updateMeta('siteName', e.target.value)}
                    placeholder="Where is the work?"
                    className="hub-jha-input"
                  />
                )}
              </div>
              <div className="hub-jha-ledger-row hub-jha-field">
                <label className="hub-jha-muted">Job</label>
                <select
                  value={jobId}
                  onChange={e => {
                    const nextJob = e.target.value;
                    setJobId(nextJob);
                    const job = jobs.find(j => j.id === nextJob);
                    if (job?.client_id) {
                      setClientId(job.client_id);
                      const name = clients.find(c => c.id === job.client_id)?.name ?? '';
                      if (name) updateMeta('clientName', name);
                    }
                    if (job) {
                      const nextSite = livingJobSite(job);
                      if (nextSite) updateMeta('siteName', nextSite);
                    }
                    markUnsaved();
                  }}
                  className="hub-jha-input"
                >
                  <option value="">No linked job</option>
                  {clientJobs.map(j => (
                    <option key={j.id} value={j.id}>{j.title}{j.address ? ` — ${j.address}` : ''}</option>
                  ))}
                </select>
              </div>
              {schema.meta.requiresTaskName && (
                <InputField label="Task / Activity" required value={meta.taskName ?? ''} onChange={v => updateMeta('taskName', v)} />
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
              {showMoreIdentity && (
                <>
                  <div className="hub-jha-ledger-row hub-jha-field">
                    <label className="hub-jha-muted">Client (CRM)</label>
                    <select
                      value={clientId}
                      onChange={e => {
                        const nextClient = e.target.value;
                        setClientId(nextClient);
                        setJobId('');
                        const name = clients.find(c => c.id === nextClient)?.name ?? '';
                        if (name) updateMeta('clientName', name);
                        markUnsaved();
                      }}
                      className="hub-jha-input"
                    >
                      <option value="">No linked client</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
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
                </>
              )}
            </section>

            <div className="hub-jha-tabs" role="tablist" aria-label="JHA views">
              <button
                type="button"
                onClick={() => setActiveTab('form')}
                className={`hub-jha-tab ${activeTab === 'form' ? 'is-on' : ''}`}
              >
                Fill
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`hub-jha-tab ${activeTab === 'preview' ? 'is-on' : ''}`}
              >
                PDF
              </button>
            </div>

        {activeTab === 'form' && (
          <div className="hub-jha-fill">

            <section className="ops-card">
              <div className="ops-tray-head">
                <h2 className="ops-section-title flex items-center gap-2">
                  <HardHat size={16} /> Required PPE
                </h2>
              </div>
              <div className="px-3 pb-3 pt-2">
                <div className="flex flex-wrap gap-2 mb-3">
                  {schema.ppeOptions.map(opt => {
                    const selected = selectedPpe.includes(opt.label);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => togglePpe(opt.label)}
                        className={`flex items-center gap-1.5 px-3 min-h-[44px] rounded-md text-sm font-medium border transition-all ${
                          selected
                            ? 'bg-navy text-white border-navy'
                            : 'bg-white text-muted border-rule hover:border-navy/25'
                        }`}
                      >
                        {selected && <Check size={13} />}
                        {opt.label}
                      </button>
                    );
                  })}
                  {selectedPpe.filter(p => !schema.ppeOptions.some(o => o.label === p)).map(label => (
                    <span key={label} className="flex items-center gap-1.5 px-3 min-h-[44px] rounded-md text-sm font-medium border bg-accent/10 text-accent border-accent">
                      {label}
                      <button type="button" onClick={() => removePpe(label)} className="hover:text-navy min-w-[44px] min-h-[44px] inline-flex items-center justify-center">
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-rule">
                  <input
                    type="text"
                    value={customPpeInput}
                    onChange={e => setCustomPpeInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomPpe(); } }}
                    placeholder="Add custom PPE item..."
                    className="ops-field flex-1"
                  />
                  <button
                    type="button"
                    onClick={addCustomPpe}
                    disabled={!customPpeInput.trim()}
                    className="flex items-center gap-1 text-sm text-accent font-medium px-3 min-h-[44px] border border-accent rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/5"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            </section>

            <section id="jha-steps" className="ops-card">
              <div className="ops-tray-head">
                <h2 className="ops-section-title flex items-center gap-2">
                  <AlertCircle size={16} /> Hazards, steps & controls
                </h2>
                <button type="button" onClick={addStep} className="flex items-center gap-1 text-xs font-semibold text-accent min-h-[44px]">
                  <Plus size={13} /> Add step
                </button>
              </div>
              <div className="px-3 pb-3 pt-2">
                <p className="ops-meta mb-3">
                  For each step: what can go wrong, then the controls that bring residual risk down.
                </p>
                <button
                  type="button"
                  onClick={() => setShowRiskMatrix(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-accent mb-3 min-h-[44px]"
                >
                  <ShieldCheck size={13} />
                  {showRiskMatrix ? 'Hide risk matrix' : 'Show risk matrix'}
                </button>
                {showRiskMatrix && (
                  <div className="mb-4 border border-rule rounded-md bg-zebra p-4">
                    <p className="text-xs font-semibold text-navy mb-3 uppercase tracking-wide">5×5 Risk Assessment Matrix</p>
                    <p className="text-xs text-muted mb-3">Risk = Likelihood × Consequence. Use this matrix to determine the initial and residual risk ratings.</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr>
                            <th className="border border-rule bg-navy text-white px-2 py-1.5 text-left font-medium whitespace-nowrap">
                              Likelihood ↓ / Consequence →
                            </th>
                            {CONSEQUENCE_OPTIONS.map(c => (
                              <th key={c.id} className="border border-rule bg-navy text-white px-1.5 py-1.5 text-center font-medium whitespace-nowrap" title={c.description}>
                                {c.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...LIKELIHOOD_OPTIONS].reverse().map(l => (
                            <tr key={l.id}>
                              <td className="border border-rule bg-zebra px-2 py-1.5 font-medium text-ink whitespace-nowrap" title={l.description}>
                                {l.label}
                              </td>
                              {CONSEQUENCE_OPTIONS.map(c => {
                                const score = l.score * c.score;
                                const { bg, text } = riskCellStyle(score);
                                return (
                                  <td key={c.id} className={`border border-rule px-1.5 py-1.5 text-center font-bold ${bg} ${text}`}>
                                    {score}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-rule">
                      {[
                        { label: 'Low (1-4)', color: '#166534' },
                        { label: 'Moderate (5-9)', color: '#B45309' },
                        { label: 'Significant (10-15)', color: '#C2410C' },
                        { label: 'Severe (16-25)', color: '#B91C1C' },
                      ].map(r => (
                        <div key={r.label} className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: r.color }} />
                          <span className="text-xs text-muted font-medium">{r.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-3">
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
            </section>

            <div id="jha-crew">
              {jobId && selectedJob && (
                <p className="ops-meta mb-2 px-1">
                  Crew follows who is assigned on this job.
                </p>
              )}
              {profile?.company_id && (
                <JhaCrewRegister
                  companyId={profile.company_id}
                  documentId={docIdState}
                  crew={crew}
                  currentUserId={profile.id}
                  onChange={nextCrew => {
                    setCrew(nextCrew);
                    markUnsaved();
                  }}
                />
              )}
            </div>

            {signOffs.length > 0 && (
              <section id="jha-signoff" className="ops-card">
                <div className="ops-tray-head">
                  <h2 className="ops-section-title flex items-center gap-2">
                    <ShieldCheck size={16} /> Supervisor sign-off
                  </h2>
                </div>
                <div className="px-3 pb-3 pt-2 space-y-3">
                  {signOffs.map((sign, idx) => (
                    <div key={sign.roleId} className="border border-rule rounded-md p-3">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink">{sign.roleLabel}</span>
                          {schema.signOffRoles.find(r => r.id === sign.roleId)?.required && (
                            <span className="text-xs text-fail font-medium">* Required</span>
                          )}
                        </div>
                        {sign.signature && (
                          <span className="text-xs text-pass flex items-center gap-1">
                            <CheckCircle size={12} /> Signed {sign.date && format(new Date(sign.date), 'd MMM yyyy')}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={sign.name}
                        onChange={e => updateSignOff(idx, { name: e.target.value })}
                        placeholder="Full name"
                        className="ops-field mb-3"
                      />
                      <SignatureCapture
                        value={sign.signature || ''}
                        nameHint={sign.name || profile?.name || ''}
                        onChange={dataUrl => {
                          if (!dataUrl) {
                            updateSignOff(idx, { signature: '' });
                            return;
                          }
                          updateSignOff(idx, {
                            signature: dataUrl,
                            date: format(new Date(), 'yyyy-MM-dd'),
                            name: sign.name || profile?.name || '',
                          });
                        }}
                        onClear={() => updateSignOff(idx, { signature: '' })}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="ops-card">
              <button
                type="button"
                onClick={() => setShowMoreDoc(v => !v)}
                className="w-full ops-tray-head min-h-[44px]"
              >
                <span className="ops-section-title">SWMS, Take 5 & extras</span>
                <ChevronDown size={16} className={`text-muted ${showMoreDoc ? 'rotate-180' : ''}`} />
              </button>
              {showMoreDoc && (
                <div className="px-3 pb-3 pt-2 space-y-3 border-t border-rule">
                  <EmergencyContactsSection
                    contacts={meta.emergencyContacts ? JSON.parse(meta.emergencyContacts) : []}
                    onChange={contacts => updateMeta('emergencyContacts', JSON.stringify(contacts))}
                  />

                  <div className="border border-rule rounded-md p-3">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-muted" />
                        <h3 className="text-sm font-medium text-ink">SWMS (AU high-risk construction)</h3>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-muted min-h-[44px]">
                        <input
                          type="checkbox"
                          checked={swms.enabled}
                          onChange={e => {
                            setSwms(s => ({ ...s, enabled: e.target.checked }));
                            markUnsaved();
                          }}
                          className="accent-accent"
                        />
                        Include SWMS page in PDF
                      </label>
                    </div>
                    <p className="ops-meta mb-3">
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
                          <p className="text-xs font-medium text-muted mb-2">HRCW categories</p>
                          <div className="max-h-48 overflow-y-auto space-y-1.5 border border-rule rounded-md p-3">
                            {HRCW_CATEGORIES.map(c => {
                              const checked = swms.hrcwCategories.includes(c.id);
                              return (
                                <label key={c.id} className="flex items-start gap-2 text-xs text-ink cursor-pointer min-h-[44px]">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 accent-accent"
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
                          <label className="ops-field-label">High-risk notes / method</label>
                          <textarea
                            value={swms.highRiskNotes}
                            onChange={e => { setSwms(s => ({ ...s, highRiskNotes: e.target.value })); markUnsaved(); }}
                            rows={2}
                            className="ops-field resize-none"
                          />
                        </div>
                        <div>
                          <label className="ops-field-label">Emergency procedures</label>
                          <textarea
                            value={swms.emergencyProcedures}
                            onChange={e => { setSwms(s => ({ ...s, emergencyProcedures: e.target.value })); markUnsaved(); }}
                            rows={2}
                            className="ops-field resize-none"
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

                  <div className="border border-rule rounded-md p-3">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldAlert size={16} className="text-muted" />
                        <h3 className="text-sm font-medium text-ink">Take 5 / POWRA companions</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate('/jha/take5')}
                          className="text-xs font-semibold text-accent min-h-[44px]"
                        >
                          All Take 5s
                        </button>
                        <button
                          type="button"
                          disabled={!docIdState}
                          onClick={() => docIdState && navigate(take5FillPath(docIdState))}
                          className="text-xs font-semibold text-accent min-h-[44px] disabled:opacity-40"
                        >
                          + New Take 5
                        </button>
                      </div>
                    </div>
                    <p className="ops-meta mb-3">
                      Point-of-work checks that reference this JHA. Save the JHA first, then add Take 5s at the workface.
                    </p>
                    {take5List.length === 0 ? (
                      <p className="text-sm text-muted text-center py-3 border border-dashed border-rule rounded-md">No Take 5 records yet</p>
                    ) : (
                      <ul className="space-y-2">
                        {take5List.map(t => {
                          const next = recommendTake5ListAction(take5ListContext({
                            status: t.status,
                            meta: (t.meta ?? {}) as Record<string, string>,
                            stop_think: t.stop_think,
                            identify_hazards: t.identify_hazards,
                            control_actions: t.control_actions,
                            signature: t.signature,
                            parent_site: meta.siteName,
                            job_title: selectedJob?.title,
                            job_address: selectedJob?.address,
                            livingSite: livingJobSite(selectedJob),
                          }));
                          return (
                            <li key={t.id}>
                              <button
                                type="button"
                                onClick={() => navigate(take5FillPath(docIdState!, t.id))}
                                className="w-full text-left text-sm px-3 py-2.5 min-h-[44px] rounded-md border border-rule hover:border-accent flex items-center justify-between gap-2"
                              >
                                <span className="min-w-0 truncate">
                                  {t.signed_name || t.meta?.location || 'Take 5'}
                                  {' · '}
                                  {t.go_no_go === 'stop' ? 'STOP' : 'GO'}
                                </span>
                                <span className="flex items-center gap-2 shrink-0">
                                  <OpsStatus className={take5StatusClass(t.status)}>{take5StatusLabel(t.status)}</OpsStatus>
                                  <span className="text-xs font-semibold text-accent">{next.label}</span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {!jobBound && (
                  <div className="flex flex-col gap-2">
                    {docIdState && (
                      <button
                        type="button"
                        onClick={() => void handleDuplicate()}
                        disabled={duplicating || publishing}
                        className="btn-secondary w-full min-h-[44px] justify-center"
                        title="Copy as a new draft (signatures cleared)"
                      >
                        {duplicating ? <LoadingSpinner size="sm" /> : <Copy size={14} />} Duplicate as new draft
                      </button>
                    )}
                    {isPublished && (
                      <button
                        type="button"
                        onClick={handleAmend}
                        className="btn-secondary w-full min-h-[44px] justify-center"
                        title="Create a new revision for re-brief"
                      >
                        <RefreshCw size={14} /> Amend / re-brief
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDownloadPack()}
                      disabled={publishing || !docIdState}
                      className="btn-secondary w-full min-h-[44px] justify-center"
                      title="Branded PDF with SWMS + photos"
                    >
                      <Package size={14} /> Client pack
                    </button>
                  </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="hub-jha-fill">
            {pdfUrl ? (
              <div className="ops-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-rule bg-zebra">
                  <span className="text-sm font-medium text-ink">Published document</span>
                  <button type="button" onClick={handleDownload} className="ops-next-control">
                    <Download size={14} /> Download PDF
                  </button>
                </div>
                <iframe src={pdfUrl} className="w-full" style={{ height: '75vh' }} title="JHA PDF" />
              </div>
            ) : (
              <div className="ops-card py-16 text-center">
                <Printer size={48} className="mx-auto text-rule mb-3" />
                <p className="text-ink font-medium">No published document yet</p>
                <p className="ops-meta mt-1">Fill the JHA, get signatures, then publish.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('form')}
                  className="mt-4 hub-jha-sub"
                >
                  <FileText size={15} /> Back to fill
                </button>
              </div>
            )}
          </div>
        )}
          </div>
        </article>
      </div>
    </AppShell>
  );
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    <div className="border border-rule rounded-md bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-3 min-h-[44px] hover:bg-zebra transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Phone size={16} className="text-fail" />
          <span className="text-sm font-semibold text-ink">Emergency Contacts</span>
          <span className="text-xs text-muted">(optional)</span>
          {contacts.length > 0 && (
            <span className="ops-status ops-status-info">
              {contacts.filter(c => c.name || c.phone).length}
            </span>
          )}
        </div>
        <Plus size={16} className={`text-muted transition-transform ${expanded ? 'rotate-45' : ''}`} />
      </button>
      {expanded && (
        <div className="px-3 pb-4 pt-2 border-t border-rule">
          <p className="ops-meta mb-3">Add site emergency contacts, first aid officers, or key personnel. These appear on the cover page of the finished document.</p>
          {contacts.length === 0 ? (
            <button
              type="button"
              onClick={add}
              className="flex items-center gap-2 text-sm text-accent font-medium min-h-[44px]"
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
                    className="sm:col-span-4 ops-field"
                  />
                  <input
                    type="text"
                    value={c.name}
                    onChange={e => update(i, 'name', e.target.value)}
                    placeholder="Name"
                    className="sm:col-span-4 ops-field"
                  />
                  <input
                    type="tel"
                    value={c.phone}
                    onChange={e => update(i, 'phone', e.target.value)}
                    placeholder="Phone"
                    className="sm:col-span-3 ops-field"
                  />
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="sm:col-span-1 flex items-center justify-center min-h-[44px] text-fail hover:bg-[#FEE2E2] rounded-md transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={add}
                className="flex items-center gap-2 text-sm text-accent font-medium min-h-[44px] mt-1"
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
    <div className="hub-jha-ledger-row hub-jha-field">
      <label className="hub-jha-muted">
        {label}{required && <span className="hub-jha-req"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="hub-jha-input"
      />
    </div>
  );
}
