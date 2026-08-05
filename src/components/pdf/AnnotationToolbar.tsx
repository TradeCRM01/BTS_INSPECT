import { Type, Highlighter, Square, Circle as CircleIcon, Minus, MousePointer2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Trash2, Save, Download, Eraser } from 'lucide-react';
import type { AnnotationTool } from '../../types/annotations';
import { TOOL_COLORS } from '../../types/annotations';

interface AnnotationToolbarProps {
  mode: 'view' | 'edit';
  activeTool: AnnotationTool | null;
  activeColor: string;
  fontSize: number;
  zoom: number;
  currentPage: number;
  numPages: number;
  selectedAnnotationId: string | null;
  onToolChange: (tool: AnnotationTool | null) => void;
  onColorChange: (color: string) => void;
  onFontSizeChange: (size: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPageChange: (page: number) => void;
  onDeleteSelected: () => void;
  onSave: () => void;
  onDownload: () => void;
  saving: boolean;
}

const TOOLS: { key: AnnotationTool; label: string; icon: typeof Type }[] = [
  { key: 'text', label: 'Text', icon: Type },
  { key: 'whiteout', label: 'White-out', icon: Eraser },
  { key: 'highlight', label: 'Highlight', icon: Highlighter },
  { key: 'rectangle', label: 'Rectangle', icon: Square },
  { key: 'circle', label: 'Circle', icon: CircleIcon },
  { key: 'line', label: 'Line', icon: Minus },
];

export function AnnotationToolbar({
  mode, activeTool, activeColor, fontSize, zoom, currentPage, numPages,
  selectedAnnotationId,
  onToolChange, onColorChange, onFontSizeChange, onZoomIn, onZoomOut, onPageChange,
  onDeleteSelected, onSave, onDownload, saving,
}: AnnotationToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white border-b border-[#E5E7EB] px-3 py-2">
      {/* Tool selection (edit mode only) */}
      {mode === 'edit' && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToolChange(null)}
            className={`p-2 rounded-md transition-colors ${activeTool === null ? 'bg-[#0A2540] text-white' : 'text-[#4A5568] hover:bg-gray-100'}`}
            title="Select / Move"
          >
            <MousePointer2 size={16} />
          </button>
          <div className="w-px h-6 bg-[#E5E7EB] mx-1" />
          {TOOLS.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.key}
                onClick={() => onToolChange(tool.key)}
                className={`p-2 rounded-md transition-colors ${activeTool === tool.key ? 'bg-[#0A2540] text-white' : 'text-[#4A5568] hover:bg-gray-100'}`}
                title={tool.label}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      )}

      {/* Color picker */}
      {mode === 'edit' && (
        <div className="flex items-center gap-1 ml-1">
          {TOOL_COLORS.map(color => (
            <button
              key={color}
              onClick={() => onColorChange(color)}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${activeColor === color ? 'border-[#1A1A1A] scale-110' : 'border-white'}`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      )}

      {/* Font size (text tool only) */}
      {mode === 'edit' && activeTool === 'text' && (
        <select
          value={fontSize}
          onChange={e => onFontSizeChange(Number(e.target.value))}
          className="text-sm border border-[#E5E7EB] rounded-md px-2 py-1 text-[#1A1A1A] bg-white"
        >
          {[10, 12, 14, 16, 18, 20, 24, 28].map(s => (
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
      )}

      {/* Delete selected */}
      {mode === 'edit' && selectedAnnotationId && (
        <button
          onClick={onDeleteSelected}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-sm text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={15} /> Delete
        </button>
      )}

      <div className="flex-1" />

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} className="p-1.5 rounded-md text-[#4A5568] hover:bg-gray-100 disabled:opacity-30">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm text-[#1A1A1A] min-w-[60px] text-center">
          {currentPage} / {numPages || '?'}
        </span>
        <button onClick={() => onPageChange(Math.min(numPages, currentPage + 1))} disabled={currentPage >= numPages} className="p-1.5 rounded-md text-[#4A5568] hover:bg-gray-100 disabled:opacity-30">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Zoom */}
      <div className="flex items-center gap-1 ml-1">
        <button onClick={onZoomOut} className="p-1.5 rounded-md text-[#4A5568] hover:bg-gray-100">
          <ZoomOut size={16} />
        </button>
        <span className="text-sm text-[#1A1A1A] min-w-[44px] text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={onZoomIn} className="p-1.5 rounded-md text-[#4A5568] hover:bg-gray-100">
          <ZoomIn size={16} />
        </button>
      </div>

      {/* Save & Download */}
      {mode === 'edit' && (
        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-[#2E75B6] text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#1e5394] disabled:opacity-50 transition-colors"
          >
            <Save size={15} /> {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 border border-[#0A2540] text-[#0A2540] px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#0A2540]/5 transition-colors"
          >
            <Download size={15} /> Download
          </button>
        </div>
      )}
    </div>
  );
}
