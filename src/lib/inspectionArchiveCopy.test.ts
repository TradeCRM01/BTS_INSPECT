import { describe, expect, it } from 'vitest';
import {
  INSPECTION_ARCHIVE_RESTORE_BLOCKED,
  inspectionArchiveFailCopy,
} from './inspectionArchiveCopy';

describe('inspectionArchiveFailCopy', () => {
  it('uses friendly copy when restoring a finished inspection is blocked', () => {
    expect(inspectionArchiveFailCopy({ code: 'P0001', message: 'Finalised inspections cannot be restored from archive' }))
      .toBe(INSPECTION_ARCHIVE_RESTORE_BLOCKED);
    expect(inspectionArchiveFailCopy({ message: 'Finalised inspections cannot change printed content' }))
      .toBe(INSPECTION_ARCHIVE_RESTORE_BLOCKED);
  });

  it('keeps a plain driver message when the archive path is not the lock', () => {
    expect(inspectionArchiveFailCopy({ message: 'network down' })).toBe('network down');
  });
});
