import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

export interface ListItem {
  id: string;
  value: string;
  label: string;
  sort_order: number;
  archived: boolean;
}

export const LIST_KEYS = {
  storageLocations: 'storage_locations',
  workTypes: 'work_types',
  stockCategories: 'stock_categories',
  assetCategories: 'asset_categories',
  unitsOfMeasure: 'units_of_measure',
  priceBookCategories: 'price_book_categories',
  chargeTypes: 'charge_types',
  documentInclusions: 'document_inclusions',
  documentExclusions: 'document_exclusions',
  expenseCategories: 'expense_categories',
  employeeCostTypes: 'employee_cost_types',
} as const;

export type ListKey = typeof LIST_KEYS[keyof typeof LIST_KEYS];

export function useManagedList(listKey: string) {
  const { profile } = useAuth();
  return useQuery<ListItem[]>({
    queryKey: ['managed-list-items', listKey, profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data: def } = await supabase
        .from('list_definitions')
        .select('id')
        .eq('company_id', profile.company_id)
        .eq('key', listKey)
        .maybeSingle();
      if (!def) return [];
      const { data, error } = await supabase
        .from('list_items')
        .select('id, value, label, sort_order, archived')
        .eq('list_definition_id', def.id)
        .eq('archived', false)
        .order('sort_order', { ascending: true })
        .order('value', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ListItem[];
    },
    enabled: !!profile?.company_id,
    staleTime: 60_000,
  });
}

export function useAddListItem(listKey: string) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: string) => {
      if (!profile?.company_id) throw new Error('No company');
      const { data: def } = await supabase
        .from('list_definitions')
        .select('id, allow_custom')
        .eq('company_id', profile.company_id)
        .eq('key', listKey)
        .maybeSingle();
      if (!def) throw new Error('List not found');
      const { data, error } = await supabase
        .from('list_items')
        .insert({
          company_id: profile.company_id,
          list_definition_id: def.id,
          value: value.trim(),
          label: value.trim(),
        })
        .select('id, value, label, sort_order, archived')
        .single();
      if (error) throw error;
      return data as ListItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-list-items', listKey] });
    },
  });
}

export function useDeleteListItem(listKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('list_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-list-items', listKey] });
      queryClient.invalidateQueries({ queryKey: ['list-items-manage'] });
    },
  });
}
