import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { canViewTemplates } from '../../lib/templateAccess';
import { TemplateAccessDenied } from './TemplateAccessDenied';

export function TemplateAccessRoute({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  if (!canViewTemplates(profile)) {
    return <TemplateAccessDenied />;
  }
  return <>{children}</>;
}
