/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appRouter, createAppRouter } from '../../main';

function Boom(): React.ReactElement {
  throw new Error('boom-route');
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('router errorElement', () => {
  it('E1: a throwing route renders the app crash screen from the main.tsx router', async () => {
    expect(appRouter.routes[0]?.errorElement).toBeTruthy();
    const router = createAppRouter(<Boom />);

    await act(async () => {
      root.render(<RouterProvider router={router} />);
    });
    expect(document.body.textContent).toContain('Something went wrong');
    expect(document.body.textContent).toContain('boom-route');
    expect(document.body.textContent).toContain('Clear cache & open login');
    expect(document.body.textContent).not.toContain('Unexpected Application Error');
  });
});
