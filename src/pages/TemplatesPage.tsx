import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner as _LoadingSpinner, PageError } from '../components/ui';
import { SkeletonList } from '../components/ui/Skeletons';
import { Plus, LayoutTemplate, Zap, ChevronRight, Archive, ArchiveRestore, Copy, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';

type Tab = 'inspections' | 'jha';

export function TemplatesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('inspections');
  const [showArchived, setShowArchived] = useState(false);

  const canEdit = profile?.role === 'admin' || profile?.template_access === 'edit';
  const canView = profile?.role === 'admin' || profile?.template_access === 'edit' || profile?.template_access === 'view';

  if (!canView) {
    return (
      <AppShell>
        <div className="max-w-[1200px] mx-auto px-4 py-16 text-center">
          <LayoutTemplate size={40} className="mx-auto text-[#E5E7EB] mb-3" />
          <p className="text-[#1A1A1A] font-medium">No template access</p>
          <p className="text-sm text-[#4A5568] mt-1">Your account doesn't have permission to view templates. Contact your admin.</p>
        </div>
      </AppShell>
    );
  }

  // Inspection templates query
  const { data: templates, isLoading: inspLoading, isError: inspError, refetch: inspRefetch } = useQuery({
    queryKey: ['templates', showArchived],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('archived', showArchived)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!profile && activeTab === 'inspections',
  });

  // JHA templates query
  const { data: jhaTemplates, isLoading: jhaLoading, isError: jhaError, refetch: jhaRefetch } = useQuery({
    queryKey: ['jha-templates', showArchived],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jha_templates')
        .select('*')
        .eq('archived', showArchived)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!profile && activeTab === 'jha',
  });

  const unarchiveInspectionMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase.from('templates').update({ archived: false }).eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  const duplicateInspectionMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const template = templates?.find(t => t.id === templateId);
      if (!template) throw new Error('Template not found');
      const { data, error } = await supabase
        .from('templates')
        .insert({
          company_id: template.company_id,
          created_by: profile?.id,
          name: `${template.name} (Copy)`,
          description: template.description,
          report_renderer: template.report_renderer,
          schema: template.schema,
          archived: false,
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  const unarchiveJhaMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase.from('jha_templates').update({ archived: false }).eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jha-templates'] }),
  });

  const duplicateJhaMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const template = jhaTemplates?.find(t => t.id === templateId);
      if (!template) throw new Error('Template not found');
      const { data, error } = await supabase
        .from('jha_templates')
        .insert({
          company_id: template.company_id,
          created_by: profile?.id,
          name: `${template.name} (Copy)`,
          description: template.description,
          schema: template.schema,
          archived: false,
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jha-templates'] });
      if (data?.id) navigate(`/jha-templates/${data.id}`);
    },
  });

  const isLoading = activeTab === 'inspections' ? inspLoading : jhaLoading;
  const isError = activeTab === 'inspections' ? inspError : jhaError;
  const refetch = activeTab === 'inspections' ? inspRefetch : jhaRefetch;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">
              {showArchived ? 'Archived Templates' : 'Templates'}
            </h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
              {showArchived
                ? 'Archived templates cannot be used for new documents'
                : 'Build and manage your inspection and JHA templates'}
            </p>
          </div>
          {!showArchived && canEdit && (
            <button
              onClick={() => navigate(activeTab === 'inspections' ? '/templates/new' : '/jha-templates/new')}
              className="flex items-center gap-2 bg-[#0A2540] text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-all duration-200 active:scale-[0.98]"
            >
              <Plus size={16} />
              {activeTab === 'inspections' ? 'New Inspection Template' : 'New JHA Template'}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[#E5E7EB] mb-4">
          <button
            onClick={() => { setActiveTab('inspections'); setShowArchived(false); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'inspections'
                ? 'border-[#2E75B6] text-[#2E75B6]'
                : 'border-transparent text-[#6B7280] hover:text-[#374151]'
            }`}
          >
            <span className="flex items-center gap-2"><LayoutTemplate size={16} /> Inspection Templates</span>
          </button>
          <button
            onClick={() => { setActiveTab('jha'); setShowArchived(false); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'jha'
                ? 'border-[#2E75B6] text-[#2E75B6]'
                : 'border-transparent text-[#6B7280] hover:text-[#374151]'
            }`}
          >
            <span className="flex items-center gap-2"><ShieldCheck size={16} /> JHA Templates</span>
          </button>
        </div>

        {isLoading ? (
          <SkeletonList count={5} />
        ) : pageQueryBlocked(isError) ? (
          <PageError onRetry={refetch} />
        ) : activeTab === 'inspections' ? (
          templates?.length === 0 ? (
            <EmptyState
              icon={LayoutTemplate}
              message="No inspection templates yet"
              subMessage={canEdit ? 'Create your first inspection template to get started.' : 'No inspection templates have been created yet.'}
              showButton={canEdit}
              buttonLabel="Build Inspection Template"
              onClick={() => navigate('/templates/new')}
            />
          ) : (
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm divide-y divide-[#E5E7EB]">
              {templates?.map(tmpl => (
                <div key={tmpl.id} className="flex items-center px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded bg-[#0A2540]/10 flex items-center justify-center shrink-0">
                      {tmpl.report_renderer === 'electrical_3000' ? (
                        <Zap size={15} className="text-[#0A2540]" />
                      ) : (
                        <LayoutTemplate size={15} className="text-[#0A2540]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1A1A1A] truncate">{tmpl.name}</p>
                      <p className="text-xs text-[#4A5568]">
                        {tmpl.report_renderer === 'electrical_3000' ? 'AS/NZS 3000:2018' : 'Generic Inspection'} ·{' '}
                        Updated {format(new Date(tmpl.updated_at), 'd MMM yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {showArchived ? (
                      canEdit && (
                        <button
                          onClick={() => unarchiveInspectionMutation.mutate(tmpl.id)}
                          disabled={unarchiveInspectionMutation.isPending}
                          className="flex items-center gap-1.5 text-xs border border-[#0A2540] text-[#0A2540] px-3 py-1.5 rounded hover:bg-[#0A2540]/5 transition-colors font-medium disabled:opacity-50"
                        >
                          <ArchiveRestore size={12} /> Unarchive
                        </button>
                      )
                    ) : (
                      <>
                        <button
                          onClick={() => navigate(`/inspections/new?templateId=${tmpl.id}`)}
                          className="text-xs border border-[#0A2540] text-[#0A2540] px-3 py-1.5 rounded hover:bg-[#0A2540]/5 transition-colors font-medium"
                        >
                          Inspect
                        </button>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => duplicateInspectionMutation.mutate(tmpl.id)}
                              disabled={duplicateInspectionMutation.isPending}
                              className="flex items-center gap-1 text-xs text-[#4A5568] hover:text-[#1A1A1A] px-2 py-1.5 disabled:opacity-50"
                              title="Duplicate template"
                            >
                              <Copy size={12} />
                            </button>
                            <Link
                              to={`/templates/${tmpl.id}`}
                              className="flex items-center gap-1 text-xs text-[#4A5568] hover:text-[#1A1A1A] px-2 py-1.5"
                            >
                              Edit <ChevronRight size={12} />
                            </Link>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          jhaTemplates?.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              message="No JHA templates yet"
              subMessage={canEdit ? 'Create your first Job Hazard Analysis template to get started.' : 'No JHA templates have been created yet.'}
              showButton={canEdit}
              buttonLabel="Build JHA Template"
              onClick={() => navigate('/jha-templates/new')}
            />
          ) : (
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm divide-y divide-[#E5E7EB]">
              {jhaTemplates?.map(tmpl => {
                const schema = tmpl.schema as { riskLevels?: unknown[]; ppeOptions?: unknown[]; signOffRoles?: unknown[] };
                return (
                  <div key={tmpl.id} className="flex items-center px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded bg-[#0A2540]/10 flex items-center justify-center shrink-0">
                        <ShieldCheck size={15} className="text-[#0A2540]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1A1A1A] truncate">{tmpl.name}</p>
                        <p className="text-xs text-[#4A5568]">
                          {schema.riskLevels?.length ?? 0} risk levels · {schema.ppeOptions?.length ?? 0} PPE items · {schema.signOffRoles?.length ?? 0} sign-off roles ·{' '}
                          Updated {format(new Date(tmpl.updated_at), 'd MMM yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {showArchived ? (
                        canEdit && (
                          <button
                            onClick={() => unarchiveJhaMutation.mutate(tmpl.id)}
                            disabled={unarchiveJhaMutation.isPending}
                            className="flex items-center gap-1.5 text-xs border border-[#0A2540] text-[#0A2540] px-3 py-1.5 rounded hover:bg-[#0A2540]/5 transition-colors font-medium disabled:opacity-50"
                          >
                            <ArchiveRestore size={12} /> Unarchive
                          </button>
                        )
                      ) : (
                        <>
                          <button
                            onClick={() => navigate(`/jha/new?templateId=${tmpl.id}`)}
                            className="text-xs border border-[#0A2540] text-[#0A2540] px-3 py-1.5 rounded hover:bg-[#0A2540]/5 transition-colors font-medium"
                          >
                            Create JHA
                          </button>
                          {canEdit && (
                            <>
                              <button
                                onClick={() => duplicateJhaMutation.mutate(tmpl.id)}
                                disabled={duplicateJhaMutation.isPending}
                                className="flex items-center gap-1 text-xs text-[#4A5568] hover:text-[#1A1A1A] px-2 py-1.5 disabled:opacity-50"
                                title="Duplicate template"
                              >
                                <Copy size={12} />
                              </button>
                              <Link
                                to={`/jha-templates/${tmpl.id}`}
                                className="flex items-center gap-1 text-xs text-[#4A5568] hover:text-[#1A1A1A] px-2 py-1.5"
                              >
                                Edit <ChevronRight size={12} />
                              </Link>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        <button
          onClick={() => setShowArchived(v => !v)}
          className="mt-4 flex items-center gap-1.5 text-xs text-[#4A5568] hover:text-[#1A1A1A] transition-colors"
        >
          {showArchived
            ? <><ArchiveRestore size={13} /> View active templates</>
            : <><Archive size={13} /> View archived templates</>
          }
        </button>
      </div>
    </AppShell>
  );
}

function EmptyState({ icon: Icon, message, subMessage, showButton, buttonLabel, onClick }: {
  icon: React.ElementType;
  message: string;
  subMessage: string;
  showButton: boolean;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] py-16 text-center">
      <Icon size={40} className="mx-auto text-[#E5E7EB] mb-3" />
      <p className="text-[#1A1A1A] font-medium">{message}</p>
      <p className="text-sm text-[#4A5568] mt-1">{subMessage}</p>
      {showButton && (
        <button
          onClick={onClick}
          className="mt-4 inline-flex items-center gap-2 bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e]"
        >
          <Plus size={14} /> {buttonLabel}
        </button>
      )}
    </div>
  );
}
