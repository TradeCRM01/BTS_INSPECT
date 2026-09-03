import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clientSheetCreateJobVisible,
  jobFormSelectNewClient,
  newJobFromClientHref,
} from './clientRecords';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const jobForm = src('src/components/crm/JobFormModal.tsx');
const clientsPage = src('src/pages/ClientsPage.tsx');
const jobsPage = src('src/pages/JobsPage.tsx');
const clientForm = clientsPage.slice(clientsPage.indexOf('export function ClientForm'));

describe('G1 add-client from the New job client field', () => {
  it('opens the existing Clients add-client sheet from the JobForm client field', () => {
    expect(jobForm).toContain("import { ClientForm } from '../../pages/ClientsPage'");
    expect(jobForm).toContain('Add new client');
    expect(jobForm).toContain('setAddingClient(true)');
    expect(jobForm).toContain('<ClientForm');
    expect(jobForm).toContain('client={null}');
    expect(jobForm).not.toContain('ClientJobWizard');
    expect(jobForm).not.toContain('AddClientWizard');
    expect(jobForm).not.toContain('NewClientPage');
  });

  it('keeps the in-progress job card mounted — does not close or cancel it', () => {
    expect(jobForm).toContain('const [addingClient, setAddingClient] = useState(false)');
    expect(jobForm).toContain('{addingClient && (');
    const addClient = jobForm.slice(jobForm.indexOf('Add new client') - 120, jobForm.indexOf('Add new client') + 80);
    expect(addClient).toContain('setAddingClient(true)');
    expect(addClient).not.toContain('onClose()');
    expect(addClient).not.toContain('handleClose');
    expect(jobForm).not.toMatch(/Add new client[\s\S]{0,80}navigate\(['`]\/clients/);
  });
});

describe('G2 Save returns to the same job card with the new client selected', () => {
  it('applies the saved client on the same JobForm without dumping typed fields', () => {
    expect(jobForm).toContain('onSaved={clientId => { void applyNewClient(clientId); }}');
    expect(jobForm).toContain('jobFormSelectNewClient');
    expect(jobForm).toContain('setForm(f => jobFormSelectNewClient(f, clientId, created?.address))');
    expect(jobForm).toContain('setAddingClient(false)');
    expect(jobFormSelectNewClient({
      title: 'Switchboard',
      client_id: '',
      description: 'Already typed',
      address: '',
    }, 'c-new', '12 Site Rd')).toMatchObject({
      title: 'Switchboard',
      description: 'Already typed',
      client_id: 'c-new',
    });
  });
});

describe('G3 copy site only when the job site is still empty', () => {
  it('reuses jobSiteAddressFromClient through jobFormSelectNewClient', () => {
    expect(jobForm).toContain('jobFormSelectNewClient');
    expect(jobFormSelectNewClient({
      client_id: '',
      address: '',
    }, 'c-new', '12 Site Rd').address).toBe('12 Site Rd');
    expect(jobFormSelectNewClient({
      client_id: '',
      address: 'Warehouse B',
    }, 'c-new', '12 Site Rd').address).toBe('Warehouse B');
  });
});

describe('G4 Cancel returns to the same job card with no client change', () => {
  it('closes only the client sheet and leaves JobForm state alone', () => {
    expect(jobForm).toContain('onClose={() => setAddingClient(false)}');
    const cancel = jobForm.slice(
      jobForm.indexOf('onClose={() => setAddingClient(false)}'),
      jobForm.indexOf('onClose={() => setAddingClient(false)}') + 80,
    );
    expect(cancel).not.toContain('setForm');
    expect(cancel).not.toContain('client_id');
    expect(jobForm).not.toContain('onClose={() => { setAddingClient(false); setForm');
  });
});

describe('G5 Create job from add-client when not mid-job', () => {
  it('keeps existing Save and adds Create job that opens the existing JobForm', () => {
    expect(clientForm).toContain('openedFromJob');
    expect(clientForm).toContain('clientSheetCreateJobVisible');
    expect(clientForm).toContain('showCreateJob');
    expect(clientForm).toContain('Create job');
    expect(clientForm).toContain('handleCreateJob');
    expect(clientForm).toContain('persistClient');
    expect(clientForm).toContain("client ? 'Save Changes' : 'Add Client'");
    expect(clientForm).toContain('navigate(newJobFromClientHref(id))');
    expect(newJobFromClientHref('c-new')).toBe('/jobs?client=c-new');
    expect(clientSheetCreateJobVisible({ isNewClient: true, openedFromJob: false })).toBe(true);
    expect(jobsPage).toContain("searchParams.get('client')");
    expect(jobsPage).toContain('setPresetClientId(clientId)');
    expect(jobsPage).toContain('<JobFormModal');
  });
});

describe('G6 no second Create job when add-client opened from the job card', () => {
  it('passes openedFromJob and hides Create job on that sheet', () => {
    expect(jobForm).toContain('openedFromJob');
    expect(clientForm).toContain('{showCreateJob && (');
    expect(clientSheetCreateJobVisible({ isNewClient: true, openedFromJob: true })).toBe(false);
    const jobClientSheet = jobForm.slice(jobForm.indexOf('<ClientForm'), jobForm.indexOf('/>', jobForm.indexOf('<ClientForm')) + 2);
    expect(jobClientSheet).toContain('openedFromJob');
    expect(jobClientSheet).not.toContain('Create job');
  });
});

describe('G7 isolation — existing sheets only', () => {
  it('does not invent a module, clients page, combined wizard, or /clients trip', () => {
    expect(jobForm).toContain("from '../../pages/ClientsPage'");
    expect(jobForm).not.toContain("navigate('/clients')");
    expect(jobForm).not.toContain('navigate(`/clients');
    expect(clientForm).not.toContain('ClientJobWizard');
    expect(clientForm).not.toContain('hub-clients-document');
    expect(jobForm).not.toContain('QuoteEditorModal');
    expect(jobForm).not.toContain('InvoiceSendDialog');
    expect(jobForm).not.toContain('WeekBoard');
  });
});
