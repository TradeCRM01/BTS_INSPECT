import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { TemplateSchema, Section, Question, QuestionType, LayoutMode, SignOffRole } from '../types/template';
import { TemplateSchemaValidator } from '../types/template';
import { showIfQuestionIds } from '../lib/conditionEval';
import { INSPECTION_TEMPLATE_PACKS, clonePackSections, packMetaDefaults } from '../lib/inspectionTemplatePacks';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { SectionPanel } from '../components/template-editor/SectionPanel';
import { QuestionEditor } from '../components/template-editor/QuestionEditor';
import { MobilePreview } from '../components/template-editor/MobilePreview';
import { PdfPreviewModal } from '../components/template-editor/PdfPreviewModal';
import { QuestionTypePicker } from '../components/template-editor/QuestionTypePicker';
import { ShowIfEditor } from '../components/template-editor/ShowIfEditor';
import {
  ChevronLeft, Save, CheckCircle, AlertCircle, Plus, Layers, Trash2, Settings2, X, Library, FileText
} from 'lucide-react';
import { nanoid } from '../lib/nanoid';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  // Dedicated /templates/new route has no :id param — treat missing id as new
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [templateName, setTemplateName] = useState('Untitled Template');
  const [renderer, setRenderer] = useState<string>('generic_inspection');
  const [schema, setSchema] = useState<TemplateSchema>({
    meta: { requiresSiteName: true, requiresSiteAddress: true, requiresClientName: true, requiresJobNumber: false, customFields: [] },
    sections: [],
  });
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showQTypePicker, setShowQTypePicker] = useState(false);
  const [showMetaSettings, setShowMetaSettings] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(isNew ? null : id);
  const [renderers, setRenderers] = useState<Array<{ key: string; label: string }>>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const autoSaveRef = useRef<ReturnType<typeof setTimeout>>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: existingTemplate, isLoading, isError, refetch } = useQuery({
    queryKey: ['template', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !isNew && !!id,
    staleTime: 1000 * 30,
  });

  // Load available renderers for this company
  useEffect(() => {
    if (!profile?.company_id) return;
    supabase
      .from('inspection_renderers')
      .select('key, label')
      .eq('company_id', profile.company_id)
      .order('built_in', { ascending: false })
      .order('label')
      .then(({ data }) => {
        if (data) {
          setRenderers(data);
          // Initialize built-in renderers if none exist
          if (data.length === 0) {
            initializeBuiltInRenderers();
          }
        }
      });
  }, [profile?.company_id]);

  async function initializeBuiltInRenderers() {
    if (!profile?.company_id) return;
    await supabase.from('inspection_renderers').insert([
      { company_id: profile.company_id, key: 'generic_inspection', label: 'Generic Inspection', built_in: true },
      { company_id: profile.company_id, key: 'electrical_3000', label: 'AS/NZS 3000:2018', built_in: true },
    ]);
    // Reload
    const { data } = await supabase
      .from('inspection_renderers')
      .select('key, label')
      .eq('company_id', profile.company_id)
      .order('built_in', { ascending: false })
      .order('label');
    if (data) setRenderers(data);
  }

  useEffect(() => {
    if (existingTemplate) {
      setTemplateName(existingTemplate.name);
      setRenderer(existingTemplate.report_renderer);
      const loadedSchema = existingTemplate.schema as TemplateSchema;
      const safeSchema: TemplateSchema = {
        meta: loadedSchema?.meta ?? { requiresSiteName: true, requiresSiteAddress: true, requiresClientName: true, requiresJobNumber: false, customFields: [] },
        sections: loadedSchema?.sections ?? [],
      };
      setSchema(safeSchema);
      if (safeSchema.sections.length > 0) {
        setSelectedSectionId(safeSchema.sections[0].id);
      }
    }
  }, [existingTemplate]);

  // Autosave: debounce 2s after any change, only for already-persisted templates
  useEffect(() => {
    if (saveState !== 'unsaved' || !templateId) return;
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      saveMutation.mutate();
    }, 2000);
    return () => clearTimeout(autoSaveRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, templateName, renderer, saveState, templateId]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!templateId) return;
      const { error } = await supabase.from('templates').delete().eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      navigate('/templates');
    },
  });

  function handleDelete() {
    if (!window.confirm(`Delete "${templateName}"? This cannot be undone.`)) return;
    deleteMutation.mutate();
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not authenticated');

      const errors = validateSchema(schema, templateName);
      if (errors.length > 0) {
        setValidationErrors(errors);
        throw new Error(errors[0]);
      }
      setValidationErrors([]);

      if (templateId) {
        const { error } = await supabase
          .from('templates')
          .update({
            name: templateName,
            report_renderer: renderer,
            schema: schema as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          })
          .eq('id', templateId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('templates')
          .insert({
            name: templateName,
            report_renderer: renderer,
            schema: schema as unknown as Record<string, unknown>,
            company_id: profile.company_id,
            created_by: profile.id,
          })
          .select()
          .single();
        if (error) throw error;
        setTemplateId(data.id);
        navigate(`/templates/${data.id}`, { replace: true });
      }
      await qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onMutate: () => setSaveState('saving'),
    onSuccess: () => setSaveState('saved'),
    onError: (err: unknown) => {
      setSaveState('error');
      const msg = err instanceof Error ? err.message : String(err);
      setValidationErrors(prev => prev.length > 0 ? prev : [msg]);
    },
  });

  function validateSchema(s: TemplateSchema, name: string): string[] {
    const errs: string[] = [];
    if (!name.trim()) errs.push('Template name is required');
    s.sections.forEach((sec, si) => {
      if (!sec.title.trim()) errs.push(`Section ${si + 1}: title is required`);
      sec.questions.forEach((q, qi) => {
        if (!q.label.trim()) errs.push(`Section ${si + 1}, Question ${qi + 1}: label is required`);
        if ((q.type === 'multiple_choice' || q.type === 'checkboxes') && (!q.options || q.options.length < 2)) {
          errs.push(`Section ${si + 1}, Question ${qi + 1}: needs at least 2 options`);
        }
        if (q.showIf) {
          const allQIds = s.sections.flatMap(sec2 => sec2.questions.map(qq => qq.id));
          for (const refId of showIfQuestionIds(q.showIf)) {
            if (!allQIds.includes(refId)) {
              errs.push(`Section ${si + 1}, Question ${qi + 1}: conditional references a non-existent question`);
              break;
            }
          }
        }
      });
      if (sec.showIf) {
        const allQIds = s.sections.flatMap(sec2 => sec2.questions.map(qq => qq.id));
        for (const refId of showIfQuestionIds(sec.showIf)) {
          if (!allQIds.includes(refId)) {
            errs.push(`Section ${si + 1}: section condition references a non-existent question`);
            break;
          }
        }
      }
    });
    return errs;
  }

  const selectedSection = schema.sections.find(s => s.id === selectedSectionId) ?? null;

  function addSection() {
    const newSection: Section = {
      id: nanoid(),
      title: 'New Section',
      description: '',
      isRepeating: false,
      questions: [],
    };
    setSchema(prev => ({ ...prev, sections: [...prev.sections, newSection] }));
    setSelectedSectionId(newSection.id);
    setSaveState('unsaved');
  }

  function applyTradePack(packId: string) {
    const pack = INSPECTION_TEMPLATE_PACKS.find(p => p.id === packId);
    if (!pack) return;
    const cloned = clonePackSections(packId);
    if (cloned.length === 0) return;
    if (schema.sections.length > 0) {
      const ok = window.confirm(
        `Load “${pack.name}”? This will append ${cloned.length} section(s) to the current template.`,
      );
      if (!ok) return;
    }
    setSchema(prev => ({
      ...prev,
      meta: { ...prev.meta, ...packMetaDefaults(packId) },
      sections: [...prev.sections, ...cloned],
    }));
    if (pack.suggestedRenderer) setRenderer(pack.suggestedRenderer);
    setSelectedSectionId(cloned[0]?.id ?? null);
    setSaveState('unsaved');
  }

  function updateSection(updates: Partial<Section>) {
    setSchema(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === selectedSectionId ? { ...s, ...updates } : s),
    }));
    setSaveState('unsaved');
  }

  function deleteSection(sectionId: string) {
    const newSections = schema.sections.filter(s => s.id !== sectionId);
    setSchema(prev => ({ ...prev, sections: newSections }));
    if (selectedSectionId === sectionId) {
      setSelectedSectionId(newSections[0]?.id ?? null);
    }
    setSaveState('unsaved');
  }

  function addQuestion(type: QuestionType) {
    if (!selectedSectionId) return;
    const newQ: Question = {
      id: nanoid(),
      type,
      label: '',
      required: false,
      ...(type === 'multiple_choice' || type === 'checkboxes' ? { options: ['Option 1', 'Option 2'] } : {}),
    };
    setSchema(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.id === selectedSectionId ? { ...s, questions: [...s.questions, newQ] } : s
      ),
    }));
    setSaveState('unsaved');
    setShowQTypePicker(false);
  }

  function updateQuestion(questionId: string, updates: Partial<Question>) {
    setSchema(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.id === selectedSectionId
          ? { ...s, questions: s.questions.map(q => q.id === questionId ? { ...q, ...updates } : q) }
          : s
      ),
    }));
    setSaveState('unsaved');
  }

  function deleteQuestion(questionId: string) {
    setSchema(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.id === selectedSectionId
          ? { ...s, questions: s.questions.filter(q => q.id !== questionId) }
          : s
      ),
    }));
    setSaveState('unsaved');
  }

  function reorderQuestions(questions: Question[]) {
    setSchema(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.id === selectedSectionId ? { ...s, questions } : s
      ),
    }));
    setSaveState('unsaved');
  }

  function reorderSections(sections: Section[]) {
    setSchema(prev => ({ ...prev, sections }));
    setSaveState('unsaved');
  }

  function updateMeta(key: keyof TemplateSchema['meta'], value: boolean) {
    setSchema(prev => ({ ...prev, meta: { ...prev.meta, [key]: value } }));
    setSaveState('unsaved');
  }

  function setLayoutMode(layoutMode: LayoutMode) {
    setSchema(prev => ({ ...prev, meta: { ...prev.meta, layoutMode } }));
    setSaveState('unsaved');
  }

  function addSignOffRole() {
    const role: SignOffRole = { id: nanoid(), label: 'New role', required: true };
    setSchema(prev => ({
      ...prev,
      meta: {
        ...prev.meta,
        signOffRoles: [...(prev.meta.signOffRoles ?? []), role],
      },
    }));
    setSaveState('unsaved');
  }

  function updateSignOffRole(roleId: string, updates: Partial<SignOffRole>) {
    setSchema(prev => ({
      ...prev,
      meta: {
        ...prev.meta,
        signOffRoles: (prev.meta.signOffRoles ?? []).map(r =>
          r.id === roleId ? { ...r, ...updates } : r
        ),
      },
    }));
    setSaveState('unsaved');
  }

  function deleteSignOffRole(roleId: string) {
    setSchema(prev => ({
      ...prev,
      meta: {
        ...prev.meta,
        signOffRoles: (prev.meta.signOffRoles ?? []).filter(r => r.id !== roleId),
      },
    }));
    setSaveState('unsaved');
  }

  function addCustomField() {
    const newField = {
      id: nanoid(),
      name: `field_${Date.now()}`,
      label: 'New Field',
      type: 'text' as const,
      required: false,
    };
    setSchema(prev => ({
      ...prev,
      meta: {
        ...prev.meta,
        customFields: [...(prev.meta.customFields ?? []), newField],
      },
    }));
    setSaveState('unsaved');
  }

  function updateCustomField(fieldId: string, updates: Partial<typeof schema.meta.customFields[0]>) {
    setSchema(prev => ({
      ...prev,
      meta: {
        ...prev.meta,
        customFields: (prev.meta.customFields ?? []).map(f =>
          f.id === fieldId ? { ...f, ...updates } : f
        ),
      },
    }));
    setSaveState('unsaved');
  }

  function deleteCustomField(fieldId: string) {
    setSchema(prev => ({
      ...prev,
      meta: {
        ...prev.meta,
        customFields: (prev.meta.customFields ?? []).filter(f => f.id !== fieldId),
      },
    }));
    setSaveState('unsaved');
  }

  function handleQuestionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedSection) return;
    const qs = selectedSection.questions;
    const oldIdx = qs.findIndex(q => q.id === active.id);
    const newIdx = qs.findIndex(q => q.id === over.id);
    reorderQuestions(arrayMove(qs, oldIdx, newIdx));
  }

  // All questions for conditional logic picker
  const allQuestions = schema.sections.flatMap(s =>
    s.questions.map(q => ({ ...q, sectionTitle: s.title }))
  );

  if (isError) return <PageError onRetry={refetch} />;

  return (
    <AppShell>
      {/* Top bar */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-30 shadow-sm">
        <div className="max-w-[1200px] mx-auto px-3 md:px-4 py-2 md:py-0 md:h-12 flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3">
          <button
            onClick={() => navigate('/templates')}
            className="text-[#4A5568] hover:text-[#1A1A1A] flex items-center gap-1 text-sm min-h-10 md:min-h-0"
          >
            <ChevronLeft size={16} /> Templates
          </button>
          <span className="hidden md:block text-[#E5E7EB]">/</span>
          <input
            value={templateName}
            onChange={e => { setTemplateName(e.target.value); setSaveState('unsaved'); }}
            className="font-medium text-sm text-[#1A1A1A] border border-[#E5E7EB] md:border-none outline-none bg-white md:bg-transparent min-w-0 flex-1 px-2 md:px-0 py-2 md:py-0 rounded md:rounded-none min-h-10 md:min-h-0"
            placeholder="Template name"
          />
          <select
            value={renderer}
            onChange={e => { setRenderer(e.target.value); setSaveState('unsaved'); }}
            className="text-xs border border-[#E5E7EB] rounded px-2 py-2 md:py-1 text-[#4A5568] bg-white min-h-10 md:min-h-0"
          >
            {renderers.map(r => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>

          {/* Save indicator */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-[#4A5568] shrink-0">
            {isLoading && <><LoadingSpinner size="sm" /> Loading...</>}
            {!isLoading && saveState === 'saving' && <><LoadingSpinner size="sm" /> Saving...</>}
            {!isLoading && saveState === 'saved' && <><CheckCircle size={13} className="text-[#1B7F3A]" /> Saved</>}
            {!isLoading && saveState === 'unsaved' && <><div className="w-2 h-2 rounded-full bg-amber-400" /> {templateId ? 'Saving soon…' : 'Unsaved'}</>}
            {!isLoading && saveState === 'error' && <><AlertCircle size={13} className="text-[#B42318]" /> Error</>}
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <button
              onClick={() => setShowPdfPreview(true)}
              disabled={schema.sections.length === 0}
              className="flex items-center gap-1.5 border border-[#2E75B6] text-[#2E75B6] px-2 md:px-3 py-2 md:py-1.5 rounded text-xs font-medium hover:bg-[#EFF6FF] disabled:opacity-50 transition-colors min-h-10 md:min-h-0 flex-1 md:flex-none justify-center md:justify-start"
              title="Live PDF preview with sample answers"
            >
              <FileText size={13} /> <span className="hidden sm:inline">PDF Preview</span>
            </button>
            {!isNew && templateId && (
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 border border-red-200 text-red-600 px-2 md:px-3 py-2 md:py-1.5 rounded text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors min-h-10 md:min-h-0 flex-1 md:flex-none justify-center md:justify-start"
              >
                <Trash2 size={13} /> <span className="hidden sm:inline">Delete</span>
              </button>
            )}
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 bg-[#0A2540] text-white px-2 md:px-3 py-2 md:py-1.5 rounded text-xs font-medium hover:bg-[#0d2f4e] disabled:opacity-50 min-h-10 md:min-h-0 flex-1 md:flex-none justify-center md:justify-start"
            >
              <Save size={13} /> <span className="hidden sm:inline">Save</span>
            </button>
          </div>
        </div>
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="max-w-[1200px] mx-auto px-4 pt-3">
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={14} className="text-red-600" />
              <p className="text-sm font-medium text-red-700">Please fix the following before saving:</p>
            </div>
            <ul className="list-disc list-inside text-sm text-red-600 space-y-0.5">
              {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Three-pane layout */}
      <div className="max-w-[1200px] mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-160px)]">
          {/* Left pane: sections + job details config */}
          <div className="w-full lg:w-56 lg:shrink-0 flex flex-col gap-3">
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#E5E7EB]">
                <div className="flex items-center gap-1.5">
                  <Layers size={13} className="text-[#4A5568]" />
                  <span className="text-xs font-semibold text-[#1A1A1A] uppercase tracking-wide">Sections</span>
                </div>
                <button
                  onClick={addSection}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#F9FAFB] text-[#4A5568] hover:text-[#1A1A1A]"
                >
                  <Plus size={14} />
                </button>
              </div>
              <SectionPanel
                sections={schema.sections}
                selectedId={selectedSectionId}
                onSelect={setSelectedSectionId}
                onDelete={deleteSection}
                onReorder={reorderSections}
              />
              {schema.sections.length === 0 && (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-[#4A5568]">No sections yet</p>
                  <button onClick={addSection} className="mt-2 text-xs text-[#2E75B6] hover:underline">
                    Add first section
                  </button>
                </div>
              )}
              <div className="border-t border-[#E5E7EB] px-3 py-2.5 bg-[#F9FAFB]">
                <div className="flex items-center gap-1.5 mb-2">
                  <Library size={12} className="text-[#4A5568]" />
                  <span className="text-[10px] font-semibold text-[#4A5568] uppercase tracking-wide">Trade packs</span>
                </div>
                <div className="space-y-1.5">
                  {INSPECTION_TEMPLATE_PACKS.map(pack => (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => applyTradePack(pack.id)}
                      className="w-full text-left px-2 py-1.5 rounded border border-[#E5E7EB] bg-white hover:border-[#2E75B6] transition-colors"
                      title={pack.description}
                    >
                      <p className="text-[11px] font-medium text-[#1A1A1A] leading-snug">{pack.name}</p>
                      <p className="text-[10px] text-[#9CA3AF] line-clamp-2 mt-0.5">{pack.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Job details configuration */}
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm overflow-hidden flex flex-col">
              <button
                onClick={() => setShowMetaSettings(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#F9FAFB] transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <Settings2 size={13} className="text-[#4A5568]" />
                  <span className="text-xs font-semibold text-[#1A1A1A] uppercase tracking-wide">Job Details</span>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${showMetaSettings ? 'bg-[#EFF6FF] text-[#2E75B6]' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                  {[schema.meta.requiresSiteName, schema.meta.requiresSiteAddress, schema.meta.requiresClientName, schema.meta.requiresJobNumber].filter(Boolean).length + (schema.meta.customFields?.length ?? 0)}
                </span>
              </button>
              {showMetaSettings && (
                <div className="border-t border-[#E5E7EB] px-3 py-2.5 space-y-3 bg-[#F9FAFB] overflow-y-auto flex-1 max-h-96">
                  <p className="text-[10px] text-[#9CA3AF] leading-snug">Choose which fields appear when starting an inspection from this template.</p>

                  {/* Standard fields */}
                  <div className="space-y-2">
                    {(
                      [
                        { key: 'requiresSiteName', label: 'Site Name' },
                        { key: 'requiresSiteAddress', label: 'Site Address' },
                        { key: 'requiresClientName', label: 'Client Name' },
                        { key: 'requiresJobNumber', label: 'Job Number' },
                      ] as const
                    ).map(({ key, label, required }) => (
                      <div key={key} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[#1A1A1A]">
                          {label}
                          {required && <span className="ml-1 text-[10px] text-[#9CA3AF]">(always on)</span>}
                        </span>
                        <button
                          type="button"
                          disabled={required}
                          onClick={() => updateMeta(key, !schema.meta[key])}
                          className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${schema.meta[key] ? 'bg-[#2E75B6]' : 'bg-[#E5E7EB]'} ${required ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${schema.meta[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Custom fields */}
                  {(schema.meta.customFields?.length ?? 0) > 0 && (
                    <div className="pt-2 border-t border-[#E5E7EB] space-y-2">
                      <p className="text-[10px] font-medium text-[#4A5568]">Custom Fields</p>
                      {schema.meta.customFields!.map(field => (
                        <div key={field.id} className="p-2 bg-white rounded border border-[#E5E7EB] space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={field.label}
                              onChange={e => updateCustomField(field.id, { label: e.target.value })}
                              className="flex-1 min-w-0 text-xs px-2 py-1 border border-[#E5E7EB] rounded focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                              placeholder="Field label"
                            />
                            <button
                              type="button"
                              onClick={() => deleteCustomField(field.id)}
                              className="flex-shrink-0 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <select
                              value={field.type}
                              onChange={e => updateCustomField(field.id, { type: e.target.value as any })}
                              className="flex-1 text-[10px] px-2 py-1 border border-[#E5E7EB] rounded focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                            >
                              <option value="text">Text</option>
                              <option value="long_text">Long Text</option>
                              <option value="number">Number</option>
                              <option value="date">Date</option>
                            </select>
                            <label className="flex items-center gap-1 cursor-pointer whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={e => updateCustomField(field.id, { required: e.target.checked })}
                                className="w-3 h-3"
                              />
                              <span className="text-[10px] text-[#4A5568]">Required</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add custom field button */}
                  <button
                    type="button"
                    onClick={addCustomField}
                    className="w-full flex items-center justify-center gap-1.5 text-xs text-[#2E75B6] font-medium hover:text-[#0A2540] py-1.5 rounded border border-dashed border-[#2E75B6] hover:border-[#0A2540] transition-colors"
                  >
                    <Plus size={13} /> Add Custom Field
                  </button>

                  {/* PDF layout mode */}
                  <div className="pt-2 border-t border-[#E5E7EB] space-y-1.5">
                    <p className="text-[10px] font-medium text-[#4A5568]">PDF layout mode</p>
                    <select
                      value={schema.meta.layoutMode ?? 'checklist'}
                      onChange={e => setLayoutMode(e.target.value as LayoutMode)}
                      className="w-full min-h-[44px] h-auto text-xs px-2 py-2 border border-[#E5E7EB] rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                    >
                      <option value="checklist">Checklist</option>
                      <option value="test_schedule">Test schedule</option>
                      <option value="certificate">Certificate</option>
                    </select>
                    <p className="text-[10px] text-[#9CA3AF] leading-snug">Controls how the inspection PDF body is laid out.</p>
                  </div>

                  {/* Sign-off / countersign roles */}
                  <div className="pt-2 border-t border-[#E5E7EB] space-y-2">
                    <p className="text-[10px] font-medium text-[#4A5568]">Sign-off / countersign roles</p>
                    <p className="text-[10px] text-[#9CA3AF] leading-snug">Collected on review before completing the inspection.</p>
                    {(schema.meta.signOffRoles ?? []).map(role => (
                      <div key={role.id} className="p-2 bg-white rounded border border-[#E5E7EB] space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={role.label}
                            onChange={e => updateSignOffRole(role.id, { label: e.target.value })}
                            className="flex-1 min-w-0 text-xs px-2 py-1 border border-[#E5E7EB] rounded focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                            placeholder="Role label"
                          />
                          <button
                            type="button"
                            onClick={() => deleteSignOffRole(role.id)}
                            className="flex-shrink-0 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={role.required}
                            onChange={e => updateSignOffRole(role.id, { required: e.target.checked })}
                            className="w-3 h-3"
                          />
                          <span className="text-[10px] text-[#4A5568]">Required</span>
                        </label>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addSignOffRole}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-[#2E75B6] font-medium hover:text-[#0A2540] py-1.5 rounded border border-dashed border-[#2E75B6] hover:border-[#0A2540] transition-colors"
                    >
                      <Plus size={13} /> Add role
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Middle pane: section editor */}
          <div className="w-full lg:flex-1 lg:min-w-0">
            {selectedSection ? (
              <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm">
                {/* Section settings */}
                <div className="px-4 py-3 border-b border-[#E5E7EB]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[#4A5568] mb-1">Section title</label>
                      <input
                        value={selectedSection.title}
                        onChange={e => updateSection({ title: e.target.value })}
                        className="w-full min-h-[44px] h-auto px-2.5 py-2 border border-[#E5E7EB] rounded text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                        placeholder="e.g. Visual Inspection"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[#4A5568] mb-1">Description (optional)</label>
                      <textarea
                        value={selectedSection.description ?? ''}
                        onChange={e => updateSection({ description: e.target.value })}
                        rows={2}
                        className="w-full min-h-[44px] h-auto px-2.5 py-2 border border-[#E5E7EB] rounded text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent resize-none"
                        placeholder="Instructions for this section..."
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div
                        className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${selectedSection.isRepeating ? 'bg-[#2E75B6]' : 'bg-[#E5E7EB]'}`}
                        onClick={() => updateSection({ isRepeating: !selectedSection.isRepeating })}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${selectedSection.isRepeating ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                      <span className="text-xs text-[#1A1A1A]">Allow multiple instances</span>
                    </label>
                    {selectedSection.isRepeating && (
                      <input
                        value={selectedSection.repeatLabel ?? ''}
                        onChange={e => updateSection({ repeatLabel: e.target.value })}
                        className="flex-1 px-2.5 py-1 border border-[#E5E7EB] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                        placeholder='Repeat label, e.g. "Circuit"'
                      />
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#E5E7EB]">
                    <ShowIfEditor
                      label="Show this section only if…"
                      value={selectedSection.showIf}
                      questions={allQuestions
                        .filter(q => !selectedSection.questions.some(sq => sq.id === q.id))
                        .map(q => ({ id: q.id, label: q.label, sectionTitle: q.sectionTitle }))}
                      onChange={showIf => updateSection({ showIf })}
                    />
                  </div>
                </div>

                {/* Questions list */}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleQuestionDragEnd}>
                  <SortableContext items={selectedSection.questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
                    <div className="divide-y divide-[#E5E7EB]">
                      {selectedSection.questions.map((q, idx) => (
                        <QuestionEditor
                          key={q.id}
                          question={q}
                          index={idx}
                          allQuestions={allQuestions}
                          onChange={updates => updateQuestion(q.id, updates)}
                          onDelete={() => deleteQuestion(q.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                {/* Add question */}
                <div className="px-4 py-3 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setShowQTypePicker(true)}
                    className="flex items-center gap-2 text-sm text-[#2E75B6] font-medium hover:text-[#0A2540] transition-colors"
                  >
                    <Plus size={16} /> Add Question
                  </button>
                  {selectedSection && (
                    <button
                      onClick={() => setShowPreview(true)}
                      className="lg:hidden text-sm text-[#2E75B6] font-medium hover:text-[#0A2540] transition-colors"
                    >
                      Preview
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm py-16 text-center">
                <p className="text-[#4A5568] text-sm">Select or create a section to start adding questions</p>
                <button onClick={addSection} className="mt-3 text-sm text-[#2E75B6] hover:underline">
                  Add first section
                </button>
              </div>
            )}
          </div>

          {/* Right pane: mobile preview (desktop) */}
          <div className="w-[280px] shrink-0 hidden lg:flex lg:flex-col">
            <p className="text-xs font-semibold text-[#4A5568] uppercase tracking-wide mb-2">Mobile Preview</p>
            <div className="flex-1 overflow-y-auto">
              <MobilePreview section={selectedSection} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile preview modal */}
      {showPreview && selectedSection && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setShowPreview(false)}
          />
          <div className="fixed inset-4 top-auto bottom-4 bg-white rounded-lg shadow-xl z-50 lg:hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB]">
              <h3 className="font-semibold text-[#1A1A1A]">Mobile Preview</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-[#4A5568] hover:text-[#1A1A1A]"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
              <MobilePreview section={selectedSection} />
            </div>
          </div>
        </>
      )}

      {/* Question type picker modal */}
      {showQTypePicker && (
        <QuestionTypePicker
          onSelect={addQuestion}
          onClose={() => setShowQTypePicker(false)}
        />
      )}

      <PdfPreviewModal
        open={showPdfPreview}
        onClose={() => setShowPdfPreview(false)}
        templateName={templateName}
        renderer={renderer}
        schema={schema}
      />
    </AppShell>
  );
}
