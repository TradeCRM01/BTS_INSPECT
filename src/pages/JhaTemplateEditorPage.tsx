import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { nanoid } from '../lib/nanoid';
import type { JhaTemplateSchema, RiskLevel, PpeOption, SignOffRole, JhaCustomField, JhaStep } from '../types/jha';
import { formatControlMeasuresText, normalizeJhaStep } from '../types/jha';
import { JHA_STEP_PACKS, clonePackSteps } from '../lib/jhaStepPacks';
import { JhaSwmsLibraryPicker } from '../components/jha/JhaSwmsLibraryPicker';
import {
  ChevronLeft, Save, Trash2, Plus, ShieldCheck, AlertCircle,
  HardHat, X, Check, GripVertical, Library,
} from 'lucide-react';

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

const DEFAULT_SCHEMA: JhaTemplateSchema = {
  meta: {
    requiresTaskName: true,
    requiresSiteName: true,
    requiresDate: true,
    requiresSupervisor: true,
    requiresClient: true,
    requiresPlantArea: true,
    requiresShift: true,
    requiresPermitRefs: true,
    requiresMusterPoint: true,
    customFields: [],
    maxAcceptableResidualScore: 9,
  },
  riskLevels: [
    { id: 'low', label: 'Low', color: '#166534', score: 1 },
    { id: 'moderate', label: 'Moderate', color: '#B45309', score: 2 },
    { id: 'significant', label: 'Significant', color: '#C2410C', score: 3 },
    { id: 'severe', label: 'Severe', color: '#B91C1C', score: 4 },
  ],
  ppeOptions: [
    { id: nanoid(), label: 'Hard Hat', standardRef: 'AS/NZS 1801' },
    { id: nanoid(), label: 'Safety Glasses', standardRef: 'AS/NZS 1337' },
    { id: nanoid(), label: 'Steel Cap Boots', standardRef: 'AS/NZS 2210' },
    { id: nanoid(), label: 'Hi-Vis Vest', standardRef: 'AS/NZS 4602' },
    { id: nanoid(), label: 'Gloves', standardRef: 'AS/NZS 2161' },
    { id: nanoid(), label: 'Hearing Protection', standardRef: 'AS/NZS 1270' },
  ],
  signOffRoles: [
    { id: nanoid(), label: 'Supervisor', required: true },
    { id: nanoid(), label: 'Worker', required: true },
  ],
  stepLibrary: [],
};

