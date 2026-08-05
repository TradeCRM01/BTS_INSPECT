import { useState, useCallback } from 'react';
import { LayoutGrid, List } from 'lucide-react';

export type ViewMode = 'grid' | 'list';

const STORAGE_KEY = 'bts-view-preferences';

function readPrefs(): Record<string, ViewMode> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, ViewMode> : {};
  } catch {
    return {};
  }
}

function writePref(page: string, mode: ViewMode) {
  try {
    const prefs = readPrefs();
    prefs[page] = mode;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

export function useViewMode(page: string, defaultMode: ViewMode = 'grid'): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => readPrefs()[page] ?? defaultMode);
  const set = useCallback((m: ViewMode) => {
    setMode(m);
    writePref(page, m);
  }, [page]);
  return [mode, set];
}

export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex items-center rounded-md border border-[#E5E7EB] bg-white overflow-hidden shrink-0">
      <button
        onClick={() => onChange('grid')}
        className={`flex items-center justify-center w-8 h-9 transition-colors ${
          mode === 'grid'
            ? 'bg-[#0A2540] text-white'
            : 'text-[#4A5568] hover:bg-gray-50'
        }`}
        title="Thumbnail grid view"
      >
        <LayoutGrid size={14} />
      </button>
      <button
        onClick={() => onChange('list')}
        className={`flex items-center justify-center w-8 h-9 transition-colors ${
          mode === 'list'
            ? 'bg-[#0A2540] text-white'
            : 'text-[#4A5568] hover:bg-gray-50'
        }`}
        title="List view"
      >
        <List size={14} />
      </button>
    </div>
  );
}
