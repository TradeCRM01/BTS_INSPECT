import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  LETTERHEAD_MARK_MAX_PX,
  LETTERHEAD_MARK_MIN_PX,
  type CompanyLogoCrop,
} from './companyLogo';

type DragKind = 'move' | 'nw' | 'ne' | 'sw' | 'se';

function clampCrop(next: CompanyLogoCrop): CompanyLogoCrop {
  const w = Math.min(1, Math.max(0.04, next.w));
  const h = Math.min(1, Math.max(0.04, next.h));
  const x = Math.min(1 - w, Math.max(0, next.x));
  const y = Math.min(1 - h, Math.max(0, next.y));
  return { ...next, x, y, w, h };
}

/** Crop + letterhead size on the existing company logo strip. Wire only. */
export function CompanyLogoStripCrop({
  src,
  crop,
  sizePx,
  saving,
  onCropChange,
  onSizeChange,
  onSave,
  onClearCrop,
}: {
  src: string;
  crop: CompanyLogoCrop | null;
  sizePx: number;
  saving: boolean;
  onCropChange: (crop: CompanyLogoCrop) => void;
  onSizeChange: (sizePx: number) => void;
  onSave: () => void;
  onClearCrop: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ kind: DragKind; startX: number; startY: number; crop: CompanyLogoCrop } | null>(null);
  const [aspect, setAspect] = useState(crop?.aspect ?? 1);
  const box = crop ?? { x: 0, y: 0, w: 1, h: 1, aspect };

  useEffect(() => {
    if (crop?.aspect && crop.aspect > 0) setAspect(crop.aspect);
  }, [crop?.aspect]);

  function stageRect() {
    return stageRef.current?.getBoundingClientRect() ?? null;
  }

  function onPointerDown(kind: DragKind, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { kind, startX: event.clientX, startY: event.clientY, crop: box };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = stageRect();
    if (!drag || !rect || rect.width <= 0 || rect.height <= 0) return;
    const dx = (event.clientX - drag.startX) / rect.width;
    const dy = (event.clientY - drag.startY) / rect.height;
    const c = drag.crop;
    if (drag.kind === 'move') {
      onCropChange(clampCrop({ ...c, x: c.x + dx, y: c.y + dy, aspect }));
      return;
    }
    let { x, y, w, h } = c;
    if (drag.kind.includes('w')) {
      const nextX = Math.min(c.x + c.w - 0.04, Math.max(0, c.x + dx));
      w = c.x + c.w - nextX;
      x = nextX;
    }
    if (drag.kind.includes('e')) {
      w = Math.min(1 - c.x, Math.max(0.04, c.w + dx));
    }
    if (drag.kind.includes('n')) {
      const nextY = Math.min(c.y + c.h - 0.04, Math.max(0, c.y + dy));
      h = c.y + c.h - nextY;
      y = nextY;
    }
    if (drag.kind.includes('s')) {
      h = Math.min(1 - c.y, Math.max(0.04, c.h + dy));
    }
    onCropChange(clampCrop({ x, y, w, h, aspect }));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  return (
    <div className="company-logo-strip-crop">
      <div
        ref={stageRef}
        className="company-logo-strip-stage"
        style={{ aspectRatio: `${aspect}` }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt=""
          className="company-logo-strip-stage-img"
          draggable={false}
          onLoad={e => {
            const el = e.currentTarget;
            if (el.naturalWidth > 0 && el.naturalHeight > 0) {
              const next = el.naturalWidth / el.naturalHeight;
              setAspect(next);
              if (crop) onCropChange(clampCrop({ ...crop, aspect: next }));
            }
          }}
        />
        <div
          className="company-logo-strip-box"
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.w * 100}%`,
            height: `${box.h * 100}%`,
          }}
          onPointerDown={e => onPointerDown('move', e)}
        >
          {(['nw', 'ne', 'sw', 'se'] as const).map(kind => (
            <button
              key={kind}
              type="button"
              className={`company-logo-strip-handle is-${kind}`}
              aria-label={`Resize crop ${kind}`}
              onPointerDown={e => onPointerDown(kind, e)}
            />
          ))}
        </div>
      </div>
      <label className="company-logo-strip-size">
        Letterhead size
        <input
          type="range"
          min={LETTERHEAD_MARK_MIN_PX}
          max={LETTERHEAD_MARK_MAX_PX}
          value={sizePx}
          onChange={e => onSizeChange(Number(e.target.value))}
        />
        <span>{sizePx} px</span>
      </label>
      <div className="company-logo-strip-crop-acts">
        <button type="button" className="company-logo-strip-ctl" onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save crop & size'}
        </button>
        <button type="button" className="company-logo-strip-clear" onClick={onClearCrop} disabled={saving}>
          Use full image
        </button>
      </div>
      <p className="company-logo-strip-hint">
        Cut the empty box around the mark. Size is how big that cut sits on quote and invoice letterhead.
      </p>
    </div>
  );
}
