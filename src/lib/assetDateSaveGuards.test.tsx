/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ToastProvider } from '../components/ui/Toast';
import { AssetForm, AssetsPage } from '../pages/AssetsPage';
import { DATE_YEAR_RANGE_MESSAGE, HOTFIX_BAD_DATE_ISO, SAFE_DATE_FALLBACK } from './safeDate';

const { writes, chain } = vi.hoisted(() => {
  const writes: unknown[] = [];
  function rowsFor(table: string) {
    if (table === 'clients') return [{ id: 'cl-1', name: 'Northside', archived: false }];
    if (table === 'assets') {
      return [{
        id: 'asset-bad',
        company_id: 'co-1',
        client_id: 'cl-1',
        name: 'Bad year asset',
        asset_tag: null,
        serial_number: null,
        manufacturer: null,
        model: null,
        category: null,
        location_description: null,
        install_date: '212026-01-01',
        warranty_expiry: '212026-02-11',
        status: 'active',
        notes: null,
        created_at: '2026-10-19T00:00:00.000Z',
        updated_at: '2026-10-19T00:00:00.000Z',
      }];
    }
    return [];
  }
  function chain(table: string) {
    const result = Promise.resolve({ data: rowsFor(table), error: null });
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      in: () => q,
      insert: (row: unknown) => {
        writes.push({ table, row });
        return Promise.resolve({ error: null });
      },
      update: (row: unknown) => {
        writes.push({ table, row });
        return {
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      },
      maybeSingle: () => result,
      single: () => Promise.resolve({ data: rowsFor(table)[0] ?? { id: 'row-1' }, error: null }),
      then: result.then.bind(result),
    };
    return q;
  }
  return { writes, chain };
});

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => chain(table),
  },
}));

const auth = {
  profile: { id: 'emp-1', company_id: 'co-1', name: 'QA' },
  company: { name: 'Grafter' },
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('./devFieldAuditAuth', () => ({
  isDevFieldAuditAuth: () => false,
  pageQueryBlocked: () => false,
}));

vi.mock('../components/ui/ManagedSelect', () => ({
  ManagedSelect: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input data-testid="asset-category" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

vi.mock('../components/ui/OverlayPortal', () => ({
  OverlayPortal: ({ children }: { children: ReactNode }) => children,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  writes.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function providers(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function setInput(el: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  proto?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function setNamedDate(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (!input) throw new Error(`missing ${id}`);
  await act(async () => {
    setInput(input, value);
  });
}

function clickSave() {
  const form = document.querySelector('form');
  if (!form) throw new Error('missing form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('Assets uses safeDate', () => {
  it('imports dateFieldYearError and safeFormatDate from the single helper', () => {
    const src = readFileSync('src/pages/AssetsPage.tsx', 'utf8');
    expect(src).toContain("import { dateFieldYearError, parseToDate, safeFormatDate } from '../lib/safeDate'");
    expect(src).toContain('dateFieldYearError(form.install_date, false)');
    expect(src).toContain('dateFieldYearError(form.warranty_expiry, false)');
    expect(src).toContain("safeFormatDate(asset.warranty_expiry, 'd MMM yyyy')");
    expect(src).not.toContain('parseISO');
  });
});

describe('AssetForm never writes null on a bad date', () => {
  it('blocks install 212026 and writes nothing', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(<AssetForm asset={null} onClose={() => {}} onSaved={onSaved} />));
    });
    await act(async () => { await Promise.resolve(); });
    const name = document.querySelector('input[placeholder="e.g. Main Switchboard"]') as HTMLInputElement;
    await act(async () => { setInput(name, 'Probe asset'); });
    await setNamedDate('asset-install-date', HOTFIX_BAD_DATE_ISO);
    await act(async () => { clickSave(); });
    expect(writes).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_YEAR_RANGE_MESSAGE);
  });

  it('blocks warranty 2101-01-01 and writes nothing', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(<AssetForm asset={null} onClose={() => {}} onSaved={onSaved} />));
    });
    await act(async () => { await Promise.resolve(); });
    const name = document.querySelector('input[placeholder="e.g. Main Switchboard"]') as HTMLInputElement;
    await act(async () => { setInput(name, 'Probe asset'); });
    await setNamedDate('asset-warranty-expiry', '2101-01-01');
    await act(async () => { clickSave(); });
    expect(writes).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_YEAR_RANGE_MESSAGE);
  });

  it('saves a year-in-range warranty and does not write null', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(<AssetForm asset={null} onClose={() => {}} onSaved={onSaved} />));
    });
    await act(async () => { await Promise.resolve(); });
    const name = document.querySelector('input[placeholder="e.g. Main Switchboard"]') as HTMLInputElement;
    await act(async () => { setInput(name, 'Probe asset'); });
    await setNamedDate('asset-warranty-expiry', '2100-12-31');
    await act(async () => { clickSave(); });
    expect(writes).toHaveLength(1);
    const row = (writes[0] as { row: { warranty_expiry: string | null; install_date: string | null } }).row;
    expect(row.warranty_expiry).toBe('2100-12-31');
    expect(row.install_date).toBeNull();
  });
});

describe('AssetForm name required', () => {
  it('does not write when the name is blank', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(<AssetForm asset={null} onClose={() => {}} onSaved={onSaved} />));
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { clickSave(); });
    expect(writes).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Name is required.');
  });
});

describe('Assets list display', () => {
  it('renders 212026 warranty as an em dash and does not crash', async () => {
    await act(async () => {
      root.render(providers(<AssetsPage />));
    });
    await act(async () => {
      for (let i = 0; i < 20 && !document.body.textContent?.includes('Bad year asset'); i += 1) {
        await Promise.resolve();
      }
    });
    expect(document.body.textContent).toContain('Bad year asset');
    expect(document.body.textContent).not.toContain('212026');
    expect(document.body.textContent).toContain(SAFE_DATE_FALLBACK);
  });
});
