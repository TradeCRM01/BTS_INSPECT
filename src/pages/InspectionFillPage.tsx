import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { InspectionDueReminder } from '../components/inspection/InspectionDueReminder';
import { QuestionRenderer } from '../components/inspection/QuestionRenderer';
import { evaluateShowIf } from '../lib/conditionEval';
import type { TemplateSchema, Section, Question } from '../types/template';
import { ChevronLeft, Plus, Trash2, ChevronDown, Camera, X, Check, ClipboardList } from 'lucide-react';
import { nanoid } from '../lib/nanoid';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { NextBanner, OpsDocHead, OpsStatus, opsSiteLabel } from '../components/ui';
import {
  inspectionFillContext,
  inspectionSectionCompletion,
  inspectionStatusClass,
  inspectionStatusLabel,
  recommendInspectionFillAction,
} from '../lib/inspectionNextAction';
import { applyLivingJobToInspection } from '../lib/livingJha';
import { inspectionDocumentColors } from '../reports/generic_inspection/theme';
import { getAuditClient, getAuditInspection, getAuditJobs } from '../lib/devFieldAuditDocs';
import { isDevFieldAuditAuth } from '../lib/devFieldAuditAuth';

type SaveStatus = 'saved' | 'saving' | 'error' | 'offline';

interface PhotoRecord {
  id?: string;
  storage_path: string;
  url: string;
  caption?: string;
  question_id: string;
  instance_id?: string;
}

interface PendingSave {
  responses: Record<string, unknown>;
  meta: Record<string, string>;
  crm_job_id: string | null;
  client_id: string | null;
}

