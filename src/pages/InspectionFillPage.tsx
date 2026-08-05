import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { QuestionRenderer } from '../components/inspection/QuestionRenderer';
import { evaluateCondition } from '../lib/conditionEval';
import type { TemplateSchema, Section, Question } from '../types/template';
import { ChevronLeft, ChevronRight, Plus, Trash2, ChevronDown, Camera, X } from 'lucide-react';
import { nanoid } from '../lib/nanoid';

type SaveStatus = 'saved' | 'saving' | 'error' | 'offline';

interface PhotoRecord {
  id?: string;
  storage_path: string;
  url: string;
  caption?: string;
  question_id: string;
  instance_id?: string;
}

export function InspectionFillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [sectionInstances, setSectionInstances] = useState<Record<string, string[]>>({});
  const [expandedInstances, setExpandedInstances] = useState<Record<string, boolean>>({});
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState<Record<string, boolean>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingSaveRef = useRef<Record<string, unknown> | null>(null);

  const { data: inspection, isLoading, isError } = useQuery({
    queryKey: ['inspection', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      // If the snapshot is missing the schema (can happen with older records),
      // fetch it from the live template and patch it in-memory.
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

  // Load photos for this inspection
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
    if (inspection) {
      const savedResponses = inspection.responses as Record<string, unknown> ?? {};
      setResponses(savedResponses);

      // Reconstruct sectionInstances from saved __-keyed responses
      const instanceMap: Record<string, string[]> = {};
      for (const key of Object.keys(savedResponses)) {
        const parts = key.split('__');
        if (parts.length === 2) {
          const [questionId, instanceId] = parts;
          // Find which section this question belongs to
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
    }
  }, [inspection]);

  const snapshotRaw = inspection?.template_snapshot as unknown as { schema?: TemplateSchema } | null;
  const schema = snapshotRaw?.schema ?? null;
  const templateName = (inspection?.template_snapshot as unknown as { name?: string } | null)?.name ?? '';
  const meta = inspection?.meta as Record<string, string> ?? {};

  async function saveResponses(newResponses: Record<string, unknown>) {
    if (!id) return;
    setSaveStatus('saving');
    try {
      const { error } = await supabase
        .from('inspections')
        .update({ responses: newResponses as unknown as Record<string, unknown> })
        .eq('id', id);
      if (error) throw error;
      setSaveStatus('saved');
      pendingSaveRef.current = null;
    } catch {
      setSaveStatus('error');
      pendingSaveRef.current = newResponses;
      // Queue to localStorage
      localStorage.setItem(`insp_${id}_responses`, JSON.stringify(newResponses));
    }
  }

  const debouncedSave = useCallback((newResponses: Record<string, unknown>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(() => saveResponses(newResponses), 600);
  }, [id]);

  async function flushAndNavigateToReview() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await saveResponses(responses);
    navigate(`/inspections/${id}/review`);
  }

  // Retry pending saves every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingSaveRef.current) saveResponses(pendingSaveRef.current);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  function updateResponse(key: string, value: unknown) {
    const newResponses = { ...responses, [key]: value };
    setResponses(newResponses);
    debouncedSave(newResponses);
  }

  function getResponseKey(questionId: string, instanceId?: string) {
    return instanceId ? `${questionId}__${instanceId}` : questionId;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="w-8 h-8 animate-spin rounded-full border-2 border-[#0A2540] border-t-transparent" />
      </div>
    );
  }

  if (isError || !inspection) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-[#4A5568] text-center">Could not load inspection. It may have been deleted or you don't have access.</p>
        <button
          onClick={() => navigate('/inspections')}
          className="bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Back to Inspections
        </button>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-[#4A5568] text-center">This inspection has no template data. It may be corrupted.</p>
        <button
          onClick={() => navigate('/inspections')}
          className="bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Back to Inspections
        </button>
      </div>
    );
  }

  // Filter visible sections
  const visibleSections = schema.sections.filter(sec => {
    if (!sec.showIf) return true;
    return evaluateCondition(sec.showIf, responses);
  });

  const currentSection = visibleSections[currentSectionIdx] ?? null;
  const isLastSection = currentSectionIdx === visibleSections.length - 1;
  const isFirstSection = currentSectionIdx === 0;

  // Completion dot per section
  function getSectionCompletion(sec: Section) {
    const visibleQs = sec.questions.filter(q => q.type !== 'heading' && (!q.showIf || evaluateCondition(q.showIf, responses)));
    const requiredQs = visibleQs.filter(q => q.required);
    if (requiredQs.length === 0) return 'full';
    const answered = requiredQs.filter(q => {
      const v = responses[q.id];
      return v !== undefined && v !== null && v !== '';
    });
    if (answered.length === requiredQs.length) return 'full';
    if (answered.length === 0) return 'empty';
    return 'partial';
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
      [sectionId]: (prev[sectionId] ?? []).filter(id => id !== instanceId),
    }));
    // Remove responses for this instance
    const newResponses = { ...responses };
    Object.keys(newResponses).forEach(key => {
      if (key.includes(`__${instanceId}`)) delete newResponses[key];
    });
    setResponses(newResponses);
    debouncedSave(newResponses);
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
    if (q.showIf && !evaluateCondition(q.showIf, responses)) return null;

    if (q.type === 'heading') {
      return (
        <div key={q.id} className="pt-2 pb-1">
          <h3 className="text-sm font-semibold text-[#0A2540] uppercase tracking-wide border-b border-[#E5E7EB] pb-1.5">
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
      <div key={key} className="bg-white rounded-lg border border-[#E5E7EB] p-4">
        <label className="block text-base font-medium text-[#1A1A1A] mb-0.5">
          {q.label}
          {q.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {q.helpText && <p className="text-sm text-[#4A5568] mb-3">{q.helpText}</p>}
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

        {/* Photo attachments */}
        {q.allowPhotos && q.type !== 'photo' && (
          <div className="mt-3 pt-3 border-t border-[#F3F4F6]">
            <label className={`flex items-center gap-2 justify-center w-full py-2.5 border-2 border-dashed border-[#E5E7EB] rounded-md cursor-pointer hover:border-[#2E75B6]/40 transition-colors ${attachmentUploading[uploadKey] ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <Camera size={15} className="text-[#4A5568]" />
              <span className="text-xs font-medium text-[#4A5568]">
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
                      className="w-full h-full object-cover rounded border border-[#E5E7EB]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAttachmentRemoved(photo.storage_path)}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Additional comments */}
        {q.allowComments && (
          <div className="mt-3 pt-3 border-t border-[#F3F4F6]">
            <label className="block text-xs font-medium text-[#4A5568] mb-1.5">Comments</label>
            <textarea
              value={String(responses[commentKey] ?? '')}
              onChange={e => updateResponse(commentKey, e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-md text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent resize-none bg-white placeholder-[#9CA3AF]"
              placeholder="Add comments..."
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-40 bg-[#0A2540] text-white h-14 flex items-center px-4 gap-3 shadow-md">
        <button
          onClick={() => navigate('/inspections')}
          className="p-1.5 rounded hover:bg-white/10"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{meta.siteName ?? 'Inspection'}</p>
          <p className="text-[11px] text-white/60 truncate">{templateName}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {saveStatus === 'saving' && (
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" title="Saving..." />
          )}
          {saveStatus === 'saved' && (
            <div className="w-2.5 h-2.5 rounded-full bg-[#1B7F3A]" title="Saved" />
          )}
          {saveStatus === 'error' && (
            <div className="w-2.5 h-2.5 rounded-full bg-[#B42318]" title="Save error" />
          )}
        </div>
      </div>

      {/* Section navigator */}
      <div className="sticky top-14 z-30 bg-white border-b border-[#E5E7EB] shadow-sm">
        <div className="flex overflow-x-auto no-scrollbar px-3 py-2 gap-2">
          {visibleSections.map((sec, idx) => {
            const completion = getSectionCompletion(sec);
            const isActive = idx === currentSectionIdx;
            return (
              <button
                key={sec.id}
                onClick={() => setCurrentSectionIdx(idx)}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
                  isActive
                    ? 'bg-[#0A2540] text-white'
                    : 'bg-[#F9FAFB] text-[#4A5568] border border-[#E5E7EB] hover:border-[#0A2540]/30'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${
                  completion === 'full' ? 'bg-[#1B7F3A]' :
                  completion === 'partial' ? 'bg-amber-400' :
                  isActive ? 'bg-white/50' : 'bg-[#E5E7EB]'
                }`} />
                {sec.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section content */}
      <div className="flex-1 max-w-[720px] w-full mx-auto px-4 py-4 pb-24">
        {currentSection && (
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-[#1A1A1A]">{currentSection.title}</h2>
              {currentSection.description && (
                <p className="text-sm text-[#4A5568] mt-1">{currentSection.description}</p>
              )}
            </div>

            {currentSection.isRepeating ? (
              <div className="space-y-3">
                {(sectionInstances[currentSection.id] ?? []).map((instanceId) => (
                  <div key={instanceId} className="border border-[#E5E7EB] rounded-lg bg-white overflow-hidden">
                    <button
                      onClick={() => setExpandedInstances(prev => ({ ...prev, [instanceId]: !prev[instanceId] }))}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F9FAFB]"
                    >
                      <span className="font-medium text-sm text-[#1A1A1A]">
                        {getInstanceLabel(currentSection, instanceId)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); removeInstance(currentSection.id, instanceId); }}
                          className="text-[#4A5568] hover:text-[#B42318] p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                        <ChevronDown
                          size={16}
                          className={`text-[#4A5568] transition-transform ${expandedInstances[instanceId] ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>
                    {expandedInstances[instanceId] && (
                      <div className="px-4 pb-4 space-y-3 border-t border-[#E5E7EB]">
                        {currentSection.questions
                          .filter(q => !q.showIf || evaluateCondition(q.showIf, responses))
                          .map(q => renderQuestion(q, instanceId))}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => addInstance(currentSection.id)}
                  className="flex items-center gap-2 w-full py-3 border-2 border-dashed border-[#E5E7EB] rounded-lg text-sm text-[#2E75B6] font-medium hover:border-[#2E75B6]/60 justify-center transition-colors"
                >
                  <Plus size={16} /> Add {currentSection.repeatLabel ?? 'Item'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {currentSection.questions.map(q => renderQuestion(q))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E7EB] px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setCurrentSectionIdx(i => Math.max(0, i - 1))}
          disabled={isFirstSection}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-md border border-[#E5E7EB] text-sm font-medium text-[#4A5568] disabled:opacity-30 hover:bg-[#F9FAFB] transition-colors"
        >
          <ChevronLeft size={16} /> Previous
        </button>
        {isLastSection ? (
          <button
            onClick={flushAndNavigateToReview}
            className="flex items-center gap-1.5 bg-[#0A2540] text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
          >
            Review & Complete <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={() => setCurrentSectionIdx(i => Math.min(visibleSections.length - 1, i + 1))}
            className="flex items-center gap-1.5 bg-[#0A2540] text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
          >
            Next Section <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
