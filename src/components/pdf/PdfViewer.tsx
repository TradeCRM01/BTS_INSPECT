import { useEffect, useRef, useState, useCallback } from 'react';
import { pdfjsLib } from '../../lib/pdfWorker';
import { FileText } from 'lucide-react';
import type { Annotation, TextAnnotation } from '../../types/annotations';

interface PdfViewerProps {
  pdfUrl: string;
  zoom: number;
  currentPage: number;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  onAnnotationUpdate: (annotation: Annotation) => void;
  onCreateAnnotation: (partial: Omit<Annotation, 'id'>) => string;
  activeTool: string | null;
  activeColor: string;
  fontSize: number;
  onPageChange: (page: number) => void;
  onDocumentLoad: (numPages: number) => void;
  mode: 'view' | 'edit';
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export function PdfViewer({
  pdfUrl, zoom, currentPage, annotations, selectedAnnotationId,
  onSelectAnnotation, onAnnotationUpdate, onCreateAnnotation,
  activeTool, activeColor, fontSize, onPageChange, onDocumentLoad, mode,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageSizes, setPageSizes] = useState<Map<number, { w: number; h: number }>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  // Ref mirror of annotations so window-event callbacks always see latest
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const drawingState = useRef<{ annotationId: string; startX: number; startY: number; pageNumber: number } | null>(null);
  const dragState = useRef<{ annotation: Annotation; offsetX: number; offsetY: number; pageNumber: number } | null>(null);
  const resizeState = useRef<{ annotationId: string; handle: ResizeHandle; startX: number; startY: number; orig: Annotation; pageNumber: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    (async () => {
      try {
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error(`Failed to fetch PDF (HTTP ${res.status})`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        const doc = await loadingTask.promise;
        if (cancelled) { (doc as any).destroy(); return; }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoadError(null);
        onDocumentLoad(doc.numPages);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load PDF');
      }
    })();
    return () => { cancelled = true; if (loadingTask) loadingTask.destroy(); pdfDocRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl]);

  const renderPage = useCallback(async (pageNumber: number) => {
    const doc = pdfDocRef.current;
    const wrapper = pageRefs.current.get(pageNumber);
    if (!doc || !wrapper) return;
    const page = await doc.getPage(pageNumber);
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: zoom * dpr });
    const cssViewport = page.getViewport({ scale: zoom });
    let canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) { canvas = document.createElement('canvas'); canvas.style.display = 'block'; wrapper.appendChild(canvas); }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = viewport.width; canvas.height = viewport.height;
    canvas.style.width = `${cssViewport.width}px`; canvas.style.height = `${cssViewport.height}px`;
    await page.render({ canvasContext: ctx, viewport }).promise;
    setPageSizes(prev => { const next = new Map(prev); next.set(pageNumber, { w: cssViewport.width, h: cssViewport.height }); return next; });
  }, [zoom]);

  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0) return;
    for (let p = 1; p <= numPages; p++) renderPage(p);
  }, [numPages, renderPage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;
    const handleScroll = () => {
      const scrollTop = container.scrollTop + 100;
      let accumulated = 0; let detected = 1;
      for (let p = 1; p <= numPages; p++) {
        const h = pageSizes.get(p)?.h ?? 800;
        if (scrollTop > accumulated && scrollTop <= accumulated + h + 12) { detected = p; break; }
        accumulated += h + 12;
      }
      if (detected !== currentPage) onPageChange(detected);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [numPages, pageSizes, currentPage, onPageChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !currentPage) return;
    let offset = 0;
    for (let p = 1; p < currentPage; p++) offset += (pageSizes.get(p)?.h ?? 0) + 12;
    if (Math.abs(container.scrollTop - offset) > 50) container.scrollTo({ top: offset, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  function getRelativeCoords(e: { clientX: number; clientY: number }, pageNumber: number) {
    const wrapper = pageRefs.current.get(pageNumber);
    if (!wrapper) return { x: 0, y: 0 };
    const rect = wrapper.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  }

  // ─── Single stable callback for all pointer-move (drag / resize / draw) ───
  const onWindowPointerMove = useCallback((e: PointerEvent) => {
    const rs = resizeState.current;
    if (rs) {
      const dx = (e.clientX - rs.startX) / zoom;
      const dy = (e.clientY - rs.startY) / zoom;
      onAnnotationUpdate(computeResized(rs.orig, rs.handle, dx, dy));
      return;
    }
    const drag = dragState.current;
    if (drag) {
      const { x, y } = getRelativeCoords(e, drag.pageNumber);
      onAnnotationUpdate({ ...drag.annotation, x, y });
      return;
    }
    const ds = drawingState.current;
    if (ds && ds.annotationId) {
      const ann = annotationsRef.current.find(a => a.id === ds.annotationId);
      if (!ann) return;
      const { x, y } = getRelativeCoords(e, ds.pageNumber);
      const dx = x - ds.startX;
      const dy = y - ds.startY;
      if (ann.type === 'rectangle' || ann.type === 'whiteout') {
        onAnnotationUpdate({ ...ann, x: dx >= 0 ? ds.startX : x, y: dy >= 0 ? ds.startY : y, width: Math.abs(dx), height: Math.abs(dy) });
      } else if (ann.type === 'highlight') {
        onAnnotationUpdate({ ...ann, x: dx >= 0 ? ds.startX : x, width: Math.abs(dx), height: ann.height });
      } else if (ann.type === 'circle') {
        onAnnotationUpdate({ ...ann, radiusX: Math.abs(dx) / 2, radiusY: Math.abs(dy) / 2, x: (ds.startX + x) / 2, y: (ds.startY + y) / 2 });
      } else if (ann.type === 'line') {
        onAnnotationUpdate({ ...ann, x2: x, y2: y });
      }
    }
  }, [onAnnotationUpdate, zoom]);

  const onWindowPointerUp = useCallback(() => {
    resizeState.current = null;
    dragState.current = null;
    drawingState.current = null;
    window.removeEventListener('pointermove', onWindowPointerMove);
  }, [onWindowPointerMove]);

  function beginDragOrResize(e: React.PointerEvent, pageNumber: number): boolean {
    const handleEl = (e.target as HTMLElement).closest('[data-resize-handle]') as HTMLElement | null;
    if (handleEl) {
      e.stopPropagation();
      e.preventDefault();
      const annId = handleEl.dataset.annotationId!;
      const handle = handleEl.dataset.resizeHandle as ResizeHandle;
      const ann = annotationsRef.current.find(a => a.id === annId);
      if (ann) {
        resizeState.current = { annotationId: annId, handle, startX: e.clientX, startY: e.clientY, orig: { ...ann }, pageNumber };
        window.addEventListener('pointermove', onWindowPointerMove);
        window.addEventListener('pointerup', onWindowPointerUp, { once: true });
      }
      return true;
    }

    const annEl = (e.target as HTMLElement).closest('[data-annotation-id]') as HTMLElement | null;
    if (annEl && !activeTool) {
      const id = annEl.dataset.annotationId!;
      const ann = annotationsRef.current.find(a => a.id === id);
      if (ann) {
        onSelectAnnotation(id);
        const { x, y } = getRelativeCoords(e, pageNumber);
        dragState.current = { annotation, offsetX: x - ann.x, offsetY: y - ann.y, pageNumber };
        window.addEventListener('pointermove', onWindowPointerMove);
        window.addEventListener('pointerup', onWindowPointerUp, { once: true });
      }
      return true;
    }
    return false;
  }

  function handlePagePointerDown(e: React.PointerEvent, pageNumber: number) {
    if (mode !== 'edit') return;
    if (beginDragOrResize(e, pageNumber)) return;

    // Clicked on an annotation while a tool is active — don't create new
    const annEl = (e.target as HTMLElement).closest('[data-annotation-id]') as HTMLElement | null;
    if (annEl) return;

    if (!activeTool) { onSelectAnnotation(null); setEditingTextId(null); return; }

    setEditingTextId(null);
    const { x, y } = getRelativeCoords(e, pageNumber);
    drawingState.current = { annotationId: '', startX: x, startY: y, pageNumber };

    if (activeTool === 'text') {
      const newId = onCreateAnnotation({
        type: 'text', pageNumber, x, y: y - fontSize / 2,
        width: 200, height: fontSize * 1.3,
        text: '', fontSize, color: activeColor,
      });
      drawingState.current = null;
      setTimeout(() => setEditingTextId(newId), 50);
      return;
    }

    let newId = '';
    if (activeTool === 'whiteout') {
      newId = onCreateAnnotation({ type: 'whiteout', pageNumber, x, y, width: 0, height: 0 });
    } else if (activeTool === 'highlight') {
      newId = onCreateAnnotation({ type: 'highlight', pageNumber, x, y, width: 0, height: fontSize * 1.3, color: activeColor });
    } else if (activeTool === 'rectangle') {
      newId = onCreateAnnotation({ type: 'rectangle', pageNumber, x, y, width: 0, height: 0, color: activeColor, strokeWidth: 2 });
    } else if (activeTool === 'circle') {
      newId = onCreateAnnotation({ type: 'circle', pageNumber, x, y, radiusX: 0, radiusY: 0, color: activeColor, strokeWidth: 2 });
    } else if (activeTool === 'line') {
      newId = onCreateAnnotation({ type: 'line', pageNumber, x, y, x2: x, y2: y, color: activeColor, strokeWidth: 2 });
    }

    if (newId) {
      drawingState.current!.annotationId = newId;
      window.addEventListener('pointermove', onWindowPointerMove);
      window.addEventListener('pointerup', onWindowPointerUp, { once: true });
    }
  }

  function handleTextBlur(id: string, text: string) {
    const ann = annotationsRef.current.find(a => a.id === id);
    if (ann && ann.type === 'text') onAnnotationUpdate({ ...ann, text });
    setEditingTextId(null);
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-[#525659] flex flex-col items-center py-4" style={{ minHeight: '400px' }}>
      {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNumber => {
        const size = pageSizes.get(pageNumber);
        const pageAnns = annotations.filter(a => a.pageNumber === pageNumber);
        return (
          <div
            key={pageNumber}
            ref={el => { pageRefs.current.set(pageNumber, el); }}
            className="relative mb-3 bg-white shadow-md"
            style={{ width: size?.w ?? undefined, height: size?.h ?? undefined }}
            onPointerDown={e => handlePagePointerDown(e, pageNumber)}
          >
            <div className="absolute inset-0" style={{ pointerEvents: mode === 'edit' ? 'auto' : 'none' }}>
              {pageAnns.map(ann => (
                <AnnotationRenderer
                  key={ann.id}
                  annotation={ann}
                  zoom={zoom}
                  selected={ann.id === selectedAnnotationId}
                  editable={mode === 'edit'}
                  isEditing={ann.id === editingTextId}
                  onSelect={() => onSelectAnnotation(ann.id)}
                  onTextChange={text => {
                    const a = annotationsRef.current.find(x => x.id === ann.id);
                    if (a && a.type === 'text') onAnnotationUpdate({ ...a, text });
                  }}
                  onDoubleClickText={() => {
                    if (mode !== 'edit') return;
                    onSelectAnnotation(ann.id);
                    setEditingTextId(ann.id);
                  }}
                  onTextBlur={text => handleTextBlur(ann.id, text)}
                />
              ))}
            </div>
          </div>
        );
      })}
      {numPages === 0 && !loadError && (
        <div className="flex items-center justify-center h-96">
          <div className="text-white/60 text-sm">Loading PDF...</div>
        </div>
      )}
      {loadError && (
        <div className="flex flex-col items-center justify-center h-96 px-4">
          <FileText size={40} className="text-white/40 mb-3" />
          <div className="text-white/80 text-sm font-medium mb-1">Could not load PDF</div>
          <div className="text-white/50 text-xs text-center max-w-md">{loadError}</div>
        </div>
      )}
    </div>
  );
}

function computeResized(orig: Annotation, handle: ResizeHandle, dx: number, dy: number): Annotation {
  if (orig.type === 'text' || orig.type === 'highlight' || orig.type === 'rectangle' || orig.type === 'whiteout') {
    let { x, y, width, height } = orig;
    if (handle.includes('e')) width = Math.max(20, orig.width + dx);
    if (handle.includes('s')) height = Math.max(15, orig.height + dy);
    if (handle.includes('w')) { const nw = Math.max(20, orig.width - dx); x = orig.x + (orig.width - nw); width = nw; }
    if (handle.includes('n')) { const nh = Math.max(15, orig.height - dy); y = orig.y + (orig.height - nh); height = nh; }
    return { ...orig, x, y, width, height };
  }
  if (orig.type === 'circle') {
    let { radiusX, radiusY } = orig;
    if (handle.includes('e')) radiusX = Math.max(8, orig.radiusX + dx / 2);
    if (handle.includes('w')) radiusX = Math.max(8, orig.radiusX - dx / 2);
    if (handle.includes('s')) radiusY = Math.max(8, orig.radiusY + dy / 2);
    if (handle.includes('n')) radiusY = Math.max(8, orig.radiusY - dy / 2);
    return { ...orig, radiusX, radiusY };
  }
  if (orig.type === 'line') {
    if (handle === 'nw' || handle === 'sw' || handle === 'w') return { ...orig, x: orig.x + dx, y: handle.includes('n') ? orig.y + dy : orig.y };
    if (handle === 'ne' || handle === 'se' || handle === 'e') return { ...orig, x2: orig.x2 + dx, y2: handle.includes('n') ? orig.y2 + dy : orig.y2 };
  }
  return orig;
}

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function getHandleStyle(handle: ResizeHandle): React.CSSProperties {
  const s: React.CSSProperties = { position: 'absolute', width: 10, height: 10, background: '#3B82F6', border: '1.5px solid white', borderRadius: 2, zIndex: 30, touchAction: 'none' };
  switch (handle) {
    case 'nw': return { ...s, top: -5, left: -5, cursor: 'nwse-resize' };
    case 'n': return { ...s, top: -5, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' };
    case 'ne': return { ...s, top: -5, right: -5, cursor: 'nesw-resize' };
    case 'e': return { ...s, top: '50%', right: -5, transform: 'translateY(-50%)', cursor: 'ew-resize' };
    case 'se': return { ...s, bottom: -5, right: -5, cursor: 'nwse-resize' };
    case 's': return { ...s, bottom: -5, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' };
    case 'sw': return { ...s, bottom: -5, left: -5, cursor: 'nesw-resize' };
    case 'w': return { ...s, top: '50%', left: -5, transform: 'translateY(-50%)', cursor: 'ew-resize' };
  }
  return s;
}

function AnnotationRenderer({
  annotation, zoom, selected, editable, isEditing, onSelect, onTextChange, onDoubleClickText, onTextBlur,
}: {
  annotation: Annotation;
  zoom: number;
  selected: boolean;
  editable: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onTextChange: (text: string) => void;
  onDoubleClickText: () => void;
  onTextBlur: (text: string) => void;
}) {
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: annotation.x * zoom,
    top: annotation.y * zoom,
    pointerEvents: editable ? 'auto' : 'none',
    touchAction: 'none',
  };

  const showHandles = selected && editable && !isEditing;

  const renderHandles = () => showHandles ? HANDLES.map(h => (
    <div key={h} data-resize-handle={h} data-annotation-id={annotation.id} style={getHandleStyle(h)} />
  )) : null;

  if (annotation.type === 'text') {
    const ta = annotation as TextAnnotation;
    const isPlaceholder = !ta.text;
    return (
      <div
        data-annotation-id={annotation.id}
        style={{
          ...baseStyle,
          width: ta.width * zoom,
          minHeight: ta.height * zoom,
          fontSize: ta.fontSize * zoom,
          color: ta.color,
          lineHeight: 1.3,
          padding: '2px 4px',
          border: selected ? (isEditing ? '1px solid #3B82F6' : '1px dashed #3B82F6') : '1px solid transparent',
          background: selected ? 'rgba(59,130,246,0.05)' : 'transparent',
          fontFamily: 'Helvetica, Arial, sans-serif',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflow: 'hidden',
          cursor: isEditing ? 'text' : 'move',
        }}
        onPointerDown={e => { if (isEditing) e.stopPropagation(); }}
        onDoubleClick={e => { e.stopPropagation(); onDoubleClickText(); }}
        contentEditable={editable && isEditing}
        suppressContentEditableWarning
        onBlur={e => onTextBlur(e.currentTarget.textContent ?? '')}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); (e.target as HTMLElement).blur(); }
        }}
      >
        {isPlaceholder && isEditing ? '' : ta.text || (editable && !isEditing ? 'Double-click to edit' : '')}
      </div>
    );
  }

  if (annotation.type === 'whiteout') {
    return (
      <div data-annotation-id={annotation.id}
        style={{ ...baseStyle, width: annotation.width * zoom, height: annotation.height * zoom, backgroundColor: '#FFFFFF', border: selected ? '1px dashed #3B82F6' : '1px solid #d0d0d0', cursor: 'move' }}
      >
        {renderHandles()}
      </div>
    );
  }

  if (annotation.type === 'highlight') {
    return (
      <div data-annotation-id={annotation.id}
        style={{ ...baseStyle, width: annotation.width * zoom, height: annotation.height * zoom, backgroundColor: annotation.color + '40', border: selected ? '1px dashed #3B82F6' : 'none', cursor: 'move' }}
      >
        {renderHandles()}
      </div>
    );
  }

  if (annotation.type === 'rectangle') {
    return (
      <div data-annotation-id={annotation.id}
        style={{ ...baseStyle, width: annotation.width * zoom, height: annotation.height * zoom, border: `${annotation.strokeWidth * zoom}px solid ${annotation.color}`, boxSizing: 'border-box', outline: selected ? '1px dashed #3B82F6' : 'none', outlineOffset: '2px', cursor: 'move' }}
      >
        {renderHandles()}
      </div>
    );
  }

  if (annotation.type === 'circle') {
    return (
      <div data-annotation-id={annotation.id}
        style={{ ...baseStyle, width: annotation.radiusX * 2 * zoom, height: annotation.radiusY * 2 * zoom, borderRadius: '50%', border: `${annotation.strokeWidth * zoom}px solid ${annotation.color}`, boxSizing: 'border-box', transform: 'translate(-50%, -50%)', outline: selected ? '1px dashed #3B82F6' : 'none', outlineOffset: '2px', cursor: 'move' }}
      >
        {renderHandles()}
      </div>
    );
  }

  if (annotation.type === 'line') {
    const bx = Math.min(annotation.x, annotation.x2);
    const by = Math.min(annotation.y, annotation.y2);
    return (
      <div data-annotation-id={annotation.id} style={{ ...baseStyle, left: bx * zoom, top: by * zoom, width: Math.abs(annotation.x2 - annotation.x) * zoom, height: Math.abs(annotation.y2 - annotation.y) * zoom, overflow: 'visible', cursor: 'move' }}>
        <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
          <line x1={(annotation.x - bx) * zoom} y1={(annotation.y - by) * zoom} x2={(annotation.x2 - bx) * zoom} y2={(annotation.y2 - by) * zoom} stroke={annotation.color} strokeWidth={annotation.strokeWidth * zoom} strokeLinecap="round" />
        </svg>
        {renderHandles()}
      </div>
    );
  }

  return null;
}
