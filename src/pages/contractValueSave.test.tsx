/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECIMAL_INVALID, MONEY_COMMA_HINT } from '../lib/parseDecimal';
import { commitContractValue } from './ContractsPage';

const harness = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  profile: { company_id: 'co-1', id: 'user-1', name: 'QA', role: 'admin' },
  company: { id: 'co-1', name: 'QA Co' },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: harness.profile,
    company: harness.company,
  }),
}));

vi.mock('../lib/supabase', () => {
  function clientsQuery() {
    const result = {
      data: [{ id: 'cl-1', name: 'Northside Electrical' }],
      error: null,
    };
    const query = {
      select() { return query; },
      eq() { return query; },
      order() { return Promise.resolve(result); },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  function contractsQuery() {
    return {
      insert(payload: Record<string, unknown>) {
        harness.inserts.push(payload);
        return Promise.resolve({ error: null });
      },
    };
  }

  return {
    supabase: {
      from(table: string) {
        if (table === 'clients') return clientsQuery();
        if (table === 'service_contracts') return contractsQuery();
        return { select() { return { eq() { return Promise.resolve({ data: [], error: null }); } }; } };
      },
    },
  };
});

import { ContractForm } from './ContractsPage';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.inserts = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderForm() {
  await act(async () => {
    root.render(
      <ContractForm
        contract={null}
        creating={false}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
  });
  await flush();
}

async function fillRequired() {
  const title = container.querySelector('input[placeholder="e.g. Annual Maintenance Agreement"]') as HTMLInputElement;
  const client = container.querySelector('select') as HTMLSelectElement;
  const next = container.querySelector('#contract-next-service-date') as HTMLInputElement;
  await act(async () => {
    setNativeValue(title, 'Annual service');
    setNativeValue(client, 'cl-1');
    next.focus();
    setNativeValue(next, '01/11/2026');
    next.blur();
    next.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

async function typeValueAndSave(raw: string) {
  const value = container.querySelector('input[name="contract_value"]') as HTMLInputElement;
  await act(async () => {
    setNativeValue(value, raw);
  });
  const form = container.querySelector('form') as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await flush();
  return value.value;
}

describe('commitContractValue', () => {
  it('rejects abc and 1,5, and commits 1,250 as 1250', () => {
    expect(commitContractValue('abc')).toEqual({ ok: false, message: DECIMAL_INVALID });
    expect(commitContractValue('1,5')).toEqual({ ok: false, message: MONEY_COMMA_HINT });
    expect(commitContractValue('1,5')).not.toEqual({ ok: true, value: 15 });
    expect(commitContractValue('1,250')).toEqual({ ok: true, value: 1250 });
  });
});

describe('Contract Value field save', () => {
  it('wires the form through commitContractValue, not Number or ?? 0', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/ContractsPage.tsx'), 'utf8');
    expect(page).toContain('commitContractValue(form.contract_value)');
    expect(page).toContain('contract_value: money.value');
    expect(page).not.toContain('committedMoney(form.contract_value) ?? 0');
    expect(page).not.toMatch(/contract_value:\s*Number\(/);
    expect(page).not.toMatch(/contract_value:[\s\S]{0,40}replace\(.*,.*\)/);
  });

  it('types abc and does not save $0', async () => {
    await renderForm();
    await fillRequired();
    const shown = await typeValueAndSave('abc');
    expect(shown).toBe('abc');
    expect(harness.inserts).toEqual([]);
    expect(container.textContent).toContain(DECIMAL_INVALID);
  });

  it('shows the comma hint while typing, before Save', async () => {
    await renderForm();
    const value = container.querySelector('input[name="contract_value"]') as HTMLInputElement;
    await act(async () => {
      setNativeValue(value, '1,5');
    });
    expect(value.value).toBe('1,5');
    expect(container.textContent).toContain(MONEY_COMMA_HINT);
    expect(harness.inserts).toEqual([]);
  });

  it('types 1,5 and does not save 15', async () => {
    await renderForm();
    await fillRequired();
    const shown = await typeValueAndSave('1,5');
    expect(shown).toBe('1,5');
    expect(harness.inserts).toEqual([]);
    expect(container.textContent).toContain(MONEY_COMMA_HINT);
    expect(harness.inserts.some(row => row.contract_value === 15)).toBe(false);
  });

  it('types 1,250 and saves 1250', async () => {
    await renderForm();
    await fillRequired();
    const shown = await typeValueAndSave('1,250');
    expect(shown).toBe('1,250');
    expect(harness.inserts).toHaveLength(1);
    expect(harness.inserts[0].contract_value).toBe(1250);
  });
});
