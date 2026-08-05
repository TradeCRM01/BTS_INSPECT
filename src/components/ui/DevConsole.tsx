import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, RotateCw, Trash2, ChevronDown, Download, RefreshCw, WifiOff, Wifi } from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
}

interface DevConsoleProps {
  onRefetchQueries: () => Promise<void>;
  onClose: () => void;
}

export function DevConsole({ onRefetchQueries, onClose }: DevConsoleProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [working, setWorking] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    const addLog = (level: LogEntry['level'], args: unknown[]) => {
      const message = args.map(a => {
        if (a instanceof Error) return `${a.message}\n${a.stack ?? ''}`;
        if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
        return String(a);
      }).join(' ');
      setLogs(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
      }].slice(-100));
    };

    console.log = (...args) => { originalLog(...args); addLog('log', args); };
    console.error = (...args) => { originalError(...args); addLog('error', args); };
    console.warn = (...args) => { originalWarn(...args); addLog('warn', args); };
    console.info = (...args) => { originalInfo(...args); addLog('info', args); };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const run = useCallback(async (label: string, fn: () => Promise<void> | void) => {
    setWorking(label);
    try { await fn(); } catch (e) { console.error(`${label} failed:`, e); }
    finally { setWorking(null); }
  }, []);

  const handleHardReload = () => {
    run('Reloading', async () => {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      window.location.reload();
    });
  };

  const handleRefetchData = () => {
    run('Refreshing data', async () => {
      await onRefetchQueries();
      console.info('All data refreshed');
    });
  };

  const handleClearStorage = () => {
    run('Clearing storage', async () => {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      console.info('Storage cleared - reloading...');
      setTimeout(() => window.location.reload(), 500);
    });
  };

  const exportLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] ${l.level.toUpperCase()}: ${l.message}`).join('\n');
    const a = document.createElement('a');
    a.href = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
    a.download = `logs-${Date.now()}.txt`;
    a.click();
  };

  const levelBg: Record<LogEntry['level'], string> = {
    error: 'text-red-400',
    warn: 'text-yellow-400',
    info: 'text-blue-400',
    log: 'text-gray-300',
  };

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-20 right-3 bg-[#0A2540] text-white px-3 py-2 rounded-lg text-xs font-medium shadow-lg z-[9999]"
      >
        Dev ({logs.filter(l => l.level === 'error').length} err)
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] flex flex-col shadow-2xl"
      style={{ maxHeight: '60vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0A2540] text-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Dev Console</span>
          <span className={`flex items-center gap-1 text-xs ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
            {isOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={exportLogs} className="p-1.5 hover:bg-white/10 rounded text-xs" title="Export logs">
            <Download size={13} />
          </button>
          <button onClick={() => setLogs([])} className="p-1.5 hover:bg-white/10 rounded" title="Clear logs">
            <Trash2 size={13} />
          </button>
          <button onClick={() => setIsMinimized(true)} className="p-1.5 hover:bg-white/10 rounded" title="Minimize">
            <ChevronDown size={13} />
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded" title="Close">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-3 py-2 bg-[#0d2f4e] shrink-0">
        <button
          onClick={handleRefetchData}
          disabled={!!working}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-md transition-colors font-medium"
        >
          <RotateCw size={12} className={working === 'Refreshing data' ? 'animate-spin' : ''} />
          {working === 'Refreshing data' ? 'Refreshing...' : 'Refresh data'}
        </button>
        <button
          onClick={handleHardReload}
          disabled={!!working}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-md transition-colors font-medium"
        >
          <RefreshCw size={12} className={working === 'Reloading' ? 'animate-spin' : ''} />
          {working === 'Reloading' ? 'Reloading...' : 'Hard reload'}
        </button>
        <button
          onClick={handleClearStorage}
          disabled={!!working}
          className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/40 disabled:opacity-50 text-red-300 text-xs px-3 py-1.5 rounded-md transition-colors font-medium"
        >
          <Trash2 size={12} />
          Clear &amp; reload
        </button>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto bg-gray-950 font-mono text-xs min-h-0">
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">No logs yet — actions and errors will appear here</div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="flex gap-2 px-3 py-1 border-b border-gray-800/50 hover:bg-gray-900">
              <span className="text-gray-600 shrink-0 tabular-nums">{log.timestamp}</span>
              <span className={`shrink-0 font-bold w-10 ${levelBg[log.level]}`}>{log.level.slice(0, 4).toUpperCase()}</span>
              <span className="text-gray-300 break-all whitespace-pre-wrap">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
