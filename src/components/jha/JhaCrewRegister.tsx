import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import SignatureCanvas from 'react-signature-canvas';
import { CheckCircle, Plus, Trash2, Users, Send, Smartphone, Link2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { nanoid } from '../../lib/nanoid';
import type { JhaCrewMember } from '../../types/jha';

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Props = {
  companyId: string;
  documentId: string | null;
  crew: JhaCrewMember[];
  onChange: (crew: JhaCrewMember[]) => void;
  currentUserId?: string;
};

export function JhaCrewRegister({ companyId, documentId, crew, onChange, currentUserId }: Props) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [notifyBusy, setNotifyBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const sigRef = useRef<SignatureCanvas>(null);

  const { data: members = [] } = useQuery({
    queryKey: ['company-members-jha', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_company_members', { p_company_id: companyId });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
    enabled: !!companyId,
  });

  function addBlank() {
    onChange([
      ...crew,
      {
        id: nanoid(),
        name: '',
        role: 'Worker',
        date: format(new Date(), 'yyyy-MM-dd'),
        signMode: 'on_device',
      },
    ]);
  }

  function addMember(m: Member) {
    if (crew.some(c => c.profileId === m.id)) {
      setMsg(`${m.name} is already on the crew`);
      return;
    }
    onChange([
      ...crew,
      {
        id: nanoid(),
        name: m.name || m.email,
        role: m.role === 'admin' ? 'Supervisor' : 'Worker',
        date: format(new Date(), 'yyyy-MM-dd'),
        profileId: m.id,
        email: m.email,
        signMode: m.id === currentUserId ? 'on_device' : 'remote',
      },
    ]);
    setPickerOpen(false);
    setMsg('');
  }

  function update(idx: number, patch: Partial<JhaCrewMember>) {
    onChange(crew.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function remove(idx: number) {
    onChange(crew.filter((_, i) => i !== idx));
  }

  function saveOnDeviceSignature(memberId: string) {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setMsg('Draw a signature first');
      return;
    }
    const dataUrl = sigRef.current.toDataURL('image/png');
    onChange(crew.map(c =>
      c.id === memberId
        ? { ...c, signature: dataUrl, signedAt: new Date().toISOString(), signMode: 'on_device' }
        : c,
    ));
    setSigningId(null);
    setMsg('Signed on this device');
  }

  async function notifyRemote(member: JhaCrewMember) {
    if (!documentId) {
      setMsg('Save the JHA first, then notify workers');
      return;
    }
    if (!member.profileId && !member.email) {
      setMsg('Select a company worker (or add an email) to notify');
      return;
    }
    setNotifyBusy(member.id);
    setMsg('');
    try {
      const appUrl = window.location.origin;
      const signUrl = `${appUrl}/jha/crew-sign?docId=${documentId}&crewId=${member.id}`;
      const { data, error } = await supabase.functions.invoke('notify-jha-sign', {
        body: {
          jhaDocumentId: documentId,
          crewMemberId: member.id,
          toEmail: member.email,
          toName: member.name,
          profileId: member.profileId,
          signUrl,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      onChange(crew.map(c =>
        c.id === member.id
          ? { ...c, signMode: 'remote', notifiedAt: new Date().toISOString() }
          : c,
      ));
      setMsg(data?.emailed
        ? `Notification emailed to ${member.email || member.name}`
        : `Remote sign link ready — share: ${signUrl}`);
      // Always copy link as fallback
      try { await navigator.clipboard.writeText(signUrl); } catch { /* ignore */ }
      queryClient.invalidateQueries({ queryKey: ['jha-document', documentId] });
    } catch (err) {
      const signUrl = `${window.location.origin}/jha/crew-sign?docId=${documentId}&crewId=${member.id}`;
      try { await navigator.clipboard.writeText(signUrl); } catch { /* ignore */ }
      setMsg(
        `Email not sent (${err instanceof Error ? err.message : 'error'}). Sign link copied — share it with ${member.name}.`,
      );
      onChange(crew.map(c =>
        c.id === member.id ? { ...c, signMode: 'remote', notifiedAt: new Date().toISOString() } : c,
      ));
    } finally {
      setNotifyBusy(null);
    }
  }

  const available = members.filter(m => !crew.some(c => c.profileId === m.id));

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-[#4A5568]" />
          <h2 className="text-sm font-medium text-[#1A1A1A]">Crew sign-on register</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            className="text-xs text-[#2E75B6] hover:underline flex items-center gap-1"
          >
            <Users size={12} /> Add from team
          </button>
          <button
            type="button"
            onClick={addBlank}
            className="text-xs text-[#2E75B6] hover:underline flex items-center gap-1"
          >
            <Plus size={12} /> Add external person
          </button>
        </div>
      </div>
      <p className="text-xs text-[#6B7280] mb-3">
        Pick company workers or add visitors. Sign on this device, or notify a teammate to open and sign on their own login.
      </p>

      {pickerOpen && (
        <div className="mb-3 border border-[#E5E7EB] rounded-lg p-2 max-h-40 overflow-y-auto bg-[#F9FAFB]">
          {available.length === 0 ? (
            <p className="text-xs text-[#9CA3AF] p-2">All team members are already listed.</p>
          ) : (
            available.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => addMember(m)}
                className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-white flex justify-between gap-2"
              >
                <span>{m.name || m.email}</span>
                <span className="text-xs text-[#9CA3AF]">{m.email}</span>
              </button>
            ))
          )}
        </div>
      )}

      {msg && <p className="text-xs text-[#2E75B6] mb-2">{msg}</p>}

      {crew.length === 0 && (
        <p className="text-sm text-[#9CA3AF] text-center py-4 border border-dashed border-[#E5E7EB] rounded-lg">
          No crew listed yet — add workers who will perform this job.
        </p>
      )}

      <div className="space-y-3">
        {crew.map((member, idx) => (
          <div key={member.id} className="border border-[#E5E7EB] rounded-lg p-3 space-y-2 bg-[#FAFAFA]">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-4">
                <label className="text-[10px] text-[#6B7280]">Name</label>
                <input
                  value={member.name}
                  onChange={e => update(idx, { name: e.target.value })}
                  className="form-input-sm w-full"
                  placeholder="Full name"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="text-[10px] text-[#6B7280]">Role</label>
                <input
                  value={member.role}
                  onChange={e => update(idx, { role: e.target.value })}
                  className="form-input-sm w-full"
                  placeholder="e.g. Electrician"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-[#6B7280]">Date</label>
                <input
                  type="date"
                  value={member.date}
                  onChange={e => update(idx, { date: e.target.value })}
                  className="form-input-sm w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-[#6B7280]">Sign how</label>
                <select
                  value={member.signMode || 'on_device'}
                  onChange={e => update(idx, { signMode: e.target.value as 'on_device' | 'remote' })}
                  className="form-input-sm w-full"
                >
                  <option value="on_device">This device</option>
                  <option value="remote">Their login</option>
                </select>
              </div>
              <div className="sm:col-span-1 flex justify-end pb-1">
                <button type="button" onClick={() => remove(idx)} className="text-[#9CA3AF] hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {member.signature ? (
                <span className="inline-flex items-center gap-1 text-[#1B7F3A]">
                  <CheckCircle size={12} />
                  Signed {member.signedAt ? format(new Date(member.signedAt), 'd MMM HH:mm') : ''}
                </span>
              ) : (
                <span className="text-[#B45309]">Awaiting signature</span>
              )}
              {member.profileId && (
                <span className="text-[#9CA3AF]">Team member</span>
              )}
              {member.notifiedAt && !member.signature && (
                <span className="text-[#6B7280]">Notified {format(new Date(member.notifiedAt), 'd MMM HH:mm')}</span>
              )}
              {!member.signature && (member.signMode || 'on_device') === 'on_device' && (
                <button
                  type="button"
                  onClick={() => setSigningId(signingId === member.id ? null : member.id)}
                  className="inline-flex items-center gap-1 text-[#2E75B6] hover:underline"
                >
                  <Smartphone size={12} /> Sign on this device
                </button>
              )}
              {!member.signature && (
                <button
                  type="button"
                  disabled={!!notifyBusy}
                  onClick={() => void notifyRemote(member)}
                  className="inline-flex items-center gap-1 text-[#2E75B6] hover:underline disabled:opacity-50"
                >
                  <Send size={12} /> {notifyBusy === member.id ? 'Sending…' : 'Notify / copy link'}
                </button>
              )}
              {documentId && (
                <button
                  type="button"
                  onClick={async () => {
                    const url = `${window.location.origin}/jha/crew-sign?docId=${documentId}&crewId=${member.id}`;
                    try { await navigator.clipboard.writeText(url); setMsg('Sign link copied'); } catch { setMsg(url); }
                  }}
                  className="inline-flex items-center gap-1 text-[#6B7280] hover:underline"
                >
                  <Link2 size={12} /> Copy sign link
                </button>
              )}
            </div>

            {signingId === member.id && (
              <div className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-white">
                <SignatureCanvas ref={sigRef} canvasProps={{ className: 'w-full h-28' }} backgroundColor="#fff" />
                <div className="flex gap-2 p-2 border-t border-[#E5E7EB]">
                  <button type="button" className="text-xs text-[#6B7280]" onClick={() => sigRef.current?.clear()}>Clear</button>
                  <button
                    type="button"
                    className="text-xs text-white bg-[#0A2540] px-3 py-1 rounded"
                    onClick={() => saveOnDeviceSignature(member.id)}
                  >
                    Save signature
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
