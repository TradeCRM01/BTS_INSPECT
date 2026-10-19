import type { ReactNode } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { memberCanViewTemplates } from './fieldValidation';

export function TemplatesNoAccessPanel() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-16 text-center">
      <LayoutTemplate size={40} className="mx-auto text-[#E5E7EB] mb-3" />
      <p className="text-[#1A1A1A] font-medium">No template access</p>
      <p className="text-sm text-[#4A5568] mt-1">Your account doesn't have permission to view templates. Contact your admin.</p>
    </div>
  );
}

export function TemplatesAccessGate({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  if (!memberCanViewTemplates(profile)) {
    return (
      <AppShell>
        <TemplatesNoAccessPanel />
      </AppShell>
    );
  }
  return <>{children}</>;
}
