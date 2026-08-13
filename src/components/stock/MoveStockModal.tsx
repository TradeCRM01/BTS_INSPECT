import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ManagedSelect } from '../ui/ManagedSelect';
import { LIST_KEYS } from '../../lib/useManagedList';
import { OverlayPortal } from '../ui/OverlayPortal';
import { LoadingSpinner, useToast } from '../ui';
import { locationLabel } from '../../lib/stockLocations';
import type { StockItem } from '../../types/fsm';

export interface MoveStockTarget {
  id: string;
  name: string;
  storage_location: string | null;
}

interface MoveStockModalProps {
  items: MoveStockTarget[];
  onClose: () => void;
  onMoved?: () => void;
}

export function MoveStockModal({ items, onClose, onMoved }: MoveStockModalProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [destination, setDestination] = useState('');
  const [error, setError] = useState('');

  const moveMutation = useMutation({
    mutationFn: async (dest: string) => {
      if (!profile?.company_id) throw new Error('Missing company');
      const destValue = dest.trim() || null;
      const destLabel = locationLabel(destValue);

      for (const item of items) {
        const fromLabel = locationLabel(item.storage_location);
        if ((item.storage_location ?? '').trim() === (destValue ?? '')) continue;

        const { error: uErr } = await supabase
          .from('stock_items')
          .update({ storage_location: destValue, updated_at: new Date().toISOString() })
          .eq('id', item.id);
        if (uErr) throw uErr;

        const { error: mErr } = await supabase.from('stock_movements').insert({
          company_id: profile.company_id,
          stock_item_id: item.id,
          movement_type: 'transferred',
          quantity: 0,
          reason: `Moved from ${fromLabel} â†’ ${destLabel}`,
          created_by: profile.id,
        });
        if (mErr) throw mErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      const n = items.length;
      showToast(n === 1 ? `Moved ${items[0].name}` : `Moved ${n} items`);
      onMoved?.();
      onClose();
    },
    onError: (err: Error) => setError(err.message || 'Move failed'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const destTrim = destination.trim();
    const same = items.every(
      (i) => (i.storage_location ?? '').trim() === destTrim
    );
    if (same) {
      setError('Items are already in that drive');
      return;
    }
    moveMutation.mutate(destination);
  }

  const title = items.length === 1
    ? `Move ${items[0].name}`
    : `Move ${items.length} items`;

  return (
    <OverlayPortal>
      <div className="overlay-backdrop">
        <div className="overlay-panel-sm border border-[#E5E7EB]" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
            <div className="flex items-center gap-2">
              <ArrowRightLeft size={16} className="text-[#2E75B6]" />
              <h2 className="text-base font-semibold text-[#1A1A1A]">{title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            {items.length === 1 ? (
              <p className="text-sm text-[#4A5568]">
                Currently in <span className="font-medium text-[#1A1A1A]">{locationLabel(items[0].storage_location)}</span>
              </p>
            ) : (
              <ul className="text-sm text-[#4A5568] max-h-32 overflow-y-auto space-y-1 border border-[#E5E7EB] rounded-md p-3 bg-[#F9FAFB]">
                {items.map((i) => (
                  <li key={i.id} className="truncate">
                    <span className="font-medium text-[#1A1A1A]">{i.name}</span>
                    <span className="text-[#9CA3AF]"> Â· {locationLabel(i.storage_location)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Destination drive</label>
              <ManagedSelect
                listKey={LIST_KEYS.storageLocations}
                value={destination}
                onChange={setDestination}
                placeholder="Select drive..."
                noneLabel="Unassigned"
                allowAdd
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-[#E5E7EB] rounded-md text-sm font-medium text-[#4A5568] hover:bg-[#F9FAFB]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={moveMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-[#0A2540] text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50"
              >
                {moveMutation.isPending ? <LoadingSpinner size="sm" /> : <ArrowRightLeft size={14} />}
                {moveMutation.isPending ? 'Movingâ€¦' : 'Move'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </OverlayPortal>
  );
}

/** Narrow StockItem-like rows to MoveStockTarget */
export function toMoveTargets(items: Pick<StockItem, 'id' | 'name' | 'storage_location'>[]): MoveStockTarget[] {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    storage_location: i.storage_location,
  }));
}
