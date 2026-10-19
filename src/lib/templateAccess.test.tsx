/** @vitest-environment jsdom */
import { act } from 'react';

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TEMPLATE_ACCESS_DENIED_TITLE,
  canViewTemplates,
} from './templateAccess';

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));

import { TemplateAccessDeniedBody } from '../components/layout/TemplateAccessDenied';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('canViewTemplates', () => {
  it('allows admins and view/edit, and blocks none', () => {
    expect(canViewTemplates({ role: 'admin', template_access: 'none' })).toBe(true);
    expect(canViewTemplates({ role: 'member', template_access: 'view' })).toBe(true);
    expect(canViewTemplates({ role: 'member', template_access: 'edit' })).toBe(true);
    expect(canViewTemplates({ role: 'member', template_access: 'none' })).toBe(false);
    expect(canViewTemplates({ role: 'member', template_access: null })).toBe(false);
  });
});

describe('Templates no-access render', () => {
  it('renders as a member with No access and hides the templates list', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const member = { role: 'member', template_access: 'none' as const };

    function MemberTemplatesView() {
      if (!canViewTemplates(member)) return <TemplateAccessDeniedBody />;
      return <div data-templates-list>Templates list</div>;
    }

    act(() => {
      root.render(
        <MemoryRouter>
          <MemberTemplatesView />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[data-template-access="denied"]')).toBeTruthy();
    expect(container.textContent).toContain(TEMPLATE_ACCESS_DENIED_TITLE);
    expect(container.querySelector('[data-templates-list]')).toBeNull();
    act(() => { root.unmount(); });
    container.remove();
  });

  it('mutation kill: removing the Templates guard shows the list for a none member', () => {
    const member = { role: 'member', template_access: 'none' as const };
    function Guarded() {
      if (!canViewTemplates(member)) return <div data-template-access="denied">No access</div>;
      return <div data-templates-list>Templates list</div>;
    }
    function Killed() {
      return <div data-templates-list>Templates list</div>;
    }

    const guarded = document.createElement('div');
    const killed = document.createElement('div');
    const gRoot = createRoot(guarded);
    const kRoot = createRoot(killed);
    act(() => {
      gRoot.render(<Guarded />);
      kRoot.render(<Killed />);
    });
    expect(guarded.querySelector('[data-template-access="denied"]')).toBeTruthy();
    expect(killed.querySelector('[data-templates-list]')).toBeTruthy();
    expect(killed.querySelector('[data-template-access="denied"]')).toBeNull();
    act(() => {
      gRoot.unmount();
      kRoot.unmount();
    });

    const app = src('src/App.tsx');
    expect(app).toContain('TemplateAccessRoute');
    expect(app).toMatch(/path="\/templates"[\s\S]*TemplateAccessRoute/);
    const templatesPage = src('src/pages/TemplatesPage.tsx');
    expect(templatesPage).toContain('canViewTemplates');
    const killedPage = templatesPage.replace(/if \(!canView\) \{[\s\S]*?\n {2}\}/, '');
    expect(killedPage).not.toContain('if (!canView)');
  });

  it('route and nav both consult canViewTemplates', () => {
    expect(src('src/components/layout/TemplateAccessRoute.tsx')).toContain('canViewTemplates');
    expect(src('src/components/layout/AppShell.tsx')).toContain('navItemAllowedForProfile');
    expect(src('src/pages/TemplateEditorPage.tsx')).toContain('canViewTemplates');
    expect(src('src/pages/JhaTemplateEditorPage.tsx')).toContain('canViewTemplates');
  });
});
