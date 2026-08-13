import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import SignatureCanvas from 'react-signature-canvas';
import { PageError } from '../components/ui/PageError';
import { supabase } from '../lib/supabase';
import { evaluateShowIf } from '../lib/conditionEval';
import type { TemplateSchema, SignOffRole, InspectionCountersign } from '../types/template';
import { parseCountersignatures } from '../types/template';
import { CheckCircle, AlertCircle, ChevronLeft, ClipboardCheck, ImageOff, Check, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';

function CountersignSlot({
  role,
  name,
  signature,
  onChange,
}: {
  role: SignOffRole;
  name: string;
  signature: string;
  onChange: (patch: { name?: string; signature?: string }) => void;
}) {
  const sigRef = useRef<SignatureCanvas>(null);

  function handleDone() {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    onChange({ signature: sigRef.current.toDataURL('image/png') });
  }

  function handleClear() {
    sigRef.current?.clear();
    onChange({ signature: '' });
  }

  return (
    <div className="p-4 border-b border-[#E5E7EB] last:border-b-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#1A1A1A]">
          {role.label}
          {role.required && <span className="text-red-500 ml-0.5">*</span>}
        </p>
      </div>
      <div>
        <label className="block text-xs text-[#4A5568] mb-1">Full name</label>
        <input
          type="text"
          value={name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder={`Name of ${role.label.toLowerCase()}`}
          className="w-full px-3 py-2 border border-[#E5E7EB] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
        />
      </div>
      <div>
        <label className="block text-xs text-[#4A5568] mb-1">Signature</label>
        {signature ? (
          <div className="border border-[#E5E7EB] rounded-md overflow-hidden">
            <img src={signature} alt={`${role.label} signature`} className="w-full h-28 object-contain bg-white p-2" />
            <div className="flex items-center justify-between px-3 py-2 border-t border-[#E5E7EB] bg-[#F9FAFB]">
              <span className="text-xs text-[#1B7F3A] flex items-center gap-1">
                <Check size={12} /> Signature captured
              </span>
              <button type="button" onClick={handleClear} className="text-xs text-[#4A5568] hover:text-[#B42318]">
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-[#E5E7EB] rounded-md overflow-hidden">
            <div className="bg-white relative">
              <SignatureCanvas
                ref={sigRef}
                penColor="#0A2540"
                canvasProps={{ className: 'w-full h-36 touch-none', style: { touchAction: 'none', display: 'block' } }}
              />
              <p className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-[#C0C9D4] pointer-events-none select-none">
                Sign above
              </p>
            </div>
            <div className="flex items-center justify-between px-3 py-2 border-t border-[#E5E7EB] bg-[#F9FAFB]">
              <button type="button" onClick={() => sigRef.current?.clear()} className="flex items-center gap-1.5 text-xs text-[#4A5568] hover:text-[#1A1A1A]">
                <RotateCcw size={12} /> Clear
              </button>
              <button
                type="button"
                onClick={handleDone}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#0A2540] px-3 py-1.5 rounded hover:bg-[#0d2f4e]"
              >
                <Check size={12} /> Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function InspectionReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [countersignDraft, setCountersignDraft] = useState<Record<string, { name: string; signature: string }>>({});

  const { data: inspection, isLoading, isError, refetch } = useQuery({
    queryKey: ['inspection', id],
    queryFn: async () => {
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
  });

  const { data: photoRecords } = useQuery({
    queryKey: ['inspection-photos', id],
    queryFn: async () => {
      const { data } = await supabase.from('photos').select('*').eq('inspection_id', id!);
      if (!data?.length) return [];
      const withUrls = await Promise.all(
        data.map(async p => {
          const { data: signed } = await supabase.storage
            .from('photos')
            .createSignedUrl(p.storage_path, 60 * 60 * 24);
          return { ...p, url: signed?.signedUrl ?? '' };
        })
      );
      return withUrls;
    },
    enabled: !!id,
  });

  const schema = (inspection?.template_snapshot as unknown as { schema?: TemplateSchema } | null)?.schema;
  const signOffRoles = schema?.meta?.signOffRoles ?? [];

  useEffect(() => {
    if (!inspection || signOffRoles.length === 0) return;
    const existing = parseCountersignatures((inspection.meta as Record<string, string> | null)?.countersignatures);
    const next: Record<string, { name: string; signature: string }> = {};
    signOffRoles.forEach(role => {
      const found = existing.find(c => c.roleId === role.id);
      next[role.id] = { name: found?.name ?? '', signature: found?.signature ?? '' };
    });
    setCountersignDraft(next);
  }, [inspection?.id, signOffRoles.map(r => r.id).join(',')]);

  const completeMutation = useMutation({
    mutationFn: async (countersignatures: InspectionCountersign[]) => {
      const existingMeta = (inspection?.meta as Record<string, unknown>) ?? {};
      const { error } = await supabase
        .from('inspections')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          meta: {
            ...existingMeta,
            countersignatures: JSON.stringify(countersignatures),
          },
        })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => navigate(`/inspections/${id}/report`),
  });

  if (isLoading || !inspection) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 animate-spin rounded-full border-2 border-[#0A2540] border-t-transparent" />
      </div>
    );
  }

  if (isError) return <PageError onRetry={refetch} />;

  if (!schema) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-[#4A5568]">Inspection data is invalid or missing.</p>
      </div>
    );
  }
  const responses = inspection.responses as Record<string, unknown>;
  const meta = inspection.meta as Record<string, string>;

  // Find required unanswered questions
  const missingRequired: { sectionTitle: string; label: string }[] = [];

  function isAnswered(v: unknown): boolean {
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }

  // Reconstruct instance IDs for repeating sections from response keys
  const sectionInstanceMap: Record<string, string[]> = {};
  Object.keys(responses).forEach(key => {
    const parts = key.split('__');
    if (parts.length >= 2) {
      const [qId, instanceId] = parts;
      schema.sections.forEach(sec => {
        if (sec.isRepeating && sec.questions.some(q => q.id === qId)) {
          if (!sectionInstanceMap[sec.id]) sectionInstanceMap[sec.id] = [];
          if (!sectionInstanceMap[sec.id].includes(instanceId)) {
            sectionInstanceMap[sec.id].push(instanceId);
          }
        }
      });
    }
  });

  schema.sections.forEach(sec => {
    if (!evaluateShowIf(sec.showIf, responses)) return;

    if (sec.isRepeating) {
      const instances = sectionInstanceMap[sec.id] ?? [];

      instances.forEach((instanceId, idx) => {
        sec.questions.forEach(q => {
          if (q.type === 'heading') return;
          if (!q.required) return;
          if (!evaluateShowIf(q.showIf, responses)) return;
          const v = responses[`${q.id}__${instanceId}`];
          if (!isAnswered(v)) {
            missingRequired.push({ sectionTitle: `${sec.title} (${sec.repeatLabel ?? 'Item'} ${idx + 1})`, label: q.label });
          }
        });
      });
    } else {
      sec.questions.forEach(q => {
        if (q.type === 'heading') return;
        if (!q.required) return;
        if (!evaluateShowIf(q.showIf, responses)) return;
        const v = responses[q.id];
        if (!isAnswered(v)) {
          missingRequired.push({ sectionTitle: sec.title, label: q.label });
        }
      });
    }
  });

  const missingCountersign = signOffRoles.filter(role => {
    if (!role.required) return false;
    const draft = countersignDraft[role.id];
    return !draft?.name?.trim() || !draft?.signature;
  });

  const canComplete = missingRequired.length === 0 && missingCountersign.length === 0;

  function buildCountersignatures(): InspectionCountersign[] {
    const today = format(new Date(), 'yyyy-MM-dd');
    return signOffRoles
      .map(role => {
        const draft = countersignDraft[role.id];
        if (!draft?.name?.trim() && !draft?.signature) return null;
        return {
          roleId: role.id,
          roleLabel: role.label,
          name: draft?.name?.trim() ?? '',
          signature: draft?.signature ?? '',
          date: today,
        } satisfies InspectionCountersign;
      })
      .filter((c): c is InspectionCountersign => c != null && (!!c.name || !!c.signature));
  }

  function handleComplete() {
    if (!canComplete) return;
    completeMutation.mutate(buildCountersignatures());
  }

  function getDisplayValue(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object' && val !== null) {
      if ('url' in (val as Record<string, unknown>)) return '[Signature]';
      return JSON.stringify(val);
    }
    return String(val);
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="bg-[#0A2540] text-white sticky top-0 z-40 h-14 flex items-center px-4 gap-3">
        <button onClick={() => navigate(`/inspections/${id}`)} className="p-1.5 rounded hover:bg-white/10">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-sm font-medium">Review Inspection</p>
          <p className="text-[11px] text-white/60">{meta?.siteName ?? 'Inspection'}</p>
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-4 py-6 pb-32">
        {/* Missing required */}
        {!canComplete && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={16} className="text-red-600" />
              <p className="text-sm font-semibold text-red-700">
                {[
                  missingRequired.length > 0
                    ? `${missingRequired.length} required field${missingRequired.length > 1 ? 's' : ''} unanswered`
                    : null,
                  missingCountersign.length > 0
                    ? `${missingCountersign.length} required countersignature${missingCountersign.length > 1 ? 's' : ''} incomplete`
                    : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            {missingRequired.length > 0 && (
              <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
                {missingRequired.map((m, i) => (
                  <li key={i}>{m.sectionTitle} — {m.label}</li>
                ))}
              </ul>
            )}
            {missingCountersign.length > 0 && (
              <ul className="text-sm text-red-600 space-y-1 list-disc list-inside mt-1">
                {missingCountersign.map(r => (
                  <li key={r.id}>{r.label} — name and signature required</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {canComplete && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 flex items-center gap-3">
            <CheckCircle size={16} className="text-green-600" />
            <p className="text-sm text-green-700 font-medium">All required fields completed. Ready to finalise.</p>
          </div>
        )}

        {/* Answers review */}
        {schema.sections.map(sec => {
          if (!evaluateShowIf(sec.showIf, responses)) return null;
          return (
            <div key={sec.id} className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm mb-4">
              <div className="px-4 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB] rounded-t-lg">
                <h3 className="font-semibold text-sm text-[#1A1A1A]">{sec.title}</h3>
              </div>

              {sec.isRepeating ? (
                <div className="divide-y divide-[#E5E7EB]">
                  {(sectionInstanceMap[sec.id] ?? []).map((instanceId, idx) => (
                    <div key={instanceId}>
                      <div className="px-4 py-2 bg-[#F0F4F8]">
                        <p className="text-xs font-semibold text-[#0A2540]">{sec.repeatLabel ?? 'Item'} {idx + 1}</p>
                      </div>
                      {sec.questions.map(q => {
                        if (q.type === 'heading') return (
                          <div key={q.id} className="px-4 py-2 bg-[#F9FAFB]">
                            <p className="text-[11px] font-semibold text-[#0A2540] uppercase tracking-wide">{q.label}</p>
                          </div>
                        );
                        if (!evaluateShowIf(q.showIf, responses)) return null;
                        const val = responses[`${q.id}__${instanceId}`];
                        const isEmpty = val === undefined || val === null || val === '';
                        const isRequired = q.required;
                        return (
                          <div key={q.id} className={`px-4 py-3 ${isEmpty && isRequired ? 'bg-red-50' : ''}`}>
                            <p className="text-xs font-medium text-[#4A5568] mb-0.5">
                              {q.label}{isRequired && <span className="text-red-500 ml-0.5">*</span>}
                            </p>
                            {q.type === 'photo' ? (
                              <div className="flex flex-wrap gap-2 mt-1">
                                {(() => {
                                  const qPhotos = (photoRecords ?? []).filter(p => p.question_id === q.id && p.instance_id === instanceId);
                                  if (qPhotos.length === 0) return <span className="text-sm text-[#4A5568] italic">No photos</span>;
                                  return qPhotos.map(p => (
                                    <div key={p.id ?? p.storage_path} className="relative w-20 h-20 rounded-md overflow-hidden border border-[#E5E7EB] bg-[#F9FAFB]">
                                      {p.url ? <img src={p.url} alt={p.caption ?? 'Photo'} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageOff size={18} className="text-[#CBD5E0]" /></div>}
                                    </div>
                                  ));
                                })()}
                              </div>
                            ) : q.type === 'signature' ? (
                              <span className="text-sm text-[#4A5568]">{val ? '[Signature captured]' : isEmpty && isRequired ? <span className="text-red-500">Not signed</span> : 'Not signed'}</span>
                            ) : (
                              <p className={`text-sm ${isEmpty && isRequired ? 'text-red-500 italic' : 'text-[#1A1A1A]'}`}>
                                {isEmpty ? (isRequired ? 'Required — not answered' : '—') : getDisplayValue(val)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {(sectionInstanceMap[sec.id] ?? []).length === 0 && (
                    <div className="px-4 py-3">
                      <p className="text-sm text-[#4A5568] italic">No items added</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-[#E5E7EB]">
                  {sec.questions.map(q => {
                    if (q.type === 'heading') {
                      return (
                        <div key={q.id} className="px-4 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB]">
                          <p className="text-[11px] font-semibold text-[#0A2540] uppercase tracking-wide">{q.label}</p>
                        </div>
                      );
                    }
                    if (!evaluateShowIf(q.showIf, responses)) return null;
                    const val = responses[q.id];
                    const isEmpty = val === undefined || val === null || val === '';
                    const isRequired = q.required;
                    return (
                      <div key={q.id} className={`px-4 py-3 ${isEmpty && isRequired ? 'bg-red-50' : ''}`}>
                        <p className="text-xs font-medium text-[#4A5568] mb-0.5">
                          {q.label}{isRequired && <span className="text-red-500 ml-0.5">*</span>}
                        </p>
                        {q.type === 'photo' ? (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {(() => {
                              const qPhotos = (photoRecords ?? []).filter(p => p.question_id === q.id && !p.instance_id);
                              if (qPhotos.length === 0) {
                                return <span className="text-sm text-[#4A5568] italic">No photos</span>;
                              }
                              return qPhotos.map(p => (
                                <div key={p.id ?? p.storage_path} className="relative w-20 h-20 rounded-md overflow-hidden border border-[#E5E7EB] bg-[#F9FAFB]">
                                  {p.url ? (
                                    <img src={p.url} alt={p.caption ?? 'Photo'} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <ImageOff size={18} className="text-[#CBD5E0]" />
                                    </div>
                                  )}
                                </div>
                              ));
                            })()}
                          </div>
                        ) : q.type === 'signature' ? (
                          <span className="text-sm text-[#4A5568]">{val ? '[Signature captured]' : isEmpty && isRequired ? <span className="text-red-500">Not signed</span> : 'Not signed'}</span>
                        ) : (
                          <p className={`text-sm ${isEmpty && isRequired ? 'text-red-500 italic' : 'text-[#1A1A1A]'}`}>
                            {isEmpty ? (isRequired ? 'Required — not answered' : '—') : getDisplayValue(val)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Countersignatures */}
        {signOffRoles.length > 0 && (
          <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm mb-4">
            <div className="px-4 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB] rounded-t-lg">
              <h3 className="font-semibold text-sm text-[#1A1A1A]">Countersignatures</h3>
              <p className="text-xs text-[#6B7280] mt-0.5">Capture required close-out signatures before completing.</p>
            </div>
            {signOffRoles.map(role => (
              <CountersignSlot
                key={role.id}
                role={role}
                name={countersignDraft[role.id]?.name ?? ''}
                signature={countersignDraft[role.id]?.signature ?? ''}
                onChange={patch =>
                  setCountersignDraft(prev => ({
                    ...prev,
                    [role.id]: {
                      name: patch.name ?? prev[role.id]?.name ?? '',
                      signature: patch.signature ?? prev[role.id]?.signature ?? '',
                    },
                  }))
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E5E7EB] px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate(`/inspections/${id}`)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-md border border-[#E5E7EB] text-sm font-medium text-[#4A5568] hover:bg-[#F9FAFB]"
        >
          <ChevronLeft size={16} /> Back to Inspection
        </button>
        <button
          onClick={handleComplete}
          disabled={!canComplete || completeMutation.isPending}
          className="flex items-center gap-2 bg-[#1B7F3A] text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-[#166a30] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ClipboardCheck size={16} />
          {completeMutation.isPending ? 'Completing...' : 'Complete Inspection'}
        </button>
      </div>
    </div>
  );
}
