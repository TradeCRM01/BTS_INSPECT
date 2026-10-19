import { LayoutTemplate } from 'lucide-react';
import {
  TEMPLATE_ACCESS_DENIED_BODY,
  TEMPLATE_ACCESS_DENIED_TITLE,
} from '../../lib/templateAccess';
import { AppShell } from './AppShell';

export function TemplateAccessDeniedBody() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-16 text-center" data-template-access="denied">
      <LayoutTemplate size={40} className="mx-auto text-[#E5E7EB] mb-3" />
      <p className="text-[#1A1A1A] font-medium">{TEMPLATE_ACCESS_DENIED_TITLE}</p>
      <p className="text-sm text-[#4A5568] mt-1">{TEMPLATE_ACCESS_DENIED_BODY}</p>
    </div>
  );
}

export function TemplateAccessDenied() {
  return (
    <AppShell>
      <TemplateAccessDeniedBody />
    </AppShell>
  );
}
