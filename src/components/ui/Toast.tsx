import { createContext, useCallback, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, X, Info } from 'lucide-react';
import type { ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const TOAST_STYLES: Record<ToastType, { bg: string; icon: typeof CheckCircle2; iconColor: string }> = {
  success: { bg: 'bg-white border-green-200', icon: CheckCircle2, iconColor: 'text-green-500' },
  error: { bg: 'bg-white border-red-200', icon: AlertCircle, iconColor: 'text-red-500' },
  info: { bg: 'bg-white border-blue-200', icon: Info, iconColor: 'text-blue-500' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end">
          {toasts.map(toast => {
            const s = TOAST_STYLES[toast.type];
            const Icon = s.icon;
            return (
              <div
                key={toast.id}
                className={`flex items-center gap-3 ${s.bg} border rounded-lg shadow-lg px-4 py-3 min-w-[280px] max-w-[400px] animate-slide-in-right`}
              >
                <Icon size={18} className={s.iconColor} shrink-0 />
                <p className="text-sm text-[#1A1A1A] flex-1">{toast.message}</p>
                <button
                  onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                  className="text-[#9CA3AF] hover:text-[#1A1A1A] transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
