import { describe, expect, it } from 'vitest';
import { composeGenericReport } from '../reports/generic_inspection/compose';
import { composeElectricalReport } from '../reports/electrical_3000/compose';
import type { TemplateSchema } from '../types/template';
import { printSnapshotFields } from '../../supabase/functions/client-portal/portalTenancy';
import {
  resolveInspectionPrintFields,
} from './inspectionPrintSnapshot';

const emptySchema: TemplateSchema = {
  meta: {
    requiresSiteName: false,
    requiresSiteAddress: false,
    requiresClientName: false,
    requiresJobNumber: false,
  },
  sections: [],
};

describe('inspection print snapshots', () => {
  it('falls back to snapshot columns when meta and live FKs are empty', () => {
    const printed = resolveInspectionPrintFields({
      meta: {},
      snapshots: {
        clientName: 'Doomed Client',
        jobTitle: 'Doomed Job',
        siteName: 'Doom St',
        siteAddress: 'Doom St',
      },
      live: { clientName: 'Live Client', siteName: 'Live St', siteAddress: 'Live St' },
      finalised: true,
    });
    expect(printed).toEqual({
      clientName: 'Doomed Client',
      jobTitle: 'Doomed Job',
      siteName: 'Doom St',
      siteAddress: 'Doom St',
    });
  });

  it('composeGenericReport still shows name and address after a client and job null-out', () => {
    const data = composeGenericReport({
      inspection: {
        id: 'insp-1',
        meta: {},
        responses: {},
        client_name_snapshot: 'Doomed Client',
        job_title_snapshot: 'Doomed Job',
        site_name_snapshot: 'Doom St',
        site_address_snapshot: 'Doom St',
      },
      template: { name: 'Generic', schema: emptySchema },
      profile: { name: 'Someone Else', licence_number: 'XX-9' },
      company: { name: 'Northside' },
      photos: [],
      reportNumber: 'R-1',
    });
    expect(data.clientName).toBe('Doomed Client');
    expect(data.siteName).toBe('Doom St');
    expect(data.siteAddress).toBe('Doom St');
    expect(data.jobDescription).toBe('Doomed Job');
  });

  it('composeElectricalReport still shows name and address after a client and job null-out', () => {
    const data = composeElectricalReport({
      inspection: {
        id: 'insp-1',
        meta: {},
        responses: {},
        client_name_snapshot: 'Doomed Client',
        site_name_snapshot: 'Doom St',
        site_address_snapshot: 'Doom St',
      },
      template: { name: 'Electrical', schema: emptySchema },
      profile: { name: 'Someone Else', licence_number: 'XX-9' },
      company: { name: 'Northside' },
      photos: [],
      reportNumber: 'R-1',
    });
    expect(data.meta.client).toBe('Doomed Client');
    expect(data.meta.site).toBe('Doom St');
    expect(data.meta.siteAddress).toBe('Doom St');
  });

  it('portal print fields fall back to snapshots when meta is empty', () => {
    expect(printSnapshotFields({
      meta: {},
      client_name_snapshot: 'Doomed Client',
      site_name_snapshot: 'Doom St',
      site_address_snapshot: 'Doom St',
    })).toEqual({
      siteName: 'Doom St',
      siteAddress: 'Doom St',
      clientName: 'Doomed Client',
      jobNumber: null,
    });
  });
});
