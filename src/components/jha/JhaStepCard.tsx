import { useEffect, useState } from 'react';
import {
  CONTROL_HIERARCHY,
  CONSEQUENCE_OPTIONS,
  LIKELIHOOD_OPTIONS,
  bandLabel,
  formatControlMeasuresText,
  lxCProduct,
  matchRiskLevelId,
  type ControlHierarchyId,
  type JhaControlMeasure,
  type JhaStep,
  type JhaStepPhoto,
  type JhaTemplateSchema,
  type RiskLevel,
} from '../../types/jha';
import { nanoid } from '../../lib/nanoid';
import { removeJhaStepPhoto, signedPhotoUrl, uploadJhaStepPhoto } from '../../lib/jhaPhotos';
import {
  AlertCircle, ArrowRight, Camera, Plus, ShieldAlert, ShieldCheck as ShieldCheckIcon,
  Trash2, TrendingUp,
} from 'lucide-react';

type Props = {
  step: JhaStep;
  index: number;
  schema: JhaTemplateSchema;
  canDelete: boolean;
  maxAcceptableResidual: number;
  documentId: string | null;
  onChange: (updates: Partial<JhaStep>) => void;
  onDelete: () => void;
  getRiskInfo: (id: string) => RiskLevel | undefined;
};

function emptyControl(): JhaControlMeasure {
  return { id: nanoid(), hierarchy: 'administrative', text: '', owner: '', verify: '' };
}

