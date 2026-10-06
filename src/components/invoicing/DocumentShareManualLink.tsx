import { useLayoutEffect, useRef } from 'react';
import { DOCUMENT_SHARE_MANUAL_LABEL } from '../../lib/documentShare';

export function DocumentShareManualLink({ url }: { url: string }) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [url]);

  return (
    <div className="hub-share-manual" data-share-manual="1">
      <p className="hub-share-manual-label">{DOCUMENT_SHARE_MANUAL_LABEL}</p>
      <textarea
        ref={fieldRef}
        className="hub-share-manual-link"
        readOnly
        rows={4}
        value={url}
        onFocus={e => e.currentTarget.select()}
        onClick={e => e.currentTarget.select()}
        aria-label={DOCUMENT_SHARE_MANUAL_LABEL}
      />
    </div>
  );
}
