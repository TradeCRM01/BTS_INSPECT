import { useState, useRef, useEffect, useCallback } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Send, Plus, Trash2, MessageSquare, Bot, User, ChevronLeft, AlertCircle, HelpCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Message { role: 'user' | 'assistant'; content: string; }
interface Session { id: string; title: string; created_at: string; updated_at: string; }

const EDGE_FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-console`;

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

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? 'bg-[#0A2540]' : 'bg-[#2E75B6]'}`}>
        {isUser ? <User size={15} className="text-white" /> : <Bot size={15} className="text-white" />}
      </div>
      <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words
        ${isUser ? 'bg-[#0A2540] text-white rounded-tr-sm' : 'bg-white border border-[#E5E7EB] text-[#1A1A1A] rounded-tl-sm shadow-sm'}`}>
        {msg.content}
      </div>
    </div>
  );
}

function TypingDots() {
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

const SUGGESTIONS = [
  'How do I create a new inspection template?',
  'How do I fill in an inspection on my phone?',
  'How do I generate and download a PDF report?',
  'How do I add a new team member?',
  'What are the different question types available?',
  'How does conditional logic work in templates?',
];

export function AiAssistantPage() {
  const { get, del, streamChat } = useEdgeFn();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentSessionRef = useRef<string | null>(null);

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

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-56px)] overflow-hidden bg-[#F9FAFB]">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 md:hidden bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={`flex flex-col bg-[#0A2540] text-white transition-all duration-200 shrink-0 fixed md:relative z-50 md:z-auto h-full md:h-auto md:w-64 ${sidebarOpen ? 'w-64' : 'w-0 md:w-64 overflow-hidden'}`}>
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
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="bg-white border-b border-[#E5E7EB] px-3 md:px-4 h-12 flex items-center gap-3 shrink-0">
            <button onClick={() => setSidebarOpen(o => !o)} className="p-1.5 rounded hover:bg-[#F3F4F6] text-[#6B7280] transition-colors md:hidden">
              <ChevronLeft size={18} className={`transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} />
            </button>
            <button onClick={() => setSidebarOpen(o => !o)} className="p-1.5 rounded hover:bg-[#F3F4F6] text-[#6B7280] transition-colors hidden md:block">
              <ChevronLeft size={16} className={`transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} />
            </button>
            <HelpCircle size={16} className="text-[#2E75B6]" />
            <h1 className="text-sm font-semibold text-[#1A1A1A]">AI Assistant</h1>
            <span className="text-xs bg-[#F0FDF4] text-[#16A34A] px-2 py-0.5 rounded-full font-medium">Help & guidance</span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 md:px-4 py-4 md:py-6">
            <div className="max-w-3xl mx-auto flex flex-col gap-4 md:gap-5">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 bg-[#EFF6FF] rounded-2xl flex items-center justify-center mb-4">
                    <HelpCircle size={28} className="text-[#2E75B6]" />
                  </div>
                  <h2 className="text-lg font-semibold text-[#1A1A1A] mb-1">How can I help you?</h2>
                  <p className="text-sm text-[#4A5568] max-w-md mb-8">Ask me anything about how to use BTS Inspect — templates, inspections, reports, and more.</p>
                  <div className="grid grid-cols-1 gap-2 w-full max-w-lg">
                    {SUGGESTIONS.map(s => (
                      <button key={s} onClick={() => sendMessage(s)}
                        className="text-left px-4 py-3 bg-white border border-[#E5E7EB] rounded-xl text-sm text-[#374151] hover:border-[#2E75B6] hover:bg-[#EFF6FF] transition-colors shadow-sm">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
              {streaming && messages[messages.length - 1]?.content === '' && <TypingDots />}
              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{error}</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="bg-white border-t border-[#E5E7EB] px-3 md:px-4 py-2 md:py-3 shrink-0">
            <div className="max-w-3xl mx-auto flex gap-2 md:gap-3 items-end">
              <div className="flex-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-3 md:px-4 py-2 md:py-2.5 focus-within:border-[#2E75B6] focus-within:bg-white transition-colors">
                <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="Ask a question… (Enter to send)"
                  rows={1} disabled={streaming}
                  className="w-full bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] resize-none outline-none leading-relaxed"
                  style={{ minHeight: '24px', maxHeight: '160px' }} />
              </div>
              <button onClick={() => sendMessage()} disabled={!input.trim() || streaming}
                className="w-9 md:w-10 h-9 md:h-10 rounded-xl bg-[#0A2540] text-white flex items-center justify-center hover:bg-[#0d2f4e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
                {streaming ? <LoadingSpinner size="sm" /> : <Send size={16} />}
              </button>
            </div>
            <p className="text-center text-xs text-[#9CA3AF] mt-2">Powered by Claude · For help using the app only</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
