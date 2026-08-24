import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import {
  Send, Plus, Trash2, MessageSquare, Bot, User,
  ChevronLeft, AlertCircle, Sparkles, Terminal, Database,
} from 'lucide-react';

interface Message { role: 'user' | 'assistant'; content: string; }
interface Session { id: string; title: string; created_at: string; updated_at: string; }

const EDGE_FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-console`;

// Parse tool-call markers injected by the edge function into the text stream
// Format: \n\n_[Calling tool: <name>...]_\n\n
const TOOL_MARKER_RE = /_\[Calling tool: ([^\]]+)\.\.\.\]_/g;

function renderMessageContent(content: string) {
  const segments: Array<{ type: 'text' | 'tool'; value: string }> = [];
  let last = 0;
  let match: RegExpExecArray | null;
  TOOL_MARKER_RE.lastIndex = 0;
  while ((match = TOOL_MARKER_RE.exec(content)) !== null) {
    if (match.index > last) segments.push({ type: 'text', value: content.slice(last, match.index).trim() });
    segments.push({ type: 'tool', value: match[1] });
    last = match.index + match[0].length;
  }
  if (last < content.length) {
    const tail = content.slice(last).trim();
    if (tail) segments.push({ type: 'text', value: tail });
  }
  return segments;
}

function ToolCallBadge({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg px-3 py-2 text-xs text-[#15803D] font-medium my-1">
      <Database size={12} className="text-[#16A34A] shrink-0" />
      <span>Called tool: <code className="font-mono">{name}</code></span>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const segments = isUser ? null : renderMessageContent(msg.content);

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? 'bg-[#0A2540]' : 'bg-[#2E75B6]'}`}>
        {isUser ? <User size={15} className="text-white" /> : <Bot size={15} className="text-white" />}
      </div>
      <div className={`max-w-[78%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words bg-[#0A2540] text-white">
            {msg.content}
          </div>
        ) : segments ? (
          segments.map((seg, i) =>
            seg.type === 'tool'
              ? <ToolCallBadge key={i} name={seg.value} />
              : seg.value
                ? <div key={i} className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words bg-white border border-[#E5E7EB] text-[#1A1A1A] shadow-sm">{seg.value}</div>
                : null
          )
        ) : (
          <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words bg-white border border-[#E5E7EB] text-[#1A1A1A] shadow-sm">
            {msg.content}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-[#2E75B6] flex items-center justify-center shrink-0">
        <Bot size={15} className="text-white" />
      </div>
      <div className="bg-white border border-[#E5E7EB] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          {[0,1,2].map(i => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function useEdgeFn() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const get = useCallback(async (path: string) => {
    const res = await fetch(`${EDGE_FN_BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }, [token]);

  const del = useCallback(async (path: string) => {
    const res = await fetch(`${EDGE_FN_BASE}/${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }, [token]);

  const streamChat = useCallback(async (
    messages: Message[],
    sessionId: string | null,
    onDelta: (text: string) => void,
  ) => {
    const res = await fetch(`${EDGE_FN_BASE}/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, sessionId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error ?? 'Request failed');
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const data = JSON.parse(raw);
          if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') onDelta(data.delta.text);
        } catch { /* ignore */ }
      }
    }
  }, [token]);

  return { get, del, streamChat };
}

const WELCOME_SUGGESTIONS = [
  'Run a query to show all active inspections for this company',
  'Check the database for any inspections in draft status older than 30 days',
  'Show me the current company settings',
  'List all team members and their roles',
  'How do I add a new question type to the template editor?',
  'Diagnose why PDFs might not be generating',
];

