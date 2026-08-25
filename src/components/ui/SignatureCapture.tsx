import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Check, PenLine, Type, Bookmark, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  SIGNATURE_FONTS,
  renderTypedSignature,
  signatureFontFamily,
  type SignatureFontId,
} from '../../lib/typedSignature';

type Mode = 'type' | 'draw' | 'saved';

interface SignatureCaptureProps {
  value?: string;
  nameHint?: string;
  onChange: (signatureDataUrl: string) => void;
  onClear?: () => void;
  heightClass?: string;
}

export function SignatureCapture({
  value,
  nameHint = '',
  onChange,
  onClear,
  heightClass = 'h-32',
}: SignatureCaptureProps) {
  const { profile, refreshProfile } = useAuth();
  const savedSignature = (profile as { saved_signature?: string | null } | null)?.saved_signature ?? null;

  const [mode, setMode] = useState<Mode>(savedSignature ? 'saved' : 'type');
  const [typedName, setTypedName] = useState(nameHint);
  const [fontId, setFontId] = useState<SignatureFontId>('dancing');
  const [busy, setBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const sigRef = useRef<SignatureCanvas | null>(null);

  useEffect(() => {
    if (nameHint && !typedName) setTypedName(nameHint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameHint]);

  async function applyTyped() {
    setBusy(true);
    setMsg('');
    try {
      const dataUrl = await renderTypedSignature({ name: typedName || nameHint, fontId });
      onChange(dataUrl);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not create typed signature');
    } finally {
      setBusy(false);
    }
  }

  function applyDraw() {
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) {
      setMsg('Draw your signature first');
      return;
    }
    setMsg('');
    onChange(pad.toDataURL('image/png'));
  }

  function applySaved() {
    if (!savedSignature) {
      setMsg('No saved signature yet — type or draw one, then save it');
      return;
    }
    setMsg('');
    onChange(savedSignature);
  }

  async function saveCurrentToProfile() {
    if (!profile?.id) return;
    const dataUrl = value || (mode === 'draw' && sigRef.current && !sigRef.current.isEmpty()
      ? sigRef.current.toDataURL('image/png')
      : '');
    if (!dataUrl) {
      setMsg('Create a signature first, then save it to your profile');
      return;
    }
    setSaveBusy(true);
    setMsg('');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ saved_signature: dataUrl })
        .eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      if (!value) onChange(dataUrl);
      setMsg('Saved to your profile');
      setTimeout(() => setMsg(''), 2500);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save signature');
    } finally {
      setSaveBusy(false);
    }
  }

  function clearAll() {
    sigRef.current?.clear();
    onClear?.();
    if (value) onChange('');
    setMsg('');
  }

  const tabs: { id: Mode; label: string; icon: typeof Type }[] = [
    { id: 'type', label: 'Type', icon: Type },
    { id: 'draw', label: 'Draw', icon: PenLine },
    { id: 'saved', label: 'Saved', icon: Bookmark },
  ];

  return (
    <div className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-white">
      <div className="flex border-b border-[#E5E7EB] bg-[#F9FAFB]">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = mode === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setMode(t.id); setMsg(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors ${
                active ? 'bg-white text-[#0A2540] border-b-2 border-[#2E75B6]' : 'text-[#6B7280] hover:text-[#1A1A1A]'
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="p-3 space-y-3">
        {mode === 'type' && (
          <>
            <input
              type="text"
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
              placeholder="Type your full name"
              className="w-full min-h-[44px] text-sm border border-[#E5E7EB] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
            />
            <div className="flex flex-wrap gap-1.5">
              {SIGNATURE_FONTS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFontId(f.id)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    fontId === f.id
                      ? 'border-[#2E75B6] bg-[#EFF6FF] text-[#1e40af]'
                      : 'border-[#E5E7EB] text-[#4A5568] hover:border-[#BFDBFE]'
                  }`}
                  style={{ fontFamily: f.family, fontSize: 14 }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div
              className={`w-full ${heightClass} border border-dashed border-[#D1D5DB] rounded-md flex items-center justify-center bg-[#FAFAFA] px-4`}
              style={{ fontFamily: signatureFontFamily(fontId), fontSize: 36, color: '#0A2540' }}
            >
              {(typedName || nameHint || 'Your signature').trim() || 'Your signature'}
            </div>
            <button
              type="button"
              onClick={() => void applyTyped()}
              disabled={busy || !(typedName || nameHint).trim()}
              className="w-full text-sm font-medium bg-[#0A2540] text-white py-2 rounded-md hover:bg-[#0d2f4e] disabled:opacity-50"
            >
              {busy ? <span className="inline-flex items-center gap-1.5 justify-center"><Loader2 size={14} className="animate-spin" /> Applying…</span> : 'Use typed signature'}
            </button>
          </>
        )}

        {mode === 'draw' && (
          <>
            <div className={`border border-[#E5E7EB] rounded-md overflow-hidden bg-white ${heightClass}`}>
              <SignatureCanvas
                ref={sigRef}
                canvasProps={{ className: 'w-full h-full', style: { touchAction: 'none', width: '100%', height: '100%' } }}
                backgroundColor="#ffffff"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => sigRef.current?.clear()} className="flex-1 text-xs border border-[#E5E7EB] py-2 rounded-md text-[#4A5568] hover:bg-[#F9FAFB]">
                Clear pad
              </button>
              <button type="button" onClick={applyDraw} className="flex-1 text-xs font-medium bg-[#0A2540] text-white py-2 rounded-md hover:bg-[#0d2f4e]">
                Use drawing
              </button>
            </div>
          </>
        )}

        {mode === 'saved' && (
          <>
            {savedSignature ? (
              <div className={`w-full ${heightClass} border border-[#E5E7EB] rounded-md flex items-center justify-center bg-white p-2`}>
                <img src={savedSignature} alt="Saved signature" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <div className={`w-full ${heightClass} border border-dashed border-[#D1D5DB] rounded-md flex items-center justify-center text-xs text-[#6B7280] px-4 text-center`}>
                No signature saved on your profile yet. Type or draw one, then tap “Save to my profile”.
              </div>
            )}
            <button
              type="button"
              onClick={applySaved}
              disabled={!savedSignature}
              className="w-full text-sm font-medium bg-[#0A2540] text-white py-2 rounded-md hover:bg-[#0d2f4e] disabled:opacity-50"
            >
              Use my saved signature
            </button>
          </>
        )}

        {value && (
          <div className="border border-[#DCFCE7] bg-[#F0FDF4] rounded-md p-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-medium text-[#166534] inline-flex items-center gap-1">
                <Check size={12} /> Applied signature
              </span>
              <button type="button" onClick={clearAll} className="text-[11px] text-[#6B7280] hover:text-red-600 inline-flex items-center gap-0.5">
                <X size={11} /> Clear
              </button>
            </div>
            <img src={value} alt="Current signature" className="h-14 max-w-full object-contain mx-auto" />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#F3F4F6]">
          <button
            type="button"
            onClick={() => void saveCurrentToProfile()}
            disabled={saveBusy || !profile}
            className="text-xs text-[#2E75B6] hover:underline disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Bookmark size={12} />
            {saveBusy ? 'Saving…' : 'Save to my profile'}
          </button>
          {msg && <span className="text-[11px] text-[#4A5568]">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
