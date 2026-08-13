import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, useToast } from '../components/ui';
import { Plus, Trash2, ArrowUp, ArrowDown, X, ListChecks } from 'lucide-react';

interface ListDef {
  id: string;
  key: string;
  label: string;
  allow_custom: boolean;
}

interface ItemRow {
  id: string;
  value: string;
  label: string;
  sort_order: number;
  archived: boolean;
}

export function ManagedListsSettingsPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data: defs, isLoading, error } = useQuery<ListDef[]>({
    queryKey: ['list-definitions', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('list_definitions')
        .select('id, key, label, allow_custom')
        .eq('company_id', profile!.company_id)
        .order('label');
      if (error) throw error;
      return (data ?? []) as ListDef[];
    },
    enabled: !!profile?.company_id,
  });

  const { data: items } = useQuery<ItemRow[]>({
    queryKey: ['list-items-manage', selectedKey, profile?.company_id],
    queryFn: async () => {
      const def = defs?.find(d => d.key === selectedKey);
      if (!def) return [];
      const { data, error } = await supabase
        .from('list_items')
        .select('id, value, label, sort_order, archived')
        .eq('list_definition_id', def.id)
        .order('sort_order', { ascending: true })
        .order('value', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
    enabled: !!selectedKey && !!defs,
  });

  const addItemMut = useMutation({
    mutationFn: async (value: string) => {
      const def = defs?.find(d => d.key === selectedKey);
      if (!def) throw new Error('List not found');
      const { error } = await supabase.from('list_items').insert({
        company_id: profile!.company_id,
        list_definition_id: def.id,
        value: value.trim(),
        label: value.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list-items-manage', selectedKey] });
      queryClient.invalidateQueries({ queryKey: ['managed-list-items', selectedKey] });
      showToast('Item added');
    },
  });

  const deleteItemMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('list_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list-items-manage', selectedKey] });
      queryClient.invalidateQueries({ queryKey: ['managed-list-items', selectedKey] });
      showToast('Item removed');
    },
  });

  const reorderMut = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      const all = items ?? [];
      const idx = all.findIndex(i => i.id === id);
      if (idx < 0) return;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= all.length) return;
      const a = all[idx];
      const b = all[swapIdx];
      await Promise.all([
        supabase.from('list_items').update({ sort_order: b.sort_order }).eq('id', a.id),
        supabase.from('list_items').update({ sort_order: a.sort_order }).eq('id', b.id),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list-items-manage', selectedKey] });
      queryClient.invalidateQueries({ queryKey: ['managed-list-items', selectedKey] });
    },
  });

  const [newVal, setNewVal] = useState('');

  if (error) return <AppShell><PageError message="Could not load lists" /></AppShell>;

  const selectedDef = defs?.find(d => d.key === selectedKey);

  return (
    <AppShell>
      <div className="page-shell">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[#1A1A1A]">Managed Lists</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">
            Define the options that appear in dropdowns throughout the app. Items you add here become selectable everywhere.
          </p>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4">
            <div className="space-y-1">
              {(defs ?? []).map(def => (
                <button
                  key={def.key}
                  onClick={() => setSelectedKey(def.key)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    selectedKey === def.key
                      ? 'bg-[#0A2540] text-white shadow-sm'
                      : 'text-[#4A5568] hover:bg-white hover:shadow-sm border border-[#E5E7EB]'
                  }`}
                >
                  {def.label}
                </button>
              ))}
              {(!defs || defs.length === 0) && (
                <p className="text-sm text-[#9CA3AF] px-3 py-4">No lists available.</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
              {!selectedKey ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ListChecks size={32} className="text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">Select a list to manage its items</p>
                </div>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#1A1A1A]">{selectedDef?.label}</h2>
                    <span className="text-xs text-[#6B7280] bg-gray-100 px-2 py-0.5 rounded-full">{items?.length ?? 0} items</span>
                  </div>

                  <div className="p-4 border-b border-[#E5E7EB]">
                    <div className="flex items-center gap-2">
                      <input
                        value={newVal}
                        onChange={e => setNewVal(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newVal.trim()) {
                            addItemMut.mutate(newVal);
                            setNewVal('');
                          }
                        }}
                        placeholder="Add a new item..."
                        className="form-input flex-1"
                      />
                      <button
                        onClick={() => {
                          if (newVal.trim()) {
                            addItemMut.mutate(newVal);
                            setNewVal('');
                          }
                        }}
                        disabled={!newVal.trim() || addItemMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50 whitespace-nowrap"
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-[#F3F4F6]">
                    {(items ?? []).map((item, idx) => (
                      <div key={item.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-[#F9FAFB]">
                        <span className="text-sm text-[#1A1A1A]">{item.label || item.value}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => reorderMut.mutate({ id: item.id, direction: 'up' })}
                            disabled={idx === 0}
                            className="w-7 h-7 flex items-center justify-center rounded text-[#6B7280] hover:bg-gray-200 disabled:opacity-30"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            onClick={() => reorderMut.mutate({ id: item.id, direction: 'down' })}
                            disabled={idx === (items?.length ?? 0) - 1}
                            className="w-7 h-7 flex items-center justify-center rounded text-[#6B7280] hover:bg-gray-200 disabled:opacity-30"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            onClick={() => deleteItemMut.mutate(item.id)}
                            className="w-7 h-7 flex items-center justify-center rounded text-red-500 hover:bg-red-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {(!items?.length) && (
                      <div className="px-4 py-8 text-center text-sm text-[#9CA3AF]">
                        No items yet. Add your first one above.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