export function JhaStepCard({
  step,
  index,
  schema,
  canDelete,
  maxAcceptableResidual,
  documentId,
  onChange,
  onDelete,
  getRiskInfo,
}: Props) {
  const measures = step.controlMeasures?.length ? step.controlMeasures : [];
  const photos = step.photos ?? [];
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const inherentProduct = lxCProduct(step.likelihood, step.consequence);
  const residualProduct = lxCProduct(step.residualLikelihood || '', step.residualConsequence || '');
  const residualAbove = residualProduct != null && residualProduct > maxAcceptableResidual;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const p of photos) {
        const url = await signedPhotoUrl(p.storagePath, 3600);
        if (url) next[p.id] = url;
      }
      if (!cancelled) setPhotoUrls(next);
    })();
    return () => { cancelled = true; };
  }, [photos.map(p => p.storagePath).join('|')]);

  async function handlePhotoUpload(files: FileList | null) {
    if (!files?.length || !documentId) return;
    setUploading(true);
    try {
      const added: JhaStepPhoto[] = [];
      for (const file of Array.from(files)) {
        const uploaded = await uploadJhaStepPhoto(documentId, step.id, file);
        added.push({ id: uploaded.id, storagePath: uploaded.storagePath, caption: '' });
      }
      onChange({ photos: [...photos, ...added] });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Photo upload failed — save the JHA draft first if this is a new document.');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePhoto(photo: JhaStepPhoto) {
    try {
      await removeJhaStepPhoto(photo.storagePath);
    } catch { /* ignore storage miss */ }
    onChange({ photos: photos.filter(p => p.id !== photo.id) });
  }

  const initialRiskInfo = step.initialRisk ? getRiskInfo(step.initialRisk) : null;
  const residualRiskInfo = step.residualRisk ? getRiskInfo(step.residualRisk) : null;

  const setLikelihoodConsequence = (patch: { likelihood?: string; consequence?: string }) => {
    const likelihood = patch.likelihood ?? step.likelihood;
    const consequence = patch.consequence ?? step.consequence;
    const product = lxCProduct(likelihood, consequence);
    const initialRisk = product != null ? matchRiskLevelId(product, schema.riskLevels) : step.initialRisk;
    onChange({ likelihood, consequence, initialRisk });
  };

  const setResidualLC = (patch: { residualLikelihood?: string; residualConsequence?: string }) => {
    const residualLikelihood = patch.residualLikelihood ?? step.residualLikelihood ?? '';
    const residualConsequence = patch.residualConsequence ?? step.residualConsequence ?? '';
    const product = lxCProduct(residualLikelihood, residualConsequence);
    const residualRisk = product != null ? matchRiskLevelId(product, schema.riskLevels) : step.residualRisk;
    onChange({ residualLikelihood, residualConsequence, residualRisk });
  };

  const setMeasures = (next: JhaControlMeasure[]) => {
    onChange({
      controlMeasures: next,
      controls: formatControlMeasuresText(next),
    });
  };

  const updateMeasure = (id: string, patch: Partial<JhaControlMeasure>) => {
    setMeasures(measures.map(m => (m.id === id ? { ...m, ...patch } : m)));
  };

  return (
    <div className="border border-[#E5E7EB] rounded-md overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#E5E7EB]">
        <span className="text-xs font-semibold text-navy">Step {index + 1}</span>
        {canDelete && (
          <button type="button" onClick={onDelete} className="p-1 text-[#4A5568] hover:text-[#B42318] rounded transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-[#4A5568] mb-1 block">Job Step Description</label>
          <textarea
            value={step.description}
            onChange={e => onChange({ description: e.target.value })}
            placeholder="Describe the work step..."
            rows={2}
            className="w-full text-sm border border-[#E5E7EB] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] resize-none bg-white"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-[#4A5568] mb-1 flex items-center gap-1">
              <AlertCircle size={12} className="text-[#B42318]" />
              Potential Hazards
            </label>
            <textarea
              value={step.hazards}
              onChange={e => onChange({ hazards: e.target.value })}
              placeholder="One hazard per line…"
              rows={3}
              className="w-full text-sm border border-[#E5E7EB] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] resize-none bg-white"
            />
            <p className="text-[10px] text-[#9CA3AF] mt-1">List each hazard on its own line for the PDF table.</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-[#4A5568] mb-1 flex items-center gap-1">
                <ShieldAlert size={12} className="text-[#92400E]" />
                Consequence
              </label>
              <select
                value={step.consequence}
                onChange={e => setLikelihoodConsequence({ consequence: e.target.value })}
                className="w-full text-sm border border-[#E5E7EB] rounded px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] bg-white"
              >
                <option value="">Select consequence…</option>
                {CONSEQUENCE_OPTIONS.map(c => (
                  <option key={c.id} value={c.id}>{c.label} — {c.description}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#4A5568] mb-1 flex items-center gap-1">
                <TrendingUp size={12} className="text-[#2E75B6]" />
                Likelihood
              </label>
              <select
                value={step.likelihood}
                onChange={e => setLikelihoodConsequence({ likelihood: e.target.value })}
                className="w-full text-sm border border-[#E5E7EB] rounded px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] bg-white"
              >
                <option value="">Select likelihood…</option>
                {LIKELIHOOD_OPTIONS.map(l => (
                  <option key={l.id} value={l.id}>{l.label} — {l.description}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="border border-red-200 rounded-lg bg-red-50/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert size={14} className="text-[#B42318]" />
            <span className="text-xs font-semibold text-[#B42318] uppercase tracking-wide">Before controls — inherent risk</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {inherentProduct != null ? (
              <p className="text-sm text-[#4A5568]">
                L×C = <strong className="text-[#1A1A1A]">{inherentProduct}</strong>
                {' → '}
                <strong>{bandLabel(inherentProduct)}</strong>
                <span className="text-[11px] text-[#9CA3AF] ml-1">(auto from matrix)</span>
              </p>
            ) : (
              <p className="text-xs text-[#9CA3AF]">Select likelihood and consequence to calculate risk.</p>
            )}
            {initialRiskInfo && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold text-white"
                style={{ backgroundColor: initialRiskInfo.color }}
              >
                {initialRiskInfo.label.toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="border border-[#E5E7EB] rounded-lg bg-white p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ArrowRight size={14} className="text-[#2E75B6]" />
              <span className="text-xs font-semibold text-[#0A2540] uppercase tracking-wide">
                Controls (hierarchy of controls)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMeasures([...measures, emptyControl()])}
              className="text-xs text-[#2E75B6] hover:underline flex items-center gap-1"
            >
              <Plus size={12} /> Add control
            </button>
          </div>
          <p className="text-[11px] text-[#6B7280]">
            Prefer higher controls first: Eliminate → Substitute → Isolate → Engineering → Admin → PPE.
          </p>
          {measures.length === 0 && (
            <button
              type="button"
              onClick={() => setMeasures([emptyControl()])}
              className="w-full text-sm border border-dashed border-[#D1D5DB] rounded-md py-3 text-[#6B7280] hover:border-[#2E75B6] hover:text-[#2E75B6]"
            >
              Add first control measure
            </button>
          )}
          {measures.map((m, mi) => (
            <div key={m.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start border border-[#F3F4F6] rounded-md p-2 bg-[#F9FAFB]">
              <div className="sm:col-span-3">
                <label className="text-[10px] text-[#6B7280]">Type</label>
                <select
                  value={m.hierarchy}
                  onChange={e => updateMeasure(m.id, { hierarchy: e.target.value as ControlHierarchyId })}
                  className="w-full min-h-[44px] h-auto text-xs border border-[#E5E7EB] rounded px-2 py-2 bg-white"
                >
                  {CONTROL_HIERARCHY.map(h => (
                    <option key={h.id} value={h.id}>{h.order}. {h.label}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-9 sm:col-start-4 flex justify-end sm:hidden">
                <button
                  type="button"
                  onClick={() => setMeasures(measures.filter((_, i) => i !== mi))}
                  className="text-[#9CA3AF] hover:text-red-600"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="sm:col-span-8">
                <label className="text-[10px] text-[#6B7280]">Control measure</label>
                <textarea
                  value={m.text}
                  onChange={e => updateMeasure(m.id, { text: e.target.value })}
                  rows={4}
                  className="w-full min-h-[5.5rem] text-xs border border-[#E5E7EB] rounded px-2 py-2 bg-white resize-y"
                  placeholder={"List specific, verifiable actions (one per line)…\ne.g.\n• Barricade exclusion zone\n• Spotter required when reversing"}
                />
              </div>
              <div className="sm:col-span-1 hidden sm:flex justify-end pt-5">
                <button
                  type="button"
                  onClick={() => setMeasures(measures.filter((_, i) => i !== mi))}
                  className="text-[#9CA3AF] hover:text-red-600"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="sm:col-span-5">
                <label className="text-[10px] text-[#6B7280]">Owner</label>
                <input
                  value={m.owner}
                  onChange={e => updateMeasure(m.id, { owner: e.target.value })}
                  className="w-full min-h-[44px] h-auto text-xs border border-[#E5E7EB] rounded px-2 py-2 bg-white"
                  placeholder="Accountable person / role"
                />
              </div>
              <div className="sm:col-span-6">
                <label className="text-[10px] text-[#6B7280]">Verify</label>
                <input
                  value={m.verify}
                  onChange={e => updateMeasure(m.id, { verify: e.target.value })}
                  className="w-full min-h-[44px] h-auto text-xs border border-[#E5E7EB] rounded px-2 py-2 bg-white"
                  placeholder="e.g. Visual check before start / LOTO ticket #"
                />
              </div>
            </div>
          ))}
        </div>

        <div className={`rounded-lg p-3 border ${residualAbove ? 'border-amber-300 bg-amber-50' : 'border-green-200 bg-green-50/50'}`}>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheckIcon size={14} className={residualAbove ? 'text-amber-700' : 'text-[#166534]'} />
            <span className={`text-xs font-semibold uppercase tracking-wide ${residualAbove ? 'text-amber-800' : 'text-[#166534]'}`}>
              After controls — residual risk
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#6B7280]">Residual consequence</label>
              <select
                value={step.residualConsequence || ''}
                onChange={e => setResidualLC({ residualConsequence: e.target.value })}
                className="w-full text-sm border border-[#E5E7EB] rounded px-2.5 py-2 bg-white"
              >
                <option value="">Select…</option>
                {CONSEQUENCE_OPTIONS.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[#6B7280]">Residual likelihood</label>
              <select
                value={step.residualLikelihood || ''}
                onChange={e => setResidualLC({ residualLikelihood: e.target.value })}
                className="w-full text-sm border border-[#E5E7EB] rounded px-2.5 py-2 bg-white"
              >
                <option value="">Select…</option>
                {LIKELIHOOD_OPTIONS.map(l => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {residualProduct != null ? (
              <p className="text-sm text-[#4A5568]">
                L×C = <strong className="text-[#1A1A1A]">{residualProduct}</strong>
                {' → '}
                <strong>{bandLabel(residualProduct)}</strong>
              </p>
            ) : (
              <p className="text-xs text-[#9CA3AF]">Select residual L and C after controls.</p>
            )}
            {residualRiskInfo && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold text-white"
                style={{ backgroundColor: residualRiskInfo.color }}
              >
                {residualRiskInfo.label.toUpperCase()}
              </div>
            )}
          </div>
          {residualAbove && (
            <div className="mt-3">
              <label className="text-xs font-medium text-amber-900 mb-1 block">
                Escalation note required (residual above L×C {maxAcceptableResidual})
              </label>
              <textarea
                value={step.residualEscalationNote || ''}
                onChange={e => onChange({ residualEscalationNote: e.target.value })}
                rows={2}
                placeholder="Who approved proceeding, and what additional controls / hold points apply?"
                className="w-full text-sm border border-amber-300 rounded px-3 py-2 bg-white resize-none"
              />
            </div>
          )}
        </div>

        <div className="border border-[#E5E7EB] rounded-lg bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Camera size={14} className="text-[#4A5568]" />
              <span className="text-xs font-semibold text-[#0A2540] uppercase tracking-wide">Photos / sketches</span>
            </div>
            <label className={`text-xs text-[#2E75B6] hover:underline flex items-center gap-1 cursor-pointer ${!documentId || uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Plus size={12} /> {uploading ? 'Uploading…' : 'Add photo'}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={!documentId || uploading}
                onChange={e => {
                  void handlePhotoUpload(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {!documentId && (
            <p className="text-[11px] text-[#9CA3AF]">Save the JHA once to enable photo uploads.</p>
          )}
          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {photos.map(p => (
                <div key={p.id} className="relative group border border-[#E5E7EB] rounded overflow-hidden bg-[#F9FAFB]">
                  {photoUrls[p.id] ? (
                    <img src={photoUrls[p.id]} alt="" className="w-full h-24 object-cover" />
                  ) : (
                    <div className="w-full h-24 flex items-center justify-center text-[10px] text-[#9CA3AF]">Loading…</div>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleRemovePhoto(p)}
                    className="absolute top-1 right-1 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                  <input
                    value={p.caption ?? ''}
                    onChange={e => {
                      const caption = e.target.value;
                      onChange({
                        photos: photos.map(x => x.id === p.id ? { ...x, caption } : x),
                      });
                    }}
                    placeholder="Caption"
                    className="w-full text-[10px] border-t border-[#E5E7EB] px-1.5 py-1 bg-white"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
