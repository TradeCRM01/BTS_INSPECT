/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_AU_PHONE, FIELD_EMAIL, FIELD_NAME_REQUIRED } from '../lib/fieldValidation';
import { ClientForm } from './ClientsPage';

const harness = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; op: string; payload: unknown }>,
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
          return { eq: async () => ({ error: null }) };
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

async function renderForm() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ClientForm client={null} onClose={() => {}} onSaved={() => {}} />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.writes = [];
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
});
