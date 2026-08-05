import { useRef, useState, useCallback } from 'react';
import type { Question } from '../../types/template';
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
      <div className="border border-[#E5E7EB] rounded-md overflow-hidden">
        <img src={displayImage} alt="Signature" className="w-full h-32 object-contain bg-white p-2" />
        <div className="flex items-center justify-between px-3 py-2 border-t border-[#E5E7EB] bg-[#F9FAFB]">
          <span className="text-xs text-[#1B7F3A] flex items-center gap-1">
            <Check size={12} /> Signature captured
          </span>
          <button type="button" onClick={handleClear} className="text-xs text-[#4A5568] hover:text-[#B42318] transition-colors">
            Clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[#E5E7EB] rounded-md overflow-hidden">
      {/* Mode tabs */}
      <div className="flex border-b border-[#E5E7EB] bg-[#F9FAFB]">
        <button
          type="button"
          onClick={() => setMode('draw')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors flex-1 justify-center border-b-2 ${
            mode === 'draw'
              ? 'border-[#0A2540] text-[#0A2540] bg-white'
              : 'border-transparent text-[#4A5568] hover:text-[#1A1A1A]'
          }`}
        >
          <PenLine size={13} /> Draw
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors flex-1 justify-center border-b-2 ${
            mode === 'upload'
              ? 'border-[#0A2540] text-[#0A2540] bg-white'
              : 'border-transparent text-[#4A5568] hover:text-[#1A1A1A]'
          }`}
        >
          <Upload size={13} /> Upload photo
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
            <p className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-[#C0C9D4] pointer-events-none select-none">
              Sign above
            </p>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t border-[#E5E7EB] bg-[#F9FAFB]">
            <button type="button" onClick={() => sigRef.current?.clear()} className="flex items-center gap-1.5 text-xs text-[#4A5568] hover:text-[#1A1A1A] transition-colors">
              <RotateCcw size={12} /> Clear
            </button>
            <button
              type="button"
              onClick={handleDrawDone}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#0A2540] px-3 py-1.5 rounded hover:bg-[#0d2f4e] transition-colors"
            >
              <Check size={12} /> Done
            </button>
          </div>
        </>
      ) : (
        <div className="bg-white p-4">
          <label className={`flex flex-col items-center justify-center gap-2 w-full py-8 border-2 border-dashed border-[#E5E7EB] rounded-md cursor-pointer hover:border-[#2E75B6]/50 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Upload size={22} className="text-[#4A5568]" />
            <span className="text-sm font-medium text-[#4A5568]">
              {uploading ? 'Processing...' : 'Tap to upload signature photo'}
            </span>
            <span className="text-xs text-[#9CA3AF]">JPG, PNG, or any image format</span>
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

  const baseInput = "w-full px-3 py-3 border border-[#E5E7EB] rounded-md text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent bg-white";

  switch (question.type) {
    case 'text':
      return (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
          placeholder="Enter answer..."
          autoComplete="off"
        />
      );

    case 'long_text':
      return (
        <textarea
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          rows={4}
          className={`${baseInput} resize-y`}
          placeholder="Enter notes..."
        />
      );

    case 'number':
      return (
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.]*"
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value)}
            className={`${baseInput} flex-1`}
            placeholder="0"
          />
          {question.numberConfig?.unit && (
            <span className="text-sm text-[#4A5568] font-mono shrink-0">{question.numberConfig.unit}</span>
          )}
        </div>
      );

    case 'yes_no': {
      const isPassFail = question.yesNoLabels === 'pass_fail';
      return (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange('yes')}
            className={`flex-1 h-14 rounded-md font-semibold text-base transition-all ${
              value === 'yes'
                ? 'bg-[#1B7F3A] text-white border-2 border-[#1B7F3A]'
                : 'border-2 border-[#E5E7EB] text-[#4A5568] hover:border-[#1B7F3A]/40 bg-white'
            }`}
          >
            {isPassFail ? 'PASS' : 'YES'}
          </button>
          <button
            type="button"
            onClick={() => onChange('no')}
            className={`flex-1 h-14 rounded-md font-semibold text-base transition-all ${
              value === 'no'
                ? 'bg-[#B42318] text-white border-2 border-[#B42318]'
                : 'border-2 border-[#E5E7EB] text-[#4A5568] hover:border-[#B42318]/40 bg-white'
            }`}
          >
            {isPassFail ? 'FAIL' : 'NO'}
          </button>
          <button
            type="button"
            onClick={() => onChange('n/a')}
            className={`flex-1 h-14 rounded-md font-semibold text-base transition-all ${
              value === 'n/a'
                ? 'bg-[#4A5568] text-white border-2 border-[#4A5568]'
                : 'border-2 border-[#E5E7EB] text-[#4A5568] hover:border-[#4A5568]/40 bg-white'
            }`}
          >
            N/A
          </button>
        </div>
      );
    }

    case 'multiple_choice':
      return (
        <div className="space-y-2">
          {(question.options ?? []).map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`w-full px-4 py-3 rounded-md text-left font-medium transition-all text-base ${
                value === opt
                  ? 'bg-[#2E75B6] text-white border-2 border-[#2E75B6]'
                  : 'border-2 border-[#E5E7EB] text-[#1A1A1A] hover:border-[#2E75B6]/40 bg-white'
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
              className={`w-full px-4 py-3 rounded-md text-left font-medium transition-all text-base ${
                checked.includes(opt)
                  ? 'bg-[#2E75B6] text-white border-2 border-[#2E75B6]'
                  : 'border-2 border-[#E5E7EB] text-[#1A1A1A] hover:border-[#2E75B6]/40 bg-white'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      );
    }

    case 'date':
      return (
        <input
          type="date"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
        />
      );

    case 'photo':
      return (
        <div>
          <label className={`flex items-center gap-2 justify-center w-full py-3.5 border-2 border-dashed border-[#E5E7EB] rounded-md cursor-pointer hover:border-[#2E75B6]/40 transition-colors ${uploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Camera size={20} className="text-[#4A5568]" />
            <span className="text-sm font-medium text-[#4A5568]">
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
                    className="w-full h-full object-cover rounded border border-[#E5E7EB]"
                  />
                  <button
                    type="button"
                    onClick={() => onPhotoRemoved?.(photo.storage_path)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center"
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
      return (
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
                className={n <= rating ? 'text-amber-400 fill-amber-400' : 'text-[#E5E7EB]'}
              />
            </button>
          ))}
        </div>
      );
    }

    case 'slider': {
      const val = Number(value) || sliderVal;
      const min = question.numberConfig?.min ?? 0;
      const max = question.numberConfig?.max ?? 100;
      return (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#4A5568]">{min}</span>
            <span className="text-lg font-semibold font-mono text-[#0A2540]">{val}{question.numberConfig?.unit ? ` ${question.numberConfig.unit}` : ''}</span>
            <span className="text-sm text-[#4A5568]">{max}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            value={val}
            onChange={e => { setSliderVal(Number(e.target.value)); onChange(Number(e.target.value)); }}
            className="w-full h-2 accent-[#2E75B6]"
          />
        </div>
      );
    }

    default:
      return <div className="text-sm text-[#4A5568]">Unsupported question type: {question.type}</div>;
  }
}
