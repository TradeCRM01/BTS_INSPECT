import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  documentCreatorLine,
  inspectionInspectorLine,
  resolveInspectorIdentity,
} from './inspectorSnapshot';
import { composeGenericReport } from '../reports/generic_inspection/compose';
import { composeElectricalReport } from '../reports/electrical_3000/compose';
import type { TemplateSchema } from '../types/template';
import {
  publicRemoveMemberError,
  REMOVE_MEMBER_FAILED,
} from '../../supabase/functions/remove-member/publicError';
import { inspectorSnapshotFields } from '../../supabase/functions/client-portal/portalTenancy';

const emptySchema: TemplateSchema = {
  meta: {
    requiresSiteName: false,
    requiresSiteAddress: false,
    requiresClientName: false,
    requiresJobNumber: false,
  },
  sections: [],
};

describe('inspector snapshots after a member is removed', () => {
  it('keeps the snapshot name and licence when inspector_id is null', () => {
    const identity = resolveInspectorIdentity({
      inspectorId: null,
      live: { name: 'Live Name', licence: 'LIVE-1' },
      snapshot: { name: 'Pat Snapshot', licence: 'EC-4411' },
    });
    expect(identity).toEqual({ name: 'Pat Snapshot', licence: 'EC-4411' });
    expect(inspectionInspectorLine(identity)).toBe('Pat Snapshot · EC-4411');
  });

  it('uses the live profile while inspector_id is still set', () => {
    const identity = resolveInspectorIdentity({
      inspectorId: 'insp-1',
      live: { name: 'Sam Spark', licence: 'EL-1' },
      snapshot: { name: 'Pat Snapshot', licence: 'EC-4411' },
    });
    expect(identity).toEqual({ name: 'Sam Spark', licence: 'EL-1' });
  });
});

describe('client portal uses the snapshot when inspector_id is null', () => {
  it('portal card uses snapshot name when inspector_id is null', () => {
    expect(inspectorSnapshotFields({
      inspector_id: null,
      inspector_name_snapshot: 'Pat Snapshot',
      inspector_licence_snapshot: 'EC-4411',
    })).toEqual({
      inspectorName: 'Pat Snapshot',
      inspectorLicence: 'EC-4411',
    });
  });
});

describe('creator snapshot line', () => {
  it('shows Created by Pat Snapshot when the live creator is gone', () => {
    expect(documentCreatorLine('Pat Snapshot')).toBe('Created by Pat Snapshot');
    expect(documentCreatorLine(null)).toBeNull();
  });
});

describe('inspection PDF uses the snapshot when inspector_id is null', () => {
  it('composeElectricalReport reads inspector_name_snapshot when inspector_id is null', () => {
    const data = composeElectricalReport({
      inspection: {
        id: 'insp-1',
        inspector_id: null,
        inspector_name_snapshot: 'Pat Snapshot',
        inspector_licence_snapshot: 'EC-4411',
        meta: { siteName: 'Yard' },
        responses: {},
      },
      template: { name: 'Electrical', schema: emptySchema },
      profile: { name: 'Someone Else', licence_number: 'XX-9' },
      company: { name: 'Northside' },
      photos: [],
      reportNumber: 'R-1',
    });
    expect(data.meta.inspector).toBe('Pat Snapshot');
    expect(data.meta.licenceNumber).toBe('EC-4411');
  });

  it('composeGenericReport reads inspector_name_snapshot, not the signed-in profile', () => {
    const data = composeGenericReport({
      inspection: {
        id: 'insp-1',
        inspector_id: null,
        inspector_name_snapshot: 'Pat Snapshot',
        inspector_licence_snapshot: 'EC-4411',
        meta: { siteName: 'Yard' },
        responses: {},
      },
      template: { name: 'Switchboard', schema: emptySchema },
      profile: { name: 'Someone Else', licence_number: 'XX-9' },
      company: { name: 'Northside' },
      photos: [],
      reportNumber: 'R-1',
    });
    expect(data.inspectorName).toBe('Pat Snapshot');
    expect(data.inspectorLicence).toBe('EC-4411');
  });
});

describe('remove-member unexpected errors stay friendly', () => {
  it('remove-member function folder ships only index.ts and publicError.ts', () => {
    const names = readdirSync(resolve(__dirname, '../../supabase/functions/remove-member'))
      .filter((name) => !name.startsWith('.'))
      .sort();
    expect(names).toEqual(['index.ts', 'publicError.ts']);
  });

  it('does not leak a raw database message', () => {
    const raw = {
      message: 'null value in column "inspector_id" of relation "inspections" violates not-null constraint',
    };
    const message = publicRemoveMemberError(raw);
    expect(message).toBe(REMOVE_MEMBER_FAILED);
    expect(message).toBe("Couldn't remove this member. Try again or contact support.");
    expect(message).not.toContain('inspector_id');
    expect(message).not.toContain('null value');
  });
});
