import { RotateCw, WifiOff } from 'lucide-react';

interface PageErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function PageError({ message, onRetry }: PageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <WifiOff size={22} className="text-red-400" />
      </div>
      <p className="text-sm font-medium text-[#1A1A1A] mb-1">Failed to load</p>
      <p className="text-xs text-[#4A5568] mb-6 text-center max-w-xs">
        {message ?? 'Check your connection and try again.'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 bg-[#0A2540] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
        >
          <RotateCw size={14} />
          Try again
        </button>
      )}
    </div>
  );
}