const RISK_COLORS = [
  { label: 'Green', color: '#166534' },
  { label: 'Amber', color: '#92400E' },
  { label: 'Red', color: '#B91C1C' },
  { label: 'Blue', color: '#1D4ED8' },
  { label: 'Orange', color: '#C2410C' },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${checked ? 'bg-[#2E75B6]' : 'bg-[#D1D5DB]'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}

function SectionCard({ title, icon: Icon, count, children, action }: {
  title: string;
  icon: React.ElementType;
  count?: number;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-[#4A5568]" />
          <span className="text-sm font-medium text-[#1A1A1A]">{title}</span>
          {count !== undefined && (
            <span className="text-xs text-[#4A5568] bg-[#F3F4F6] px-1.5 py-0.5 rounded">{count}</span>
          )}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function JhaTemplateEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isNew = id === 'new';

  const [templateId, setTemplateId] = useState<string | null>(isNew ? null : id ?? null);
  const [templateName, setTemplateName] = useState('Untitled JHA Template');
  const [description, setDescription] = useState('');
  const [schema, setSchema] = useState<JhaTemplateSchema>(DEFAULT_SCHEMA);
  const [templateVersion, setTemplateVersion] = useState(1);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const schemaDirtyRef = useRef(false);

  const canEdit = profile?.role === 'admin' || profile?.template_access === 'edit';

  const { data: existingTemplate, isLoading, isError, refetch } = useQuery({
    queryKey: ['jha-template', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jha_templates')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !isNew && !!id,
  });

  useEffect(() => {
    if (existingTemplate) {
      setTemplateName(existingTemplate.name);
      setDescription(existingTemplate.description ?? '');
      setSchema(existingTemplate.schema as unknown as JhaTemplateSchema);
      setTemplateId(existingTemplate.id);
      setTemplateVersion(existingTemplate.version ?? 1);
      schemaDirtyRef.current = false;
    }
  }, [existingTemplate]);

  const markUnsaved = useCallback(() => setSaveState('unsaved'), []);

  function markSchemaDirty() {
    schemaDirtyRef.current = true;
    markUnsaved();
  }

  useEffect(() => {
    if (saveState !== 'unsaved' || !templateId) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(), 2000);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, templateId, templateName, description, schema]);

  function updateMeta(updates: Partial<JhaTemplateSchema['meta']>) {
    setSchema(prev => ({ ...prev, meta: { ...prev.meta, ...updates } }));
    markSchemaDirty();
  }

  function addRiskLevel() {
    const newLevel: RiskLevel = { id: nanoid(), label: 'New Level', color: '#1D4ED8', score: schema.riskLevels.length + 1 };
    setSchema(prev => ({ ...prev, riskLevels: [...prev.riskLevels, newLevel] }));
    markSchemaDirty();
  }

  function updateRiskLevel(riskId: string, updates: Partial<RiskLevel>) {
    setSchema(prev => ({ ...prev, riskLevels: prev.riskLevels.map(r => r.id === riskId ? { ...r, ...updates } : r) }));
    markSchemaDirty();
  }

  function deleteRiskLevel(riskId: string) {
    setSchema(prev => ({ ...prev, riskLevels: prev.riskLevels.filter(r => r.id !== riskId) }));
    markSchemaDirty();
  }

  function addPpeOption() {
    const newOpt: PpeOption = { id: nanoid(), label: 'New PPE Item', standardRef: '' };
    setSchema(prev => ({ ...prev, ppeOptions: [...prev.ppeOptions, newOpt] }));
    markSchemaDirty();
  }

  function updatePpeOption(optId: string, updates: Partial<PpeOption>) {
    setSchema(prev => ({ ...prev, ppeOptions: prev.ppeOptions.map(p => p.id === optId ? { ...p, ...updates } : p) }));
    markSchemaDirty();
  }

  function deletePpeOption(optId: string) {
    setSchema(prev => ({ ...prev, ppeOptions: prev.ppeOptions.filter(p => p.id !== optId) }));
    markSchemaDirty();
  }

  function addSignOffRole() {
    const newRole: SignOffRole = { id: nanoid(), label: 'New Role', required: false };
    setSchema(prev => ({ ...prev, signOffRoles: [...prev.signOffRoles, newRole] }));
    markSchemaDirty();
  }

  function updateSignOffRole(roleId: string, updates: Partial<SignOffRole>) {
    setSchema(prev => ({ ...prev, signOffRoles: prev.signOffRoles.map(r => r.id === roleId ? { ...r, ...updates } : r) }));
    markSchemaDirty();
  }

  function deleteSignOffRole(roleId: string) {
    setSchema(prev => ({ ...prev, signOffRoles: prev.signOffRoles.filter(r => r.id !== roleId) }));
    markSchemaDirty();
  }

  function addCustomField() {
    const newField: JhaCustomField = { id: nanoid(), name: nanoid(), label: 'New Field', type: 'text', required: false };
    setSchema(prev => ({ ...prev, meta: { ...prev.meta, customFields: [...(prev.meta.customFields ?? []), newField] } }));
    markSchemaDirty();
  }

  function updateCustomField(fieldId: string, updates: Partial<JhaCustomField>) {
    setSchema(prev => ({
      ...prev,
      meta: {
        ...prev.meta,
        customFields: (prev.meta.customFields ?? []).map(f => f.id === fieldId ? { ...f, ...updates } : f),
      },
    }));
    markSchemaDirty();
  }

  function deleteCustomField(fieldId: string) {
    setSchema(prev => ({
      ...prev,
      meta: { ...prev.meta, customFields: (prev.meta.customFields ?? []).filter(f => f.id !== fieldId) },
    }));
    markSchemaDirty();
  }

  function setStepLibrary(steps: JhaStep[]) {
    setSchema(prev => ({ ...prev, stepLibrary: steps }));
    markSchemaDirty();
  }

  function applyStepPack(packId: string) {
    const pack = JHA_STEP_PACKS.find(p => p.id === packId);
    if (!pack) return;
    if ((schema.stepLibrary?.length ?? 0) > 0 && !confirm('Replace the current step library with this pack?')) return;
    setStepLibrary(clonePackSteps(pack, nanoid).map(s => normalizeJhaStep(s)));
  }

  function addLibraryStep() {
    const empty: JhaStep = normalizeJhaStep({
      id: nanoid(),
      description: 'New work step',
      hazards: '',
      consequence: '',
      likelihood: '',
      controls: '',
      controlMeasures: [],
      initialRisk: '',
      residualRisk: '',
    });
    setStepLibrary([...(schema.stepLibrary ?? []), empty]);
  }

  function updateLibraryStep(stepId: string, description: string) {
    setStepLibrary((schema.stepLibrary ?? []).map(s => {
      if (s.id !== stepId) return s as JhaStep;
      const next = { ...s, description } as JhaStep;
      return { ...next, controls: formatControlMeasuresText(next.controlMeasures ?? []) };
    }));
  }

  function deleteLibraryStep(stepId: string) {
    setStepLibrary((schema.stepLibrary ?? []).filter(s => s.id !== stepId) as JhaStep[]);
  }

  function validate(): string[] {
    const errors: string[] = [];
    if (!templateName.trim()) errors.push('Template name is required');
    if (schema.riskLevels.length < 2) errors.push('At least 2 risk levels are required');
    if (schema.riskLevels.some(r => !r.label.trim())) errors.push('All risk levels must have a label');
    if (schema.signOffRoles.some(r => !r.label.trim())) errors.push('All sign-off roles must have a label');
    return errors;
  }

  async function doSave() {
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length > 0) return;

    setSaveState('saving');
    try {
      const nextVersion = schemaDirtyRef.current && templateId
        ? templateVersion + 1
        : templateVersion;
      const payload = {
        name: templateName,
        description: description || null,
        schema: schema as unknown as Record<string, unknown>,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      };

      if (templateId) {
        const { error } = await supabase.from('jha_templates').update(payload).eq('id', templateId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('jha_templates')
          .insert({
            ...payload,
            company_id: profile!.company_id,
            created_by: profile!.id,
          })
          .select()
          .single();
        if (error) throw error;
        setTemplateId(data.id);
        navigate(`/jha-templates/${data.id}`, { replace: true });
      }
      setTemplateVersion(nextVersion);
      schemaDirtyRef.current = false;
      setSaveState('saved');
    } catch (err) {
      console.error('Save failed:', err);
      setSaveState('error');
    }
  }

  async function handleDelete() {
    if (!templateId) return;
    if (!confirm('Delete this JHA template? This cannot be undone.')) return;
    const { error } = await supabase.from('jha_templates').delete().eq('id', templateId);
    if (error) {
      alert(error.message);
      return;
    }
    navigate('/templates');
  }

  if (!canEdit) {
    return (
      <AppShell>
        <div className="max-w-[1200px] mx-auto px-4 py-16 text-center">
          <ShieldCheck size={40} className="mx-auto text-[#E5E7EB] mb-3" />
          <p className="text-[#1A1A1A] font-medium">No edit access</p>
          <p className="text-sm text-[#4A5568] mt-1">You need edit permissions to manage JHA templates.</p>
        </div>
      </AppShell>
    );
  }

  if (isLoading) {
    return <AppShell><div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div></AppShell>;
  }

  if (isError) {
    return <AppShell><div className="max-w-[1200px] mx-auto px-4 py-6"><PageError onRetry={refetch} /></div></AppShell>;
  }

  const enabledFieldCount =
    (schema.meta.requiresTaskName ? 1 : 0) +
    (schema.meta.requiresSiteName ? 1 : 0) +
    (schema.meta.requiresDate ? 1 : 0) +
    (schema.meta.requiresSupervisor ? 1 : 0) +
    (schema.meta.requiresClient ? 1 : 0) +
    (schema.meta.requiresPlantArea ? 1 : 0) +
    (schema.meta.requiresShift ? 1 : 0) +
    (schema.meta.requiresPermitRefs ? 1 : 0) +
    (schema.meta.requiresMusterPoint ? 1 : 0) +
    (schema.meta.customFields?.length ?? 0);

  return (
    <AppShell>
      <div className="page-shell">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate('/templates')}
            className="flex items-center gap-1 text-sm text-[#4A5568] hover:text-[#1A1A1A] transition-colors"
          >
            <ChevronLeft size={16} /> Templates
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#6B7280]">v{templateVersion}</span>
            {saveState === 'saved' && <span className="text-xs text-[#1B7F3A] flex items-center gap-1"><Check size={12} /> Saved</span>}
            {saveState === 'saving' && <span className="text-xs text-[#4A5568] flex items-center gap-1"><LoadingSpinner size="sm" /> Saving...</span>}
            {saveState === 'unsaved' && <span className="text-xs text-[#92400E]">Unsaved changes</span>}
            {saveState === 'error' && <span className="text-xs text-[#B42318]">Save failed</span>}
            {templateId && (
              <button onClick={handleDelete} className="p-1.5 text-[#4A5568] hover:text-[#B42318] hover:bg-red-50 rounded transition-colors" title="Delete template">
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={doSave}
              className="flex items-center gap-1.5 bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
            >
              <Save size={14} /> Save
            </button>
          </div>
        </div>

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm space-y-1">
            {validationErrors.map((err, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                {err}
              </div>
            ))}
          </div>
        )}

        {/* Template name + description */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5 mb-4">
          <input
            type="text"
            value={templateName}
            onChange={e => { setTemplateName(e.target.value); markUnsaved(); }}
            placeholder="Template name"
            className="w-full text-lg font-semibold text-[#1A1A1A] border-none outline-none placeholder:text-[#9CA3AF] bg-transparent"
          />
          <input
            type="text"
            value={description}
            onChange={e => { setDescription(e.target.value); markUnsaved(); }}
            placeholder="Description (optional)"
            className="w-full text-sm text-[#4A5568] border-none outline-none placeholder:text-[#9CA3AF] bg-transparent mt-1"
          />
        </div>

        {/* Job Details section */}
        <div className="mb-4">
          <SectionCard title="Job Details" icon={HardHat} count={enabledFieldCount}>
            <p className="text-xs text-[#4A5568] mb-4">Choose which fields to collect when someone creates a JHA from this template.</p>
            <div className="space-y-2">
              {[
                { key: 'requiresTaskName' as const, label: 'Task / Activity Name' },
                { key: 'requiresSiteName' as const, label: 'Site / Location' },
                { key: 'requiresDate' as const, label: 'Date' },
                { key: 'requiresSupervisor' as const, label: 'Supervisor' },
                { key: 'requiresClient' as const, label: 'Client' },
                { key: 'requiresPlantArea' as const, label: 'Plant / Area / Panel' },
                { key: 'requiresShift' as const, label: 'Shift' },
                { key: 'requiresPermitRefs' as const, label: 'Permit / PTW / Isolation refs' },
                { key: 'requiresMusterPoint' as const, label: 'Muster point' },
              ].map(field => (
                <label key={field.key} className="flex items-center justify-between p-3 rounded-lg border border-[#E5E7EB] hover:border-[#D1D5DB] cursor-pointer transition-colors">
                  <span className="text-sm text-[#1A1A1A]">{field.label}</span>
                  <Toggle checked={!!schema.meta[field.key]} onChange={v => updateMeta({ [field.key]: v })} />
                </label>
              ))}
            </div>

            <div className="mt-4 p-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB]">
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1">
                Max acceptable residual risk (L×C)
              </label>
              <p className="text-xs text-[#6B7280] mb-2">
                If residual L×C is above this (default 9 = Moderate), an escalation note is required before publish.
              </p>
              <input
                type="number"
                min={1}
                max={25}
                value={schema.meta.maxAcceptableResidualScore ?? 9}
                onChange={e => {
                  const n = Math.min(25, Math.max(1, parseInt(e.target.value, 10) || 9));
                  updateMeta({ maxAcceptableResidualScore: n });
                }}
                className="form-input-sm w-24"
              />
            </div>

            {/* Custom fields */}
            {(schema.meta.customFields ?? []).length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-[#4A5568] uppercase tracking-wide">Custom Fields</p>
                {(schema.meta.customFields ?? []).map(field => (
                  <div key={field.id} className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E7EB]">
                    <input
                      type="text"
                      value={field.label}
                      onChange={e => updateCustomField(field.id, { label: e.target.value })}
                      placeholder="Field label"
                      className="flex-1 text-sm border border-[#E5E7EB] rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                    />
                    <select
                      value={field.type}
                      onChange={e => updateCustomField(field.id, { type: e.target.value as JhaCustomField['type'] })}
                      className="text-sm border border-[#E5E7EB] rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] bg-white"
                    >
                      <option value="text">Text</option>
                      <option value="long_text">Long Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-[#4A5568] shrink-0">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={e => updateCustomField(field.id, { required: e.target.checked })}
                        className="w-3.5 h-3.5 accent-[#2E75B6]"
                      />
                      Req
                    </label>
                    <button onClick={() => deleteCustomField(field.id)} className="p-1 text-[#4A5568] hover:text-[#B42318] shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={addCustomField}
              className="mt-3 flex items-center gap-1.5 text-xs text-[#2E75B6] hover:text-[#1e5394] font-medium"
            >
              <Plus size={13} /> Add custom field
            </button>
          </SectionCard>
        </div>

        {/* Default SWMS from company library */}
        {profile?.company_id && (
          <div className="mb-4">
            <JhaSwmsLibraryPicker
              companyId={profile.company_id}
              selectedIds={schema.meta.defaultLinkedSwmsIds ?? []}
              onChange={ids => updateMeta({ defaultLinkedSwmsIds: ids })}
              variant="template"
            />
          </div>
        )}

        {/* Step library */}
        <div className="mb-4">
          <SectionCard
            title="Step library"
            icon={Library}
            count={schema.stepLibrary?.length ?? 0}
            action={<button type="button" onClick={addLibraryStep} className="flex items-center gap-1 text-xs text-[#2E75B6] hover:text-[#1e5394] font-medium"><Plus size={13} /> Add step</button>}
          >
            <p className="text-xs text-[#4A5568] mb-3">
              Pre-approved steps seeded into new JHAs. Load a mining pack, then edit descriptions as needed.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {JHA_STEP_PACKS.map(pack => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => applyStepPack(pack.id)}
                  className="text-xs px-3 py-1.5 rounded-md border border-[#E5E7EB] bg-white hover:border-[#2E75B6] hover:text-[#2E75B6]"
                  title={pack.description}
                >
                  Load: {pack.name}
                </button>
              ))}
            </div>
            {(schema.stepLibrary?.length ?? 0) === 0 ? (
              <p className="text-sm text-[#9CA3AF] text-center py-4 border border-dashed border-[#E5E7EB] rounded-lg">
                No library steps yet — load a pack or add steps manually.
              </p>
            ) : (
              <div className="space-y-2">
                {(schema.stepLibrary ?? []).map((s, idx) => (
                  <div key={s.id} className="flex items-start gap-2 p-3 rounded-lg border border-[#E5E7EB]">
                    <span className="text-xs font-semibold text-[#0A2540] bg-[#0A2540]/10 px-2 py-1 rounded shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={s.description}
                        onChange={e => updateLibraryStep(s.id, e.target.value)}
                        className="w-full text-sm border border-[#E5E7EB] rounded px-2.5 py-1.5 mb-1"
                        placeholder="Work step description"
                      />
                      <p className="text-[11px] text-[#6B7280] truncate">
                        {(s.hazards || '').split('\n').filter(Boolean).length} hazard(s)
                        {' · '}
                        {(s.controlMeasures ?? []).filter(m => m.text.trim()).length} control(s)
                      </p>
                    </div>
                    <button type="button" onClick={() => deleteLibraryStep(s.id)} className="p-1 text-[#4A5568] hover:text-[#B42318] shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Risk Levels */}
        <div className="mb-4">
          <SectionCard
            title="Risk Levels"
            icon={AlertCircle}
            count={schema.riskLevels.length}
            action={<button onClick={addRiskLevel} className="flex items-center gap-1 text-xs text-[#2E75B6] hover:text-[#1e5394] font-medium"><Plus size={13} /> Add</button>}
          >
            <p className="text-xs text-[#4A5568] mb-4">Define the risk rating levels users can select when assessing each job step.</p>
            <div className="space-y-2">
              {schema.riskLevels.map(risk => (
                <div key={risk.id} className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E7EB]">
                  <GripVertical size={14} className="text-[#9CA3AF] shrink-0" />
                  <input
                    type="text"
                    value={risk.label}
                    onChange={e => updateRiskLevel(risk.id, { label: e.target.value })}
                    placeholder="Label"
                    className="flex-1 text-sm border border-[#E5E7EB] rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                  />
                  <select
                    value={risk.color}
                    onChange={e => updateRiskLevel(risk.id, { color: e.target.value })}
                    className="text-sm border border-[#E5E7EB] rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] bg-white"
                  >
                    {RISK_COLORS.map(c => <option key={c.color} value={c.color}>{c.label}</option>)}
                  </select>
                  <div className="w-6 h-6 rounded-full shrink-0 border border-[#E5E7EB]" style={{ backgroundColor: risk.color }} />
                  <input
                    type="number"
                    value={risk.score}
                    onChange={e => updateRiskLevel(risk.id, { score: e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0 })}
                    className="w-14 text-sm border border-[#E5E7EB] rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                    title="Score"
                  />
                  <button onClick={() => deleteRiskLevel(risk.id)} className="p-1 text-[#4A5568] hover:text-[#B42318] shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* PPE Options */}
        <div className="mb-4">
          <SectionCard
            title="PPE Options"
            icon={HardHat}
            count={schema.ppeOptions.length}
            action={<button onClick={addPpeOption} className="flex items-center gap-1 text-xs text-[#2E75B6] hover:text-[#1e5394] font-medium"><Plus size={13} /> Add</button>}
          >
            <p className="text-xs text-[#4A5568] mb-4">PPE chips users can select. Add AS/NZS references for the PDF pack.</p>
            <div className="space-y-2">
              {schema.ppeOptions.map(opt => (
                <div key={opt.id} className="flex items-center gap-2 p-2 rounded-lg border border-[#E5E7EB]">
                  <input
                    type="text"
                    value={opt.label}
                    onChange={e => updatePpeOption(opt.id, { label: e.target.value })}
                    className="flex-1 text-sm border border-[#E5E7EB] rounded px-2.5 py-1.5"
                    placeholder="PPE item"
                  />
                  <input
                    type="text"
                    value={opt.standardRef ?? ''}
                    onChange={e => updatePpeOption(opt.id, { standardRef: e.target.value })}
                    className="w-36 text-xs border border-[#E5E7EB] rounded px-2 py-1.5"
                    placeholder="AS/NZS …"
                  />
                  <button type="button" onClick={() => deletePpeOption(opt.id)} className="p-1 text-[#4A5568] hover:text-[#B42318]">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Sign-Off Roles */}
        <div className="mb-4">
          <SectionCard
            title="Sign-Off Roles"
            icon={ShieldCheck}
            count={schema.signOffRoles.length}
            action={<button onClick={addSignOffRole} className="flex items-center gap-1 text-xs text-[#2E75B6] hover:text-[#1e5394] font-medium"><Plus size={13} /> Add</button>}
          >
            <p className="text-xs text-[#4A5568] mb-4">Define who must sign off on the JHA before it can be published.</p>
            <div className="space-y-2">
              {schema.signOffRoles.map(role => (
                <div key={role.id} className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E7EB]">
                  <input
                    type="text"
                    value={role.label}
                    onChange={e => updateSignOffRole(role.id, { label: e.target.value })}
                    placeholder="Role label"
                    className="flex-1 text-sm border border-[#E5E7EB] rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-[#4A5568] shrink-0">
                    <Toggle checked={role.required} onChange={v => updateSignOffRole(role.id, { required: v })} />
                    Required
                  </label>
                  <button onClick={() => deleteSignOffRole(role.id)} className="p-1 text-[#4A5568] hover:text-[#B42318] shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
