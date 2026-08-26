import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError } from '../components/ui';
import { getAuditDashboardWidgets } from '../lib/devFieldAuditDocs';
import { isDevFieldAuditAuth, pageQueryBlocked } from '../lib/devFieldAuditAuth';
import {
  DndContext, DragEndEvent, DragStartEvent, PointerSensor, useSensor, useSensors,
  useDraggable,
} from '@dnd-kit/core';
import {
  Plus, X, GripVertical, Trash2, LayoutGrid, Sparkles,
} from 'lucide-react';
import { WIDGET_REGISTRY, WIDGET_CATEGORIES, getWidgetDef } from '../widgets/registry';
import { WidgetRenderer } from '../widgets/WidgetComponents';
import type { Json } from '../types/database';

interface DashboardWidget {
  id: string;
  widget_type: string;
  grid_x: number; // pixel x
  grid_y: number; // pixel y
  grid_w: number; // pixel width
  grid_h: number; // pixel height
  config: Json;
}

const MIN_W = 180;
const MIN_H = 120;
const MAX_W = 800;
const MAX_H = 700;
const CANVAS_PAD = 40;

export function DashboardPage() {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const { data: widgets, isLoading, error } = useQuery<DashboardWidget[]>({
    queryKey: ['dashboard-widgets'],
    queryFn: async () => {
      const mock = getAuditDashboardWidgets();
      if (mock) return mock;
      const { data, error } = await supabase
        .from('dashboard_widgets')
        .select('id, widget_type, grid_x, grid_y, grid_w, grid_h, config')
        .order('grid_y', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DashboardWidget[];
    },
    enabled: !!profile,
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ CRUD Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const addWidget = async (widgetType: string) => {
    const def = getWidgetDef(widgetType);
    if (!def) return;
    const w = widgets ?? [];
    // Place at a staggered offset so new widgets don't overlap exactly
    const offset = w.length * 30;
    const { data, error } = await supabase
      .from('dashboard_widgets')
      .insert({
        widget_type: widgetType,
        grid_x: Math.min(offset, 400),
        grid_y: 20,
        grid_w: def.defaultSize.w * 130,
        grid_h: def.defaultSize.h * 90,
        config: {} as Json,
      } as never)
      .select('id, widget_type, grid_x, grid_y, grid_w, grid_h, config')
      .single();
    if (!error && data) {
      queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'], [...w, data as DashboardWidget]);
    }
    setShowPicker(false);
  };

  const removeWidget = async (id: string) => {
    const { error } = await supabase.from('dashboard_widgets').delete().eq('id', id);
    if (!error) {
      queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'],
        (widgets ?? []).filter(w => w.id !== id));
    }
  };

  const persistWidget = useCallback(async (id: string, patch: Partial<DashboardWidget>) => {
    const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    delete update.id;
    delete update.widget_type;
    const { error } = await supabase
      .from('dashboard_widgets')
      .update(update as never)
      .eq('id', id);
    if (error) console.error('Widget update failed', error);
  }, []);

  const updateWidgetConfig = useCallback(async (id: string, config: Record<string, unknown>) => {
    const { error } = await supabase
      .from('dashboard_widgets')
      .update({ config: config as Json, updated_at: new Date().toISOString() } as never)
      .eq('id', id);
    if (!error) {
      queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'],
        (widgets ?? []).map(w => w.id === id ? { ...w, config: config as Json } : w));
    }
  }, [queryClient, widgets]);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ DnD Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, delta } = e;
    if (!delta.x && !delta.y) return;
    const w = (widgets ?? []).find(x => x.id === active.id);
    if (!w) return;
    const newX = Math.max(0, w.grid_x + delta.x);
    const newY = Math.max(0, w.grid_y + delta.y);
    queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'],
      (widgets ?? []).map(x => x.id === w.id ? { ...x, grid_x: newX, grid_y: newY } : x));
    persistWidget(w.id, { grid_x: newX, grid_y: newY });
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Resize via pointer events Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const resizeState = useRef<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

  const startResize = (e: React.PointerEvent, widget: DashboardWidget) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = {
      id: widget.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: widget.grid_w,
      startH: widget.grid_h,
    };
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeEnd, { once: true });
  };

  const onResizeMove = useCallback((e: PointerEvent) => {
    const rs = resizeState.current;
    if (!rs) return;
    const dw = e.clientX - rs.startX;
    const dh = e.clientY - rs.startY;
    const newW = Math.max(MIN_W, Math.min(MAX_W, rs.startW + dw));
    const newH = Math.max(MIN_H, Math.min(MAX_H, rs.startH + dh));
    queryClient.setQueryData<DashboardWidget[]>(['dashboard-widgets'],
      (widgets ?? []).map(x => x.id === rs.id ? { ...x, grid_w: newW, grid_h: newH } : x));
  }, [queryClient, widgets]);

  const onResizeEnd = useCallback(() => {
    const rs = resizeState.current;
    resizeState.current = null;
    window.removeEventListener('pointermove', onResizeMove);
    if (rs) {
      const w = (widgets ?? []).find(x => x.id === rs.id);
      if (w) persistWidget(rs.id, { grid_w: w.grid_w, grid_h: w.grid_h });
    }
  }, [widgets, persistWidget, onResizeMove]);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Canvas height: grows to fit all widgets Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const canvasHeight = useMemo(() => {
    const ws = widgets ?? [];
    if (!ws.length) return 500;
    const maxBottom = Math.max(...ws.map(w => w.grid_y + w.grid_h));
    return Math.max(500, maxBottom + CANVAS_PAD);
  }, [widgets]);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Default content for empty dashboard Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  useEffect(() => {
    if (isDevFieldAuditAuth()) return;
    if (!isLoading && profile && (widgets?.length === 0)) {
      (async () => {
        const defaults = [
          { type: 'ai_agent', x: 20, y: 20, w: 390, h: 360 },
          { type: 'kpi_scorecard', x: 430, y: 20, w: 260, h: 200 },
          { type: 'cash_flow', x: 710, y: 20, w: 260, h: 200 },
          { type: 'compliance_deadlines', x: 990, y: 20, w: 300, h: 280 },
          { type: 'team_activity', x: 430, y: 240, w: 260, h: 280 },
          { type: 'industry_news', x: 710, y: 240, w: 260, h: 280 },
        ];
        for (const d of defaults) {
          await supabase.from('dashboard_widgets').insert({
            widget_type: d.type, grid_x: d.x, grid_y: d.y, grid_w: d.w, grid_h: d.h, config: {} as Json,
          } as never);
        }
        queryClient.invalidateQueries({ queryKey: ['dashboard-widgets'] });
      })();
    }
  }, [isLoading, profile, widgets?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (pageQueryBlocked(error)) {
    return <AppShell><PageError message="Could not load dashboard" /></AppShell>;
  }

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">
              Good day, {profile?.name?.split(' ')[0] ?? 'there'}
            </h1>
            <p className="text-sm text-[#4A5568] mt-0.5">{company?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditMode(e => !e)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
                editMode
                  ? 'bg-[#2E75B6] text-white hover:bg-[#2565A0]'
                  : 'border border-[#E5E7EB] text-[#4A5568] hover:bg-gray-50 hover:border-[#D1D5DB]'
              }`}
            >
              <LayoutGrid size={16} />
              {editMode ? 'Done Editing' : 'Customize'}
            </button>
            {editMode && (
              <button
                onClick={() => setShowPicker(true)}
                className="btn-primary"
              >
                <Plus size={16} />
                Add Widget
              </button>
            )}
          </div>
        </div>

        {/* Free-form Canvas (desktop) / Stacked (mobile) */}
        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : (widgets ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <LayoutGrid size={40} className="text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 mb-3">Your dashboard is empty</p>
            <button onClick={() => setShowPicker(true)} className="btn-primary">
              <Plus size={16} /> Add your first widget
            </button>
          </div>
        ) : (
          <>
            {/* Mobile: stacked responsive grid */}
            {!editMode && (
              <div className="md:hidden grid grid-cols-1 gap-3">
                {(widgets ?? []).map(w => (
                  <div key={w.id} className="card overflow-hidden" style={{ minHeight: Math.min(w.grid_h, 300) }}>
                    <div className="h-full p-3">
                      <WidgetRenderer
                        type={w.widget_type}
                        config={(w.config as Record<string, unknown>) ?? {}}
                        onConfigChange={(c) => updateWidgetConfig(w.id, c)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Desktop: free-form canvas */}
            <div className={`${editMode ? 'block' : 'hidden md:block'}`}>
              <DndContext
                sensors={editMode ? sensors : []}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div
                  ref={canvasRef}
                  className={`relative rounded-xl border overflow-x-auto ${
                    editMode ? 'border-blue-200 bg-blue-50/20' : 'border-transparent'
                  }`}
                  style={{ height: canvasHeight, minWidth: '100%' }}
                >
                  {/* Grid dots background in edit mode */}
                  {editMode && (
                    <div
                      className="absolute inset-0 rounded-xl pointer-events-none opacity-40"
                      style={{
                        backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                      }}
                    />
                  )}
                  {(widgets ?? []).map(w => (
                    <FreeWidget
                      key={w.id}
                      widget={w}
                      editMode={editMode}
                      onRemove={() => removeWidget(w.id)}
                      onResizeStart={(e) => startResize(e, w)}
                      onConfigChange={(c) => updateWidgetConfig(w.id, c)}
                      isDragging={activeId === w.id}
                    />
                  ))}
                </div>
              </DndContext>
            </div>
          </>
        )}
      </div>

      {/* Widget Picker Modal */}
      {showPicker && (
        <WidgetPicker
          onAdd={addWidget}
          onClose={() => setShowPicker(false)}
          existingTypes={new Set((widgets ?? []).map(w => w.widget_type))}
        />
      )}
    </AppShell>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Free-form Widget Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function FreeWidget({
  widget, editMode, onRemove, onResizeStart, onConfigChange, isDragging,
}: {
  widget: DashboardWidget;
  editMode: boolean;
  onRemove: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging: isDragActive } = useDraggable({
    id: widget.id,
    disabled: !editMode,
  });

  const dragStyle: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  const posStyle: React.CSSProperties = {
    left: widget.grid_x,
    top: widget.grid_y,
    width: widget.grid_w,
    height: widget.grid_h,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...posStyle, ...dragStyle }}
      className={`absolute ${isDragging || isDragActive ? 'z-50' : 'z-10'} ${isDragActive ? 'select-none' : ''}`}
    >
      <div
        className={`h-full w-full bg-white rounded-xl border shadow-sm overflow-hidden transition-shadow ${
          editMode ? 'ring-2 ring-blue-200' : 'hover:shadow-md border-gray-200'
        } ${isDragging || isDragActive ? 'shadow-2xl ring-blue-400' : ''}`}
      >
        {/* Edit-mode controls bar */}
        {editMode && (
          <div className="absolute top-1.5 left-1.5 z-20 flex items-center gap-1">
            <button
              {...attributes}
              {...listeners}
              className="w-7 h-7 flex items-center justify-center rounded-md bg-white border border-gray-200 shadow-sm text-gray-400 cursor-grab active:cursor-grabbing hover:text-gray-600 hover:bg-gray-50 transition-colors touch-none"
              title="Drag to move"
            >
              <GripVertical size={14} />
            </button>
          </div>
        )}

        {editMode && (
          <div className="absolute top-1.5 right-1.5 z-20">
            <button
              onClick={onRemove}
              className="w-7 h-7 flex items-center justify-center rounded-md bg-white border border-gray-200 shadow-sm text-red-500 hover:bg-red-50 transition-colors"
              title="Remove widget"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {/* Widget content */}
        <div className={`h-full p-3 ${editMode ? 'pt-8' : ''}`}>
          <WidgetRenderer
            type={widget.widget_type}
            config={(widget.config as Record<string, unknown>) ?? {}}
            onConfigChange={onConfigChange}
          />
        </div>

        {/* Resize handle */}
        {editMode && (
          <div
            onPointerDown={onResizeStart}
            className="absolute bottom-0 right-0 z-20 w-5 h-5 cursor-se-resize touch-none flex items-end justify-end"
            title="Drag to resize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-400">
              <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Widget Picker Modal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function WidgetPicker({
  onAdd, onClose, existingTypes,
}: {
  onAdd: (type: string) => void;
  onClose: () => void;
  existingTypes: Set<string>;
}) {
  const [category, setCategory] = useState<string>('system');

  const filtered = WIDGET_REGISTRY.filter(w => w.category === category);

  return (
    <div className="overlay-backdrop">
      <div
        className="overlay-panel-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-blue-500" />
            <h2 className="text-base font-semibold text-[#1A1A1A]">Add a Widget</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-5 py-3 border-b border-gray-50 overflow-x-auto">
          {WIDGET_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                category === cat.id
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Widget grid */}
        <div className="flex-1 overflow-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(w => {
              const Icon = w.icon;
              const added = existingTypes.has(w.type);
              return (
                <button
                  key={w.type}
                  onClick={() => onAdd(w.type)}
                  disabled={added && w.category === 'system'}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    added && w.category === 'system'
                      ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-blue-300 hover:shadow-md hover:bg-blue-50/30'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Icon size={20} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-[#1A1A1A]">{w.label}</p>
                      {added && w.category === 'system' && (
                        <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">Added</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{w.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