export function InspectionFillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, company } = useAuth();

  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState('');
  const [sectionInstances, setSectionInstances] = useState<Record<string, string[]>>({});
  const [expandedInstances, setExpandedInstances] = useState<Record<string, boolean>>({});
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState<Record<string, boolean>>({});
  const [showMoreIdentity, setShowMoreIdentity] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const metaRef = useRef<Record<string, string>>({});
  const responsesRef = useRef<Record<string, unknown>>({});

  const { data: inspection, isLoading, isError, refetch } = useQuery({
    queryKey: ['inspection', id],
    queryFn: async () => {
      const mock = getAuditInspection(id!);
      if (mock) return mock as never;
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
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
    staleTime: 0,
    retry: 2,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs-for-inspection-fill'],
    queryFn: async () => {
      const mock = getAuditJobs();
      if (mock) return mock;
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, client_id, address, job_number, scheduled_date, company_id, start_time')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const selectedJobForLiving = jobs.find(j => j.id === jobId);
  const fillClientId = selectedJobForLiving?.client_id
    ?? (inspection as { client_id?: string | null } | null)?.client_id
    ?? null;
  metaRef.current = meta;
  responsesRef.current = responses;

  const { data: dueClient } = useQuery({
    queryKey: ['inspection-due-client', fillClientId],
    queryFn: async () => {
      const mock = getAuditClient(fillClientId!);
      if (mock) return mock;
      const { data, error } = await supabase
        .from('clients')
        .select('id, company_id, name, email, phone, contact_person')
        .eq('id', fillClientId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!fillClientId,
  });

  useEffect(() => {
    if (!id) return;
    supabase.from('photos').select('*').eq('inspection_id', id).then(({ data, error }) => {
      if (error) { console.error('Photo fetch error:', error); return; }
      if (!data?.length) return;
      Promise.all(
        data.map(async p => {
          const { data: signedData } = await supabase.storage.from('photos').createSignedUrl(p.storage_path, 60 * 60 * 24);
          return { ...p, url: signedData?.signedUrl ?? '' };
        })
      ).then(photosWithUrls => setPhotos(photosWithUrls)).catch(err => console.error('Photo URL error:', err));
    });
  }, [id]);

  useEffect(() => {
    if (!inspection) return;
    const savedResponses = inspection.responses as Record<string, unknown> ?? {};
    setResponses(savedResponses);
    setMeta((inspection.meta as Record<string, string> | null) ?? {});
    setJobId((inspection as { crm_job_id?: string | null }).crm_job_id ?? '');

    const instanceMap: Record<string, string[]> = {};
    for (const key of Object.keys(savedResponses)) {
      const parts = key.split('__');
      if (parts.length === 2) {
        const [questionId, instanceId] = parts;
        const schema = (inspection.template_snapshot as unknown as { schema?: TemplateSchema } | null)?.schema;
        if (!schema) continue;
        for (const sec of schema.sections) {
          if (sec.isRepeating && sec.questions.some(q => q.id === questionId)) {
            if (!instanceMap[sec.id]) instanceMap[sec.id] = [];
            if (!instanceMap[sec.id].includes(instanceId)) {
              instanceMap[sec.id].push(instanceId);
            }
            break;
          }
        }
      }
    }
    if (Object.keys(instanceMap).length > 0) {
      setSectionInstances(instanceMap);
    }
  }, [inspection]);

  const snapshotRaw = inspection?.template_snapshot as unknown as { schema?: TemplateSchema } | null;
  const schema = snapshotRaw?.schema ?? null;
  const templateName = (inspection?.template_snapshot as unknown as { name?: string } | null)?.name ?? '';

  const saveInspection = useCallback(async (payload: PendingSave) => {
    if (!id) return;
    if (isDevFieldAuditAuth()) {
      setSaveStatus('saved');
      pendingSaveRef.current = null;
      return;
    }
    setSaveStatus('saving');
    try {
      const { error } = await supabase
        .from('inspections')
        .update({
          responses: payload.responses as unknown as Record<string, unknown>,
          meta: payload.meta as unknown as Record<string, unknown>,
          crm_job_id: payload.crm_job_id,
          client_id: payload.client_id,
        })
        .eq('id', id);
      if (error) throw error;
      setSaveStatus('saved');
      pendingSaveRef.current = null;
    } catch {
      setSaveStatus('error');
      pendingSaveRef.current = payload;
      localStorage.setItem(`insp_${id}_responses`, JSON.stringify(payload.responses));
    }
  }, [id]);

  const debouncedSave = useCallback((payload: PendingSave) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    pendingSaveRef.current = payload;
    saveTimerRef.current = setTimeout(() => { void saveInspection(payload); }, 600);
  }, [saveInspection]);

  function persist(nextResponses = responses, nextMeta = meta, nextJobId = jobId) {
    const job = jobs.find(j => j.id === (nextJobId || ''));
    debouncedSave({
      responses: nextResponses,
      meta: nextMeta,
      crm_job_id: nextJobId || null,
      client_id: job
        ? (job.client_id ?? null)
        : ((inspection as { client_id?: string | null } | null)?.client_id ?? null),
    });
  }

  async function flushAndNavigate(path: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const job = jobs.find(j => j.id === jobId);
    await saveInspection({
      responses,
      meta,
      crm_job_id: jobId || null,
      client_id: job
        ? (job.client_id ?? null)
        : ((inspection as { client_id?: string | null } | null)?.client_id ?? null),
    });
    navigate(path);
  }

  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingSaveRef.current) void saveInspection(pendingSaveRef.current);
    }, 30000);
    return () => clearInterval(interval);
  }, [saveInspection]);

  const livingJob = selectedJobForLiving
    ? {
        id: selectedJobForLiving.id,
        title: selectedJobForLiving.title,
        address: selectedJobForLiving.address,
        client_id: selectedJobForLiving.client_id,
        client_name: dueClient && dueClient.id === selectedJobForLiving.client_id ? (dueClient.name ?? '') : '',
      }
    : null;
  const livingJobKey = livingJob
    ? `${livingJob.id}\0${livingJob.address ?? ''}\0${livingJob.title ?? ''}\0${livingJob.client_id ?? ''}\0${livingJob.client_name}`
    : '';

  useEffect(() => {
    if (!livingJob) return;
    const skipClient = !!livingJob.client_id && !livingJob.client_name;
    const applied = applyLivingJobToInspection(metaRef.current, livingJob, { skipClient });
    if (!applied.changed) return;
    setMeta(applied.meta);
    persist(responsesRef.current, applied.meta, livingJob.id);
  // persist reads latest refs; key is the live job identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livingJobKey]);

  function updateResponse(key: string, value: unknown) {
    const newResponses = { ...responses, [key]: value };
    setResponses(newResponses);
    persist(newResponses);
  }

  function updateMeta(key: string, value: string) {
    const next = { ...meta, [key]: value };
    setMeta(next);
    persist(responses, next);
  }

  function getResponseKey(questionId: string, instanceId?: string) {
    return instanceId ? `${questionId}__${instanceId}` : questionId;
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      </AppShell>
    );
  }

  if (isError || !inspection) {
    return (
      <AppShell>
        <div className="ops-page max-w-[1000px]">
          <PageError
            message="Could not load inspection. It may have been deleted or you don't have access."
            onRetry={() => refetch()}
          />
        </div>
      </AppShell>
    );
  }

  if (!schema) {
    return (
      <AppShell>
        <div className="ops-page max-w-[1000px]">
          <PageError
            message="This inspection has no template data. It may be corrupted."
            onRetry={() => navigate('/inspections')}
          />
        </div>
      </AppShell>
    );
  }

  const visibleSections = schema.sections.filter(sec => {
    if (!sec.showIf) return true;
    return evaluateShowIf(sec.showIf, responses);
  });

  const currentSection = visibleSections[currentSectionIdx] ?? null;
  const isLastSection = visibleSections.length === 0 || currentSectionIdx === visibleSections.length - 1;
  const selectedJob = selectedJobForLiving ?? jobs.find(j => j.id === jobId);
  const living = applyLivingJobToInspection(
    meta,
    selectedJob
      ? {
          id: selectedJob.id,
          title: selectedJob.title,
          address: selectedJob.address,
          client_id: selectedJob.client_id,
          client_name: dueClient && dueClient.id === selectedJob.client_id ? (dueClient.name ?? '') : '',
        }
      : null,
    { skipClient: !!selectedJob?.client_id && dueClient?.id !== selectedJob.client_id },
  );
  const siteLabel = selectedJob
    ? opsSiteLabel(living.siteName, living.siteAddress)
    : opsSiteLabel(meta.siteName, meta.siteAddress);
  const statusKey = inspection.status || 'draft';
  const next = recommendInspectionFillAction(inspectionFillContext({
    status: statusKey,
    saveNeeded: saveStatus === 'error',
    siteParts: selectedJob
      ? [living.siteName, living.siteAddress]
      : [meta.siteName, meta.siteAddress],
    isLastSection,
  }));
  const nextBusy = saveStatus === 'saving';
  const jobNumber = meta.jobNumber
    || (selectedJob?.job_number != null ? String(selectedJob.job_number).padStart(4, '0') : '');
  const when = inspection.started_at ? format(new Date(inspection.started_at), 'd MMM yyyy') : null;
  const jobBound = !!jobId;

  function getSectionCompletion(sec: Section) {
    return inspectionSectionCompletion(sec, responses);
  }

  function addInstance(sectionId: string) {
    const newId = nanoid(8);
    setSectionInstances(prev => ({
      ...prev,
      [sectionId]: [...(prev[sectionId] ?? []), newId],
    }));
    setExpandedInstances(prev => ({ ...prev, [newId]: true }));
  }

  function removeInstance(sectionId: string, instanceId: string) {
    setSectionInstances(prev => ({
      ...prev,
      [sectionId]: (prev[sectionId] ?? []).filter(itemId => itemId !== instanceId),
    }));
    const newResponses = { ...responses };
    Object.keys(newResponses).forEach(key => {
      if (key.includes(`__${instanceId}`)) delete newResponses[key];
    });
    setResponses(newResponses);
    persist(newResponses);
  }

  function getInstanceLabel(sec: Section, instanceId: string) {
    const firstTextQ = sec.questions.find(q => q.type === 'text');
    if (firstTextQ) {
      const val = responses[getResponseKey(firstTextQ.id, instanceId)];
      if (val) return String(val);
    }
    const idx = (sectionInstances[sec.id] ?? []).indexOf(instanceId) + 1;
    return `${sec.repeatLabel ?? 'Item'} ${idx}`;
  }

  function getCommentKey(questionId: string, instanceId?: string) {
    return instanceId ? `${questionId}__${instanceId}__comment` : `${questionId}__comment`;
  }

  function getAttachmentPhotos(questionId: string, instanceId?: string) {
    return photos.filter(p =>
      p.question_id === questionId &&
      p.instance_id === (instanceId ?? undefined) &&
      p.caption === '__attachment__'
    );
  }

  async function handleAttachmentUpload(q: Question, instanceId: string | undefined, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadKey = `${q.id}_${instanceId ?? ''}`;
    setAttachmentUploading(prev => ({ ...prev, [uploadKey]: true }));
    try {
      const path = `${id}/${q.id}${instanceId ? `_${instanceId}` : ''}_attach_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from('photos').upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: signedData } = await supabase.storage.from('photos').createSignedUrl(path, 60 * 60 * 24 * 7);
      const url = signedData?.signedUrl ?? '';
      await supabase.from('photos').insert({
        inspection_id: id!,
        question_id: q.id,
        instance_id: instanceId ?? null,
        storage_path: path,
        caption: '__attachment__',
      });
      setPhotos(prev => [...prev, { storage_path: path, url, question_id: q.id, instance_id: instanceId, caption: '__attachment__' }]);
    } catch (err) {
      console.error('Attachment upload failed:', err);
    } finally {
      setAttachmentUploading(prev => ({ ...prev, [uploadKey]: false }));
      e.target.value = '';
    }
  }

  async function handleAttachmentRemoved(storagePath: string) {
    await supabase.storage.from('photos').remove([storagePath]);
    await supabase.from('photos').delete().eq('storage_path', storagePath);
    setPhotos(prev => prev.filter(p => p.storage_path !== storagePath));
  }

  function renderQuestion(q: Question, instanceId?: string) {
    if (!evaluateShowIf(q.showIf, responses)) return null;

    if (q.type === 'heading') {
      return (
        <div key={q.id} className="pt-3 pb-1">
          <h3 className="text-xs font-bold uppercase tracking-wide text-accent">
            {q.label}
          </h3>
        </div>
      );
    }

    const key = getResponseKey(q.id, instanceId);
    const qPhotos = photos.filter(p =>
      p.question_id === q.id &&
      p.instance_id === (instanceId ?? undefined) &&
      p.caption !== '__attachment__'
    );
    const attachmentPhotos = getAttachmentPhotos(q.id, instanceId);
    const commentKey = getCommentKey(q.id, instanceId);
    const uploadKey = `${q.id}_${instanceId ?? ''}`;

    async function handlePhotoAdded(photo: { storage_path: string; url: string }) {
      const newPhoto: PhotoRecord = {
        ...photo,
        question_id: q.id,
        instance_id: instanceId,
      };
      await supabase.from('photos').insert({
        inspection_id: id!,
        question_id: q.id,
        instance_id: instanceId ?? null,
        storage_path: photo.storage_path,
      });
      setPhotos(prev => [...prev, newPhoto]);
    }

    async function handlePhotoRemoved(storagePath: string) {
      await supabase.storage.from('photos').remove([storagePath]);
      await supabase.from('photos').delete().eq('storage_path', storagePath);
      setPhotos(prev => prev.filter(p => p.storage_path !== storagePath));
    }

    return (
      <div key={key} className="py-3 border-b border-rule last:border-b-0">
        <label className="block text-base font-medium text-navy mb-0.5">
          {q.label}
          {q.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {q.helpText && <p className="text-sm text-muted mb-3">{q.helpText}</p>}
        <div className="mt-2">
          <QuestionRenderer
            question={q}
            value={responses[key]}
            onChange={val => updateResponse(key, val)}
            inspectionId={id!}
            instanceId={instanceId}
            photos={qPhotos}
            onPhotoAdded={handlePhotoAdded}
            onPhotoRemoved={handlePhotoRemoved}
          />
        </div>

        {q.allowPhotos && q.type !== 'photo' && (
          <div className="mt-3 pt-3 border-t border-rule">
            <label className={`flex items-center gap-2 justify-center w-full min-h-[44px] border border-dashed border-rule rounded-md cursor-pointer hover:border-accent/40 transition-colors ${attachmentUploading[uploadKey] ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <Camera size={15} className="text-muted" />
              <span className="text-xs font-medium text-muted">
                {attachmentUploading[uploadKey] ? 'Uploading...' : 'Attach photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => handleAttachmentUpload(q, instanceId, e)}
                disabled={attachmentUploading[uploadKey]}
                className="sr-only"
              />
            </label>
            {attachmentPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {attachmentPhotos.map((photo, i) => (
                  <div key={i} className="relative aspect-square">
                    <img
                      src={photo.url}
                      alt={`Attachment ${i + 1}`}
                      className="w-full h-full object-cover rounded-md border border-rule"
                    />
                    <button
                      type="button"
                      onClick={() => handleAttachmentRemoved(photo.storage_path)}
                      className="absolute top-1 right-1 w-8 h-8 bg-black/60 text-white rounded-md flex items-center justify-center"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {q.allowComments && (
          <div className="mt-3 pt-3 border-t border-rule">
            <label className="ops-field-label">Comments</label>
            <textarea
              value={String(responses[commentKey] ?? '')}
              onChange={e => updateResponse(commentKey, e.target.value)}
              rows={2}
              className="ops-field resize-none"
              placeholder="Add comments..."
            />
          </div>
        )}
      </div>
    );
  }

  function runNext() {
    if (next.key === 'save') {
      void saveInspection({
        responses,
        meta,
        crm_job_id: jobId || null,
        client_id: selectedJob
          ? (selectedJob.client_id ?? null)
          : ((inspection as { client_id?: string | null } | null)?.client_id ?? null),
      });
      return;
    }
    if (next.key === 'site') {
      document.getElementById('insp-identity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (next.key === 'pdf') {
      void flushAndNavigate(`/inspections/${id}/report`);
      return;
    }
    if (next.key === 'review') {
      void flushAndNavigate(`/inspections/${id}/review`);
      return;
    }
    setCurrentSectionIdx(i => Math.min(visibleSections.length - 1, i + 1));
  }

  const saveHint =
    saveStatus === 'saved' ? 'Saved'
      : saveStatus === 'saving' ? 'Saving…'
        : saveStatus === 'error' ? 'Save failed'
          : saveStatus === 'offline' ? 'Offline'
            : null;

  const docColors = inspectionDocumentColors(
    (company as { report_theme?: unknown } | null)?.report_theme ?? null,
  );

  return (
    <AppShell>
      <div
        className={jobBound ? 'hub-job-swms insp-doc-theme' : 'insp-doc-theme'}
        style={{
          '--insp-navy': docColors.navy,
          '--insp-accent': docColors.accent,
          '--insp-navy-light': docColors.navyLight,
          '--insp-accent-light': docColors.accentLight,
        } as CSSProperties}
      >
      <div className="ops-page-fill">
        <div className="flex items-center justify-between gap-3 mb-3">
          <button
            type="button"
            onClick={() => navigate(jobBound ? `/jobs/${jobId}` : '/inspections')}
            className="ops-back"
          >
            <ChevronLeft size={16} /> {jobBound ? 'Back to job' : 'Inspections'}
          </button>
          {saveHint && (
            <span className={`text-xs ${saveStatus === 'error' ? 'text-fail' : saveStatus === 'saving' ? 'text-warning' : 'text-pass flex items-center gap-1'}`}>
              {saveStatus === 'saved' && <Check size={12} />}
              {saveHint}
            </span>
          )}
        </div>

        <article className="ops-card overflow-hidden mb-3">
          <OpsDocHead
            kind="Inspection"
            id={jobNumber ? `#${jobNumber}` : 'Draft'}
            meta={[siteLabel !== 'No site address' ? siteLabel : null, selectedJob?.title, templateName, when].filter(Boolean).join(' · ')}
            trailing={<OpsStatus className={inspectionStatusClass(statusKey)}>{inspectionStatusLabel(statusKey)}</OpsStatus>}
          />
          <div className="px-3 pt-3 pb-2">
            <p className="ops-meta">{templateName || 'Inspection'}</p>
            <div className="mt-2">
              <NextBanner detail={next.detail} />
            </div>
          </div>
        </article>

        <section id="insp-identity" className="ops-card mb-3">
          <div className="ops-tray-head">
            <h2 className="ops-section-title flex items-center gap-2">
              <ClipboardList size={16} /> Job / site
            </h2>
          </div>
          <div className="px-3 pb-3 pt-2 space-y-3">
            <div>
              <label className="ops-field-label">
                Site / location{!jobBound && <span className="text-fail"> *</span>}
              </label>
              {jobBound ? (
                <>
                  <p className="job-swms-site">{living.siteName || 'No site address on this job yet'}</p>
                  <p className="ops-meta mt-1">Site follows this job.</p>
                </>
              ) : (
                <input
                  type="text"
                  value={meta.siteName ?? ''}
                  onChange={e => updateMeta('siteName', e.target.value)}
                  placeholder="Where is this inspection?"
                  className="ops-field-site"
                />
              )}
            </div>
            <div>
              <label className="ops-field-label">Job</label>
              <select
                value={jobId}
                onChange={e => {
                  const nextJob = e.target.value;
                  setJobId(nextJob);
                  const job = jobs.find(j => j.id === nextJob);
                  let nextMeta = { ...meta };
                  if (job) {
                    const applied = applyLivingJobToInspection(meta, {
                      id: job.id,
                      title: job.title,
                      address: job.address,
                      client_id: job.client_id,
                      client_name: dueClient && dueClient.id === job.client_id ? (dueClient.name ?? '') : '',
                    }, { skipClient: !!job.client_id && dueClient?.id !== job.client_id });
                    nextMeta = applied.meta;
                    if (job.job_number != null && !(nextMeta.jobNumber ?? '').trim()) {
                      nextMeta.jobNumber = String(job.job_number).padStart(4, '0');
                    }
                    setMeta(nextMeta);
                  }
                  persist(responses, nextMeta, nextJob);
                }}
                className="ops-field"
              >
                <option value="">No linked job</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.title}{j.address ? ` — ${j.address}` : ''}</option>
                ))}
              </select>
            </div>
            {jobBound && (
              <p className="ops-meta">
                {living.clientName
                  ? `Client follows this job · ${living.clientName}`
                  : 'Client follows this job'}
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowMoreIdentity(v => !v)}
              className={jobBound ? 'job-swms-quiet' : 'flex items-center gap-1 text-xs font-semibold text-accent min-h-[44px]'}
            >
              <ChevronDown size={14} className={showMoreIdentity ? 'rotate-180' : ''} />
              {showMoreIdentity ? 'Hide extra details' : 'More job details'}
            </button>
            {showMoreIdentity && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-rule">
                {!jobBound && (
                  <>
                    <div>
                      <label className="ops-field-label">Site address</label>
                      <input
                        type="text"
                        value={meta.siteAddress ?? ''}
                        onChange={e => updateMeta('siteAddress', e.target.value)}
                        className="ops-field"
                      />
                    </div>
                    <div>
                      <label className="ops-field-label">Client</label>
                      <input
                        type="text"
                        value={meta.clientName ?? ''}
                        onChange={e => updateMeta('clientName', e.target.value)}
                        className="ops-field"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="ops-field-label">Job number</label>
                  <input
                    type="text"
                    value={meta.jobNumber ?? ''}
                    onChange={e => updateMeta('jobNumber', e.target.value)}
                    className="ops-field"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="ops-field-label">Job description</label>
                  <textarea
                    value={meta.jobDescription ?? ''}
                    onChange={e => updateMeta('jobDescription', e.target.value)}
                    rows={2}
                    className="ops-field resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <InspectionDueReminder
          inspection={{
            id: inspection.id,
            inspector_id: inspection.inspector_id,
            client_id: selectedJob?.client_id ?? (inspection as { client_id?: string | null }).client_id ?? null,
            crm_job_id: jobId || null,
            status: inspection.status,
            archived: (inspection as { archived?: boolean | null }).archived ?? false,
            meta,
            responses,
            template_snapshot: inspection.template_snapshot as { name?: string; schema?: TemplateSchema },
            completed_at: inspection.completed_at,
            started_at: inspection.started_at,
            due_on: (inspection as { due_on?: string | null }).due_on ?? null,
            due_reminder_sent_at: (inspection as { due_reminder_sent_at?: string | null }).due_reminder_sent_at ?? null,
            due_reminder_sent_for_date: (inspection as { due_reminder_sent_for_date?: string | null }).due_reminder_sent_for_date ?? null,
          }}
          job={selectedJob ? {
            id: selectedJob.id,
            company_id: (selectedJob as { company_id?: string }).company_id ?? company?.id ?? '',
            client_id: selectedJob.client_id,
            title: selectedJob.title,
            scheduled_date: (selectedJob as { scheduled_date?: string | null }).scheduled_date ?? null,
            start_time: (selectedJob as { start_time?: string | null }).start_time ?? null,
            address: selectedJob.address,
            job_number: selectedJob.job_number,
          } : null}
          client={dueClient ?? null}
          company={company}
        />

        {visibleSections.length > 0 && (
          <div className="ops-tabs mb-3">
            {visibleSections.map((sec, idx) => {
              const completion = getSectionCompletion(sec);
              const isActive = idx === currentSectionIdx;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setCurrentSectionIdx(idx)}
                  className={`ops-tab min-h-[44px] ${isActive ? 'ops-tab-active' : ''}`}
                >
                  <span className={`inline-block w-2 h-2 rounded-sm mr-1.5 align-middle ${
                    completion === 'full' ? 'bg-pass' :
                    completion === 'partial' ? 'bg-warning' :
                    'bg-muted'
                  }`} />
                  {sec.title}
                </button>
              );
            })}
          </div>
        )}

        {currentSection && (
          <section className="ops-card">
            <div className="ops-tray-head">
              <div className="min-w-0">
                <h2 className="ops-section-title">
                  {currentSection.title}
                </h2>
                {currentSection.description && (
                  <p className="ops-meta mt-0.5">{currentSection.description}</p>
                )}
              </div>
              <span className="ops-meta shrink-0">
                {currentSectionIdx + 1} / {visibleSections.length}
              </span>
            </div>
            <div className="px-3 pb-3 pt-1">
              {currentSection.isRepeating ? (
                <div className="space-y-3 pt-2">
                  {(sectionInstances[currentSection.id] ?? []).map((instanceId) => (
                    <div key={instanceId} className="border border-rule rounded-md overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedInstances(prev => ({ ...prev, [instanceId]: !prev[instanceId] }))}
                        className="w-full flex items-center justify-between px-3 min-h-[44px] hover:bg-zebra"
                      >
                        <span className="font-medium text-sm text-ink">
                          {getInstanceLabel(currentSection, instanceId)}
                        </span>
                        <div className="flex items-center gap-1">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); removeInstance(currentSection.id, instanceId); }}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); removeInstance(currentSection.id, instanceId); } }}
                            className="text-muted hover:text-fail w-11 h-11 inline-flex items-center justify-center"
                          >
                            <Trash2 size={14} />
                          </span>
                          <ChevronDown
                            size={16}
                            className={`text-muted transition-transform ${expandedInstances[instanceId] ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </button>
                      {expandedInstances[instanceId] && (
                        <div className="px-3 pb-2 border-t border-rule">
                          {currentSection.questions
                            .filter(q => evaluateShowIf(q.showIf, responses))
                            .map(q => renderQuestion(q, instanceId))}
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addInstance(currentSection.id)}
                    className="flex items-center gap-2 w-full min-h-[44px] border border-dashed border-rule rounded-md text-sm text-accent font-medium hover:border-accent/60 justify-center"
                  >
                    <Plus size={16} /> Add {currentSection.repeatLabel ?? 'Item'}
                  </button>
                </div>
              ) : (
                <div>
                  {currentSection.questions.map(q => renderQuestion(q))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <div className="ops-sticky">
        <div className="max-w-[1000px] mx-auto">
          <button
            type="button"
            onClick={runNext}
            disabled={nextBusy}
            className={jobBound ? 'btn-primary job-swms-primary' : 'ops-next-control-block'}
          >
            {saveStatus === 'saving' && next.key === 'save' ? <><LoadingSpinner size="sm" /> Saving…</> : next.label}
          </button>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