export function AiConsolePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { get, del, streamChat } = useEdgeFn();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (profile && profile.role !== 'admin') navigate('/', { replace: true });
  }, [profile, navigate]);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await get('sessions');
      setSessions(data.sessions ?? []);
    } catch { /* ignore */ } finally { setLoadingSessions(false); }
  }, [get]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const startNew = useCallback(() => {
    setActiveSessionId(null);
    currentSessionRef.current = null;
    setMessages([]);
    setError('');
    setInput('');
  }, []);

  const loadSession = useCallback(async (id: string) => {
    try {
      const data = await get(`sessions/${id}`);
      setActiveSessionId(id);
      currentSessionRef.current = id;
      setMessages(data.messages ?? []);
      setError('');
    } catch { setError('Failed to load conversation.'); }
  }, [get]);

  const deleteSession = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await del(`sessions/${id}`).catch(() => null);
    setSessions(s => s.filter(x => x.id !== id));
    if (activeSessionId === id) startNew();
  }, [del, activeSessionId, startNew]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || streaming) return;
    const userMsg: Message = { role: 'user', content: msg };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setError('');
    setStreaming(true);
    try {
      let assistantText = '';
      await streamChat(nextMessages, currentSessionRef.current, (delta) => {
        assistantText += delta;
        setMessages(m => {
          const updated = [...m];
          updated[updated.length - 1] = { role: 'assistant', content: assistantText };
          return updated;
        });
      });
      if (!currentSessionRef.current) {
        setTimeout(() => {
          loadSessions().then(async () => {
            const d = await get('sessions').catch(() => ({ sessions: [] }));
            const newest: Session = d.sessions?.[0];
            if (newest) { currentSessionRef.current = newest.id; setActiveSessionId(newest.id); }
          });
        }, 800);
      } else { loadSessions(); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setMessages(m => m.slice(0, -1));
    } finally { setStreaming(false); }
  }, [input, streaming, messages, streamChat, loadSessions, get]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }, [sendMessage]);

  if (profile && profile.role !== 'admin') return null;

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-56px)] overflow-hidden bg-[#F9FAFB]">
        {/* Sidebar */}
        <aside className={`flex flex-col bg-[#0A2540] text-white transition-all duration-200 shrink-0 ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
          <div className="p-3 border-b border-white/10">
            <button onClick={startNew} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#2E75B6] hover:bg-[#2563a8] rounded-lg text-sm font-medium transition-colors">
              <Plus size={15} /> New conversation
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {loadingSessions
              ? <div className="flex justify-center py-6"><LoadingSpinner /></div>
              : sessions.length === 0
                ? <p className="text-xs text-white/40 text-center py-6 px-4">No conversations yet</p>
                : sessions.map(s => (
                  <button key={s.id} onClick={() => loadSession(s.id)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors group ${activeSessionId === s.id ? 'bg-white/15' : 'hover:bg-white/8'}`}>
                    <MessageSquare size={13} className="text-white/50 mt-0.5 shrink-0" />
                    <span className="flex-1 text-xs text-white/80 truncate leading-relaxed">{s.title}</span>
                    <button onClick={(e) => deleteSession(s.id, e)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 transition-all shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </button>
                ))
            }
          </div>
          <div className="p-3 border-t border-white/10">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-6 h-6 rounded-full bg-[#2E75B6] flex items-center justify-center text-xs font-semibold shrink-0">
                {profile?.name?.charAt(0)?.toUpperCase() ?? 'A'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/90 truncate">{profile?.name}</p>
                <p className="text-[10px] text-white/40">Admin</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="bg-white border-b border-[#E5E7EB] px-4 h-12 flex items-center gap-3 shrink-0">
            <button onClick={() => setSidebarOpen(o => !o)} className="p-1.5 rounded hover:bg-[#F3F4F6] text-[#6B7280] transition-colors">
              <ChevronLeft size={16} className={`transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} />
            </button>
            <Terminal size={16} className="text-[#2E75B6]" />
            <h1 className="text-sm font-semibold text-[#1A1A1A]">AI Console</h1>
            <span className="text-xs bg-[#FEF3C7] text-[#92400E] px-2 py-0.5 rounded-full font-medium">Admin · Can modify data</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-3xl mx-auto flex flex-col gap-5">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 bg-[#FEF3C7] rounded-2xl flex items-center justify-center mb-4">
                    <Sparkles size={28} className="text-[#D97706]" />
                  </div>
                  <h2 className="text-lg font-semibold text-[#1A1A1A] mb-1">Admin AI Console</h2>
                  <p className="text-sm text-[#4A5568] max-w-md mb-2">
                    I can query the database, update records, diagnose issues, and help you make direct changes to the platform.
                  </p>
                  <p className="text-xs text-[#F59E0B] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2 mb-8 max-w-sm">
                    This console can modify live data. Review all actions carefully before confirming.
                  </p>
                  <div className="grid grid-cols-1 gap-2 w-full max-w-lg">
                    {WELCOME_SUGGESTIONS.map(s => (
                      <button key={s} onClick={() => sendMessage(s)}
                        className="text-left px-4 py-3 bg-white border border-[#E5E7EB] rounded-xl text-sm text-[#374151] hover:border-[#2E75B6] hover:bg-[#EFF6FF] transition-colors shadow-sm">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
              {streaming && messages[messages.length - 1]?.content === '' && <TypingIndicator />}
              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{error}</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="bg-white border-t border-[#E5E7EB] px-4 py-3 shrink-0">
            <div className="max-w-3xl mx-auto flex gap-3 items-end">
              <div className="flex-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-2.5 focus-within:border-[#2E75B6] focus-within:bg-white transition-colors">
                <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="Ask me to query data, fix issues, update records… (Enter to send)"
                  rows={1} disabled={streaming}
                  className="w-full bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] resize-none outline-none leading-relaxed"
                  style={{ minHeight: '44px', maxHeight: '160px' }} />
              </div>
              <button onClick={() => sendMessage()} disabled={!input.trim() || streaming}
                className="w-10 h-10 rounded-xl bg-[#0A2540] text-white flex items-center justify-center hover:bg-[#0d2f4e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
                {streaming ? <LoadingSpinner size="sm" /> : <Send size={16} />}
              </button>
            </div>
            <p className="text-center text-xs text-[#9CA3AF] mt-2">
              Powered by Claude · Admin console · Changes are applied directly to the database
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
