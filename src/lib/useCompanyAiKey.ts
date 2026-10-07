import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchAiSettings } from './aiSettingsClient';
import { isDevFieldAuditAuth } from './devFieldAuditAuth';

/** True when the company has its own Anthropic key (not platform env fallback). */
export function useCompanyAiKey(): { ready: boolean; hasKey: boolean } {
  const { profile } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['company-ai-key', profile?.company_id],
    queryFn: async () => {
      const settings = await fetchAiSettings();
      return settings.keySet === true;
    },
    enabled: !!profile?.company_id,
    staleTime: 60_000,
  });

  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('look')?.startsWith('expense1') && params.get('expenseNoAi') === '1') {
        return { ready: true, hasKey: false };
      }
    } catch {
      // optional look override
    }
  }

  if (isDevFieldAuditAuth()) {
    return { ready: true, hasKey: true };
  }

  return {
    ready: !isLoading && data !== undefined,
    hasKey: data === true,
  };
}
