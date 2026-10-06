import { DOCUMENT_SHARE_MANUAL_LABEL } from '../../lib/documentShare';

export function DocumentShareManualLink({ url }: { url: string }) {
  return (
    <div className="hub-share-manual" data-share-manual="1">
      <p className="hub-share-manual-label">{DOCUMENT_SHARE_MANUAL_LABEL}</p>
      <textarea
        className="hub-share-manual-link"
        readOnly
        value={url}
        onFocus={e => e.currentTarget.select()}
        onClick={e => e.currentTarget.select()}
        aria-label={DOCUMENT_SHARE_MANUAL_LABEL}
      />
    </div>
  );
}
