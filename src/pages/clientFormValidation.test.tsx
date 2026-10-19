/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_AU_PHONE, FIELD_EMAIL, FIELD_NAME_REQUIRED, FIELD_SAVE_MISS } from '../lib/fieldValidation';
import { ClientForm } from './ClientsPage';

const harness = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; op: string; payload: unknown }>,
  updateResult: { data: [{ id: 'c-edit' }] as unknown, error: null as unknown },
  savedIds: [] as string[],
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table: string) {
      return {
        insert(payload: unknown) {
          harness.writes.push({ table, op: 'insert', payload });
          return {
            select() {
              return {
                single: async () => ({ data: { id: 'c-new' }, error: null }),
              };
            },
          };
        },
        update(payload: unknown) {
          harness.writes.push({ table, op: 'update', payload });
          const row: Record<string, unknown> = {
            eq() { return row; },
            select() { return row; },
            then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
              return Promise.resolve(harness.updateResult).then(onFulfilled, onRejected);
            },
          };
          return row;
        },
      };
    },
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'u1', company_id: 'co1', role: 'admin' },
  }),
}));

let container: HTMLDivElement;
let root: Root;

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function renderForm(client: Parameters<typeof ClientForm>[0]['client'] = null) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ClientForm client={client} onClose={() => {}} onSaved={(id) => { harness.savedIds.push(id); }} />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.writes = [];
  harness.updateResult = { data: [{ id: 'c-edit' }], error: null };
  harness.savedIds = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ClientForm field validation', () => {
  it('blocks Add Client when phone and email are junk and shows inline errors', async () => {
    await renderForm();
    const name = container.querySelector('#client-form-name') as HTMLInputElement;
    const phone = container.querySelector('#client-form-phone') as HTMLInputElement;
    const email = container.querySelector('#client-form-email') as HTMLInputElement;
    expect(name).toBeTruthy();
    await act(async () => {
      setInput(name, 'B4a Throwaway');
      setInput(phone, 'abc');
      setInput(email, 'not-an-email');
    });
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Add Client'));
    expect(save).toBeTruthy();
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes).toEqual([]);
    expect(container.textContent).toContain(FIELD_AU_PHONE);
    expect(container.textContent).toContain(FIELD_EMAIL);
    expect(container.querySelector('#client-form-phone-error')?.textContent).toBe(FIELD_AU_PHONE);
    expect(container.querySelector('#client-form-email-error')?.textContent).toBe(FIELD_EMAIL);
  });

  it('blocks a blank name next to the name field', async () => {
    await renderForm();
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Add Client'));
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes).toEqual([]);
    expect(container.querySelector('#client-form-name-error')?.textContent).toBe(FIELD_NAME_REQUIRED);
  });

  it('writes a trimmed valid client and marks a junk phone aria-invalid', async () => {
    await renderForm();
    const name = container.querySelector('#client-form-name') as HTMLInputElement;
    const phone = container.querySelector('#client-form-phone') as HTMLInputElement;
    const email = container.querySelector('#client-form-email') as HTMLInputElement;
    await act(async () => {
      setInput(phone, 'abc');
    });
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Add Client'));
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(phone.getAttribute('aria-invalid')).toBe('true');
    expect(phone.getAttribute('aria-describedby')).toBe('client-form-phone-error');
    expect(harness.writes).toEqual([]);

    await act(async () => {
      setInput(name, 'Acme Plumbing');
      setInput(phone, '  0400 000 000  ');
      setInput(email, 'jane@acme.com.au');
    });
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes).toEqual([{
      table: 'clients',
      op: 'insert',
      payload: {
        name: 'Acme Plumbing',
        contact_person: null,
        phone: '0400 000 000',
        email: 'jane@acme.com.au',
        address: null,
        notes: null,
        company_id: 'co1',
      },
    }]);
    expect(phone.getAttribute('aria-invalid')).toBeNull();
  });

  it('blocks a 16-digit phone and a@b on the client form', async () => {
    await renderForm();
    const name = container.querySelector('#client-form-name') as HTMLInputElement;
    const phone = container.querySelector('#client-form-phone') as HTMLInputElement;
    const email = container.querySelector('#client-form-email') as HTMLInputElement;
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Add Client'));
    await act(async () => {
      setInput(name, 'Acme');
      setInput(phone, '0400000000123456');
      setInput(email, 'a@b');
    });
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes).toEqual([]);
    expect(container.querySelector('#client-form-phone-error')?.textContent).toBe(FIELD_AU_PHONE);
    expect(container.querySelector('#client-form-email-error')?.textContent).toBe(FIELD_EMAIL);
  });

  it('shows an inline miss when client update writes 0 rows and does not treat it as saved', async () => {
    harness.updateResult = { data: [], error: null };
    await renderForm({
      id: 'c-edit',
      company_id: 'co1',
      name: 'Acme Plumbing',
      contact_person: null,
      phone: '0400 000 000',
      email: 'jane@acme.com.au',
      address: null,
      notes: null,
      archived: false,
      created_at: '2026-08-24T00:00:00.000Z',
    });
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.writes).toEqual([{
      table: 'clients',
      op: 'update',
      payload: {
        name: 'Acme Plumbing',
        contact_person: null,
        phone: '0400 000 000',
        email: 'jane@acme.com.au',
        address: null,
        notes: null,
      },
    }]);
    expect(container.textContent).toContain(FIELD_SAVE_MISS);
    expect(container.textContent).not.toContain('Saved');
    expect(harness.savedIds).toEqual([]);
  });
});
