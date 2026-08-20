import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import type { TemplateSchema } from '../types/template';
import { ChevronLeft, Play, Zap, LayoutTemplate, Link2, Briefcase } from 'lucide-react';

export function NewInspectionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedId = searchParams.get('templateId');
  /** Parent *inspection* id (inspection job grouping) */
  const parentInspectionId = searchParams.get('jobId');
  /** CRM jobs.id deep-link */
  const crmJobId = searchParams.get('crmJobId');
  const { profile } = useAuth();

  const [selectedTemplateId, setSelectedTemplateId] = useState(preSelectedId ?? '');
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [clientId, setClientId] = useState<string | null>(null);
  const [linkedCrmJobId, setLinkedCrmJobId] = useState<string | null>(crmJobId);

  const { data: templates, isLoading, isError, refetch } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('id, name, report_renderer, schema')
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const { data: parentInspection } = useQuery({
    queryKey: ['inspection', parentInspectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('id, meta, template_snapshot, client_id, crm_job_id')
        .eq('id', parentInspectionId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!parentInspectionId,
  });

  const { data: crmJob } = useQuery({
    queryKey: ['crm-job-autofill', crmJobId],
    queryFn: async () => {
      const { data: job, error } = await supabase
        .from('jobs')
        .select('id, title, description, address, job_number, client_id, inspection_id')
        .eq('id', crmJobId!)
        .maybeSingle();
      if (error) throw error;
      if (!job) return null;

      let client: { id: string; name: string; address: string | null } | null = null;
      if (job.client_id) {
        const { data: c } = await supabase
          .from('clients')
          .select('id, name, address')
          .eq('id', job.client_id)
          .maybeSingle();
        client = c;
      }
      return { job, client };
    },
    enabled: !!crmJobId,
  });

  useEffect(() => {
    if (parentInspection?.meta) {
      setMeta(parentInspection.meta as Record<string, string>);
      if (parentInspection.client_id) setClientId(parentInspection.client_id);
      if (parentInspection.crm_job_id) setLinkedCrmJobId(parentInspection.crm_job_id);
    }
  }, [parentInspection]);

  useEffect(() => {
    if (!crmJob) return;
    const { job, client } = crmJob;
    setLinkedCrmJobId(job.id);
    if (job.client_id) setClientId(job.client_id);
    setMeta(m => ({
      ...m,
      siteName: m.siteName || job.title || '',
      siteAddress: m.siteAddress || job.address || client?.address || '',
      clientName: m.clientName || client?.name || '',
      jobDescription: m.jobDescription || job.description || job.title || '',
      jobNumber:
        m.jobNumber ||
        (job.job_number != null ? String(job.job_number).padStart(4, '0') : ''),
    }));
  }, [crmJob]);

  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);
  const rawSchema = selectedTemplate ? (selectedTemplate.schema as unknown as TemplateSchema) : null;
  const schemaMeta = rawSchema?.meta ?? {
    requiresSiteName: true,
    requiresSiteAddress: true,
    requiresClientName: true,
    requiresJobNumber: false,
    customFields: [],
  };
  const hasNoSections = rawSchema != null && (!rawSchema.sections || rawSchema.sections.length === 0);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!profile || !selectedTemplate) throw new Error('Missing data');

      const { data, error } = await supabase
        .from('inspections')
        .insert({
          template_id: selectedTemplate.id,
          template_snapshot: {
            id: selectedTemplate.id,
            name: selectedTemplate.name,
            report_renderer: selectedTemplate.report_renderer,
            schema: selectedTemplate.schema,
          } as unknown as Record<string, unknown>,
          inspector_id: profile.id,
          status: 'draft',
          responses: {},
          meta: meta as Record<string, unknown>,
          parent_inspection_id: parentInspectionId ?? null,
          client_id: clientId,
          crm_job_id: linkedCrmJobId,
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Failed to create inspection');

      if (linkedCrmJobId) {
        const { data: jobRow } = await supabase
          .from('jobs')
          .select('id, inspection_id')
          .eq('id', linkedCrmJobId)
          .maybeSingle();
        if (jobRow && !jobRow.inspection_id) {
          await supabase.from('jobs').update({ inspection_id: data.id }).eq('id', linkedCrmJobId);
        }
      }

      return data;
    },
    onSuccess: data => navigate(`/inspections/${data.id}`),
  });

  const parentSiteName = (parentInspection?.meta as Record<string, string> | null)?.siteName;
  const parentTemplateName = (parentInspection?.template_snapshot as { name?: string } | null)?.name;

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      </AppShell>
    );
  }

  if (isError) return <PageError onRetry={refetch} />;

  const backTo = parentInspectionId
    ? `/inspections/${parentInspectionId}/report`
    : crmJobId
      ? `/jobs/${crmJobId}`
      : '/inspections';

  return (
    <AppShell>
      <div className="page-shell-narrow">
        <button
          onClick={() => navigate(backTo)}
          className="flex items-center gap-1 text-sm text-[#4A5568] hover:text-[#1A1A1A] mb-4"
        >
          <ChevronLeft size={16} /> {parentInspectionId ? 'Back to job' : crmJobId ? 'Jobs' : 'Inspections'}
        </button>

        <h1 className="text-xl font-semibold text-[#1A1A1A] mb-1">
          {parentInspectionId ? 'Add Inspection to Job' : crmJobId ? 'Start Inspection from CRM Job' : 'Start New Inspection'}
        </h1>
        <p className="text-sm text-[#4A5568] mb-6">
          {parentInspectionId
            ? 'Choose a template to add to this job. Job details are pre-filled.'
            : crmJobId
              ? 'Identity fields were filled from the CRM job and client.'
              : 'Choose a template and provide job details to begin.'}
        </p>

        {parentInspectionId && parentInspection && (
          <div className="flex items-center gap-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg px-4 py-3 mb-4">
            <Link2 size={15} className="text-[#2E75B6] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#1e40af]">Linking to: {parentSiteName ?? 'Existing job'}</p>
              {parentTemplateName && (
                <p className="text-xs text-[#3b82f6]">Existing: {parentTemplateName}</p>
              )}
            </div>
          </div>
        )}

        {crmJob && (
          <div className="flex items-center gap-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg px-4 py-3 mb-4">
            <Briefcase size={15} className="text-[#15803d] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#166534]">CRM job: {crmJob.job.title}</p>
              <p className="text-xs text-[#16a34a]">
                {[crmJob.client?.name, crmJob.job.address].filter(Boolean).join(' · ') || 'Details pre-filled'}
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="px-4 py-4 border-b border-[#E5E7EB]">
            <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Inspection Template</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {templates?.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={`flex items-start gap-3 p-3 rounded-md border text-left transition-colors ${
                    selectedTemplateId === t.id
                      ? 'border-[#2E75B6] bg-[#F0F7FF]'
                      : 'border-[#E5E7EB] hover:border-[#2E75B6]/40'
                  }`}
                >
                  <div className="w-8 h-8 rounded bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center shrink-0 mt-0.5">
                    {t.report_renderer === 'electrical_3000' ? (
                      <Zap size={15} className="text-[#0A2540]" />
                    ) : (
                      <LayoutTemplate size={15} className="text-[#0A2540]" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">{t.name}</p>
                    <p className="text-xs text-[#4A5568]">
                      {t.report_renderer === 'electrical_3000' ? 'AS/NZS 3000:2018' : 'Generic Inspection'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {templates?.length === 0 && (
              <p className="text-sm text-[#4A5568]">
                No templates available.{' '}
                <button onClick={() => navigate('/templates/new')} className="text-[#2E75B6] hover:underline">
                  Create one first.
                </button>
              </p>
            )}
          </div>

          {selectedTemplate && (
            <div className="px-4 py-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#1A1A1A]">Job Details</h3>
                {(parentInspectionId || crmJobId) && (
                  <span className="text-xs text-[#2E75B6] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                    Pre-filled
                  </span>
                )}
              </div>
              {schemaMeta.requiresSiteName && (
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Site Name</label>
                  <input
                    value={meta.siteName ?? ''}
                    onChange={e => setMeta(m => ({ ...m, siteName: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                    placeholder="e.g. Westfield Shopping Centre"
                  />
                </div>
              )}
              {schemaMeta.requiresSiteAddress && (
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Site Address</label>
                  <input
                    value={meta.siteAddress ?? ''}
                    onChange={e => setMeta(m => ({ ...m, siteAddress: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                    placeholder="Street, Suburb, State"
                  />
                </div>
              )}
              {schemaMeta.requiresClientName && (
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Client Name</label>
                  <input
                    value={meta.clientName ?? ''}
                    onChange={e => setMeta(m => ({ ...m, clientName: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                    placeholder="Client or organisation name"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">
                  Job Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={meta.jobDescription ?? ''}
                  onChange={e => setMeta(m => ({ ...m, jobDescription: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Describe the scope of work to be performed"
                />
              </div>
              {schemaMeta.requiresJobNumber && (
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Job Number</label>
                  <input
                    value={meta.jobNumber ?? ''}
                    onChange={e => setMeta(m => ({ ...m, jobNumber: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                    placeholder="e.g. JOB-2024-001"
                  />
                </div>
              )}
              {schemaMeta.customFields?.map(field => (
                <div key={field.id}>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  {field.type === 'long_text' ? (
                    <textarea
                      value={meta[`custom_${field.id}`] ?? ''}
                      onChange={e => setMeta(m => ({ ...m, [`custom_${field.id}`]: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent resize-none"
                      rows={3}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                  ) : (
                    <input
                      type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                      value={meta[`custom_${field.id}`] ?? ''}
                      onChange={e => setMeta(m => ({ ...m, [`custom_${field.id}`]: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-3 border-t border-[#E5E7EB] space-y-2">
            {hasNoSections && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                This template has no sections yet.{' '}
                <button onClick={() => navigate(`/templates/${selectedTemplate!.id}`)} className="underline font-medium">
                  Edit the template
                </button>{' '}
                to add questions before starting an inspection.
              </p>
            )}
            <button
              onClick={() => createMutation.mutate()}
              disabled={
                !selectedTemplate ||
                hasNoSections ||
                createMutation.isPending ||
                !meta.jobDescription ||
                (schemaMeta?.customFields ?? []).some(f => f.required && !meta[`custom_${f.id}`])
              }
              className="flex items-center gap-2 bg-[#0A2540] text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Play size={15} />
              {createMutation.isPending
                ? 'Starting...'
                : parentInspectionId
                  ? 'Start & Link to Job'
                  : crmJobId
                    ? 'Start from CRM Job'
                    : 'Start Inspection'}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
