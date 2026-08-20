import { useRef, useState, useCallback } from 'react';
import type { Question } from '../../types/template';
import { isNaAnswer, NA_ANSWER } from '../../types/template';
import { evaluateNumericStatus } from '../../reports/shared/inspectionCompose';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '../../lib/supabase';
import { uploadInspectionPhoto } from '../../lib/storageService';
import { Camera, X, RotateCcw, Check, Star, PenLine, Upload } from 'lucide-react';

interface PhotoRecord {
  id?: string;
  storage_path: string;
  url: string;
  caption?: string;
}

interface Props {
  question: Question;
  value: unknown;
  onChange: (val: unknown) => void;
  inspectionId: string;
  instanceId?: string;
  photos?: PhotoRecord[];
  onPhotoAdded?: (photo: PhotoRecord) => void;
  onPhotoRemoved?: (storagePath: string) => void;
}

interface SignatureInputProps {
  sigRef: React.RefObject<SignatureCanvas>;
  sigSaved: boolean;
  setSigSaved: (v: boolean) => void;
  sigDataUrl: string | null;
  hasSig: boolean;
  inspectionId: string;
  question: Question;
  instanceId?: string;
  onChange: (val: unknown) => void;
  clearSignature: () => void;
}

function SignatureInput({ sigRef, sigSaved, setSigSaved, sigDataUrl, hasSig, onChange, clearSignature }: SignatureInputProps) {
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [uploading, setUploading] = useState(false);
  const [displayImage, setDisplayImage] = useState<string | null>(sigDataUrl);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setDisplayImage(dataUrl);
      onChange(dataUrl);
      setSigSaved(true);
    } catch (err) {
      console.error('Signature upload failed:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function handleClear() {
    clearSignature();
    setDisplayImage(null);
    setSigSaved(false);
  }

  async function handleDrawDone() {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    const dataUrl = sigRef.current.toDataURL('image/png');
    setDisplayImage(dataUrl);
    onChange(dataUrl);
    setSigSaved(true);
  }

  if (displayImage) {
    return (
      <div className="border border-rule rounded-md overflow-hidden">
        <img src={displayImage} alt="Signature" className="w-full h-32 object-contain bg-white p-2" />
        <div className="flex items-center justify-between px-3 py-2 border-t border-rule bg-zebra">
          <span className="text-xs text-pass flex items-center gap-1">
            <Check size={12} /> Signature captured
          </span>
          <button type="button" onClick={handleClear} className="text-xs text-muted hover:text-fail transition-colors min-h-[44px]">
            Clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-rule rounded-md overflow-hidden">
      <div className="ops-tabs">
        <button
          type="button"
          onClick={() => setMode('draw')}
          className={`ops-tab min-h-[44px] flex-1 justify-center ${mode === 'draw' ? 'ops-tab-active' : ''}`}
        >
          <PenLine size={13} className="inline mr-1" /> Draw
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`ops-tab min-h-[44px] flex-1 justify-center ${mode === 'upload' ? 'ops-tab-active' : ''}`}
        >
          <Upload size={13} className="inline mr-1" /> Upload photo
        </button>
      </div>

      {mode === 'draw' ? (
        <>
          <div className="bg-white relative">
            <SignatureCanvas
              ref={sigRef}
              penColor="#0A2540"
              canvasProps={{ className: 'w-full h-48 touch-none', style: { touchAction: 'none', display: 'block' } }}
            />
            <p className="absolute bottom-2 left-0 right-0 text-center ops-meta pointer-events-none select-none">
              Sign above
            </p>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t border-rule bg-zebra">
            <button type="button" onClick={() => sigRef.current?.clear()} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors min-h-[44px]">
              <RotateCcw size={12} /> Clear
            </button>
            <button
              type="button"
              onClick={handleDrawDone}
              className="btn-primary"
            >
              <Check size={12} /> Done
            </button>
          </div>
        </>
      ) : (
        <div className="bg-white p-4">
          <label className={`flex flex-col items-center justify-center gap-2 w-full py-8 border-2 border-dashed border-rule rounded-md cursor-pointer hover:border-accent/50 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Upload size={22} className="text-muted" />
            <span className="text-sm font-medium text-muted">
              {uploading ? 'Processing...' : 'Tap to upload signature photo'}
            </span>
            <span className="ops-meta">JPG, PNG, or any image format</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading}
              className="sr-only"
            />
          </label>
        </div>
      )}
    </div>
  );
}

export function QuestionRenderer({
  question, value, onChange, inspectionId, instanceId,
  photos = [], onPhotoAdded, onPhotoRemoved
}: Props) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [sigSaved, setSigSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sliderVal, setSliderVal] = useState(Number(value) || 50);

  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const result = await uploadInspectionPhoto(
        inspectionId,
        question.id,
        file,
        { instanceId, caption: undefined }
      );
      const { data: signedData } = await supabase.storage
        .from('photos')
        .createSignedUrl(result.storagePath, 60 * 60 * 24 * 7);
      onPhotoAdded?.({
        id: result.photoId,
        storage_path: result.storagePath,
        url: signedData?.signedUrl ?? result.publicUrl,
      });
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  }, [inspectionId, question.id, instanceId, onPhotoAdded]);

  async function handleSignatureDone() {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    const dataUrl = sigRef.current.toDataURL('image/png');
    onChange(dataUrl);
    setSigSaved(true);
  }

  function clearSignature() {
    sigRef.current?.clear();
    onChange(null);
    setSigSaved(false);
  }

  const baseInput = "ops-field";

  function withOptionalNa(inner: React.ReactNode) {
    if (!question.allowNa) return inner;
    const na = isNaAnswer(value);
    return (
      <div className="space-y-2">
        {!na && inner}
        <button
          type="button"
          onClick={() => onChange(na ? null : NA_ANSWER)}
          className={`w-full min-h-[44px] py-2.5 rounded-md text-sm font-semibold border transition-all ${
            na
              ? 'bg-muted text-white border-muted'
              : 'border-rule text-muted hover:border-muted bg-white'
          }`}
        >
          {na ? 'N/A selected — tap to clear' : 'Mark N/A'}
        </button>
      </div>
    );
  }

  switch (question.type) {
    case 'text':
      return withOptionalNa(
        <input
          type="text"
          value={isNaAnswer(value) ? '' : String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
          placeholder="Enter answer..."
          autoComplete="off"
        />
      );

    case 'long_text':
      return withOptionalNa(
        <textarea
          value={isNaAnswer(value) ? '' : String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          rows={4}
          className={`${baseInput} resize-y`}
          placeholder="Enter notes..."
        />
      );

    case 'number': {
      const status = evaluateNumericStatus(value, question.numberConfig);
      const showStatus = question.numberConfig?.failOutsideRange && (status === 'pass' || status === 'fail');
      return withOptionalNa(
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9.]*"
              value={isNaAnswer(value) ? '' : String(value ?? '')}
              onChange={e => onChange(e.target.value)}
              className={`${baseInput} flex-1 ${
                showStatus && status === 'fail' ? 'border-fail focus:ring-fail'
                  : showStatus && status === 'pass' ? 'border-pass focus:ring-pass'
                    : ''
              }`}
              placeholder="0"
            />
            {question.numberConfig?.unit && (
              <span className="text-sm text-muted font-mono shrink-0">{question.numberConfig.unit}</span>
            )}
            {showStatus && (
              <span className={`ops-status ${status === 'pass' ? 'ops-status-ok' : 'ops-status-bad'}`}>
                {status === 'pass' ? 'PASS' : 'FAIL'}
              </span>
            )}
          </div>
          {(question.numberConfig?.min != null || question.numberConfig?.max != null) && (
            <p className="ops-meta">
              Allowable
              {question.numberConfig.min != null ? ` ≥ ${question.numberConfig.min}` : ''}
              {question.numberConfig.min != null && question.numberConfig.max != null ? ' and' : ''}
              {question.numberConfig.max != null ? ` ≤ ${question.numberConfig.max}` : ''}
              {question.numberConfig.unit ? ` ${question.numberConfig.unit}` : ''}
            </p>
          )}
        </div>
      );
    }

    case 'yes_no': {
      const isPassFail = question.yesNoLabels === 'pass_fail';
      return (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange('yes')}
            className={`flex-1 h-14 rounded-md font-semibold text-base border-2 ${
              value === 'yes'
                ? 'bg-pass text-white border-pass'
                : 'border-rule text-muted hover:border-pass/40 bg-white'
            }`}
          >
            {isPassFail ? 'PASS' : 'YES'}
          </button>
          <button
            type="button"
            onClick={() => onChange('no')}
            className={`flex-1 h-14 rounded-md font-semibold text-base border-2 ${
              value === 'no'
                ? 'bg-fail text-white border-fail'
                : 'border-rule text-muted hover:border-fail/40 bg-white'
            }`}
          >
            {isPassFail ? 'FAIL' : 'NO'}
          </button>
          <button
            type="button"
            onClick={() => onChange('n/a')}
            className={`flex-1 h-14 rounded-md font-semibold text-base border-2 ${
              value === 'n/a'
                ? 'bg-muted text-white border-muted'
                : 'border-rule text-muted hover:border-muted/40 bg-white'
            }`}
          >
            N/A
          </button>
        </div>
      );
    }

    case 'multiple_choice':
      return withOptionalNa(
        <div className="space-y-2">
          {(question.options ?? []).map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`w-full min-h-[44px] px-4 py-3 rounded-md text-left font-medium text-base border-2 ${
                value === opt
                  ? 'bg-accent text-white border-accent'
                  : 'border-rule text-navy hover:border-accent/40 bg-white'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      );

    case 'checkboxes': {
      const checked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-2">
          {(question.options ?? []).map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                const newChecked = checked.includes(opt)
                  ? checked.filter(v => v !== opt)
                  : [...checked, opt];
                onChange(newChecked);
              }}
              className={`w-full min-h-[44px] px-4 py-3 rounded-md text-left font-medium text-base border-2 ${
                checked.includes(opt)
                  ? 'bg-accent text-white border-accent'
                  : 'border-rule text-navy hover:border-accent/40 bg-white'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      );
    }

    case 'date':
      return withOptionalNa(
        <input
          type="date"
          value={isNaAnswer(value) ? '' : String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
        />
      );

    case 'photo':
      return (
        <div>
          <label className={`flex items-center gap-2 justify-center w-full min-h-[44px] py-3.5 border border-dashed border-rule rounded-md cursor-pointer hover:border-accent/40 transition-colors ${uploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Camera size={20} className="text-muted" />
            <span className="text-sm font-medium text-muted">
              {uploadingPhoto ? 'Uploading...' : 'Tap to capture photo'}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              disabled={uploadingPhoto}
              className="sr-only"
            />
          </label>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {photos.map((photo, i) => (
                <div key={i} className="relative aspect-square">
                  <img
                    src={photo.url}
                    alt={`Photo ${i + 1}`}
                    className="w-full h-full object-cover rounded-md border border-rule"
                  />
                  <button
                    type="button"
                    onClick={() => onPhotoRemoved?.(photo.storage_path)}
                    className="absolute top-1 right-1 w-8 h-8 bg-black/60 text-white rounded-md flex items-center justify-center"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );

    case 'signature': {
      // Value is stored as a base64 data URL string.
      // Legacy values may be { url: string } objects — normalise on read.
      const rawSig = value as string | { url?: string } | null;
      const sigDataUrl: string | null =
        typeof rawSig === 'string' ? rawSig
        : rawSig && typeof rawSig === 'object' && rawSig.url ? rawSig.url
        : null;

      const hasSig = !!sigDataUrl;

      return (
        <SignatureInput
          sigRef={sigRef}
          sigSaved={sigSaved}
          setSigSaved={setSigSaved}
          sigDataUrl={sigDataUrl}
          hasSig={hasSig}
          inspectionId={inspectionId}
          question={question}
          instanceId={instanceId}
          onChange={onChange}
          clearSignature={clearSignature}
        />
      );
    }

    case 'rating_5': {
      const rating = Number(value) || 0;
      return withOptionalNa(
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="w-12 h-12 flex items-center justify-center rounded-md transition-all"
            >
              <Star
                size={28}
                className={n <= rating ? 'text-warning fill-warning' : 'text-rule'}
              />
            </button>
          ))}
        </div>
      );
    }

    case 'slider': {
      if (isNaAnswer(value)) {
        return withOptionalNa(null);
      }
      const val = Number(value) || sliderVal;
      const min = question.numberConfig?.min ?? 0;
      const max = question.numberConfig?.max ?? 100;
      return withOptionalNa(
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">{min}</span>
            <span className="text-lg font-semibold font-mono text-navy">{val}{question.numberConfig?.unit ? ` ${question.numberConfig.unit}` : ''}</span>
            <span className="text-sm text-muted">{max}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            value={val}
            onChange={e => { setSliderVal(Number(e.target.value)); onChange(Number(e.target.value)); }}
            className="w-full h-2 accent-accent"
          />
        </div>
      );
    }

    default:
      return <div className="ops-meta">Unsupported question type: {question.type}</div>;
  }
}
