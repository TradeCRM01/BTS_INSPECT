export function EditorStickyFooter({
  onCancel,
  onSave,
  saveLabel = 'Save draft',
  saving = false,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  saving?: boolean;
}) {
  return (
    <div className="hub-editor-sticky-footer" data-editor-sticky-footer="1">
      <button
        type="button"
        data-editor-sticky-cancel="1"
        onClick={onCancel}
        className="hub-editor-sticky-cancel"
      >
        Cancel
      </button>
      <button
        type="button"
        data-editor-sticky-save="1"
        onClick={onSave}
        disabled={saving}
        className="btn-primary hub-editor-sticky-save"
      >
        {saving ? 'Saving...' : saveLabel}
      </button>
    </div>
  );
}
