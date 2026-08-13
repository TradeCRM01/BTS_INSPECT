import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { format, parseISO } from 'date-fns';
import {
  ScanLine, Camera, Search, Package, Plus, Minus, Check, X,
  AlertCircle, History, Trash2, ArrowRight,
} from 'lucide-react';
import type { StockItem, StockItemWithSupplier } from '../types/fsm';
import { getStockLevel, STOCK_LEVEL_STYLES, STOCK_LEVEL_LABELS, formatMoney } from '../types/fsm';

export function BarcodeScannerPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanResult, setScanResult] = useState<{ matched: boolean; item?: StockItemWithSupplier; barcode: string } | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const { data: stockItems } = useQuery({
    queryKey: ['stock-items-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_items')
        .select('*, suppliers!supplier_id(name)')
        .eq('company_id', profile!.company_id)
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as StockItemWithSupplier[];
    },
    enabled: !!profile,
  });

  const { data: scanLogs } = useQuery({
    queryKey: ['scan-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('barcode_scan_logs')
        .select(`
          id, barcode, scan_type, matched, created_at, metadata,
          stock_items!left(id, name, sku)
        `)
        .eq('company_id', profile!.company_id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const logScanMutation = useMutation({
    mutationFn: async ({ barcode, matched, itemId }: { barcode: string; matched: boolean; itemId?: string }) => {
      const { error } = await supabase.from('barcode_scan_logs').insert({
        company_id: profile!.company_id,
        stock_item_id: itemId ?? null,
        scanned_by: profile!.id,
        barcode,
        matched,
        scan_type: 'lookup',
      });
      if (error) throw error;
    },
  });

  const updateStockMutation = useMutation({
    mutationFn: async ({ itemId, newQty }: { itemId: string; newQty: number }) => {
      const { error } = await supabase
        .from('stock_items')
        .update({ quantity: Math.max(0, newQty), updated_at: new Date().toISOString() })
        .eq('id', itemId)
        .eq('company_id', profile!.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items-all'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });

  function handleBarcodeLookup(barcode: string) {
    if (!barcode.trim() || !stockItems) return;
    const trimmed = barcode.trim();

    // Match by SKU or barcode field
    const match = stockItems.find(item =>
      item.sku?.toLowerCase() === trimmed.toLowerCase() ||
      item.barcode?.toLowerCase() === trimmed.toLowerCase() ||
      item.name.toLowerCase().includes(trimmed.toLowerCase())
    );

    setScanResult({
      matched: !!match,
      item: match,
      barcode: trimmed,
    });
    setAdjustQty(0);

    logScanMutation.mutate({
      barcode: trimmed,
      matched: !!match,
      itemId: match?.id,
    });
  }

  function handleAdjustStock() {
    if (!scanResult?.item) return;
    const currentQty = scanResult.item.quantity ?? 0;
    const newQty = currentQty + adjustQty;
    updateStockMutation.mutate(
      { itemId: scanResult.item.id, newQty },
      {
        onSuccess: () => {
          setScanResult({
            ...scanResult,
            item: { ...scanResult.item!, quantity: Math.max(0, newQty) },
          });
          setAdjustQty(0);
        },
      }
    );
  }

  // Camera barcode scanning using BarcodeDetector API
  async function startCamera() {
    setCameraError(null);
    try {
      if (!('BarcodeDetector' in window)) {
        setCameraError('Barcode detection is not supported in this browser. Use manual entry instead.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);

      // @ts-expect-error â€” BarcodeDetector is not in standard TS types
      const detector = new window.BarcodeDetector({ formats: ['code_39', 'code_128', 'ean_13', 'qr_code'] });
      const detect = async () => {
        if (!videoRef.current || !cameraActive) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length > 0) {
            const value = codes[0].rawValue;
            handleBarcodeLookup(value);
            stopCamera();
            return;
          }
        } catch { /* detection frame failed, try again */ }
        if (cameraActive) requestAnimationFrame(detect);
      };
      detect();
    } catch {
      setCameraError('Could not access camera. Check permissions or use manual entry.');
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const recentScans = useMemo(() => (scanLogs ?? []).slice(0, 10), [scanLogs]);

  if (!profile) return <AppShell><PageError message="Not authenticated" /></AppShell>;

  return (
    <AppShell>
      <div className="page-shell">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[#1A1A1A]">Barcode Scanner</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">Scan barcodes to look up stock items and adjust quantities</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          {/* Scanner section */}
          <div className="space-y-4">
            {/* Camera viewfinder */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
              <div className="relative bg-black aspect-video flex items-center justify-center">
                {cameraActive ? (
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                ) : (
                  <div className="flex flex-col items-center text-white/40">
                    <ScanLine size={48} className="mb-2" />
                    <p className="text-sm">Camera preview will appear here</p>
                  </div>
                )}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-3/4 h-1/2 border-2 border-white/60 rounded-lg" />
                  </div>
                )}
              </div>
              <div className="p-4 flex items-center gap-2">
                {!cameraActive ? (
                  <button onClick={startCamera}
                    className="flex items-center gap-2 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] flex-1 justify-center">
                    <Camera size={16} /> Start Camera Scan
                  </button>
                ) : (
                  <button onClick={stopCamera}
                    className="flex items-center gap-2 bg-[#B42318] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#912018] flex-1 justify-center">
                    <X size={16} /> Stop Camera
                  </button>
                )}
              </div>
            </div>

            {cameraError && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">{cameraError}</p>
              </div>
            )}

            {/* Manual entry */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4">
              <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">Manual Entry</h2>
              <form onSubmit={(e) => { e.preventDefault(); handleBarcodeLookup(manualBarcode); }} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    value={manualBarcode}
                    onChange={e => setManualBarcode(e.target.value)}
                    placeholder="Enter barcode or SKU..."
                    className="w-full h-9 pl-9 pr-3 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                  />
                </div>
                <button type="submit" className="flex items-center gap-1.5 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e]">
                  <ArrowRight size={16} /> Lookup
                </button>
              </form>
            </div>

            {/* Scan result */}
            {scanResult && (
              <div className={`rounded-xl border shadow-sm p-4 ${scanResult.matched ? 'bg-white border-green-300' : 'bg-amber-50 border-amber-300'}`}>
                {scanResult.matched && scanResult.item ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                        <Check size={20} className="text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1A1A1A]">{scanResult.item.name}</p>
                        <p className="text-xs text-[#6B7280]">SKU: {scanResult.item.sku ?? 'â€”'} Â· Barcode: {scanResult.barcode}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="text-center p-2 rounded-lg bg-gray-50">
                        <p className="text-xs text-[#6B7280]">Current Qty</p>
                        <p className="text-lg font-bold text-[#1A1A1A]">{scanResult.item.quantity ?? 0}</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-gray-50">
                        <p className="text-xs text-[#6B7280]">Unit Cost</p>
                        <p className="text-lg font-bold text-[#1A1A1A]">{formatMoney(Number(scanResult.item.unit_cost ?? 0))}</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-gray-50">
                        <p className="text-xs text-[#6B7280]">Stock Level</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STOCK_LEVEL_STYLES[getStockLevel(scanResult.item)]}`}>
                          {STOCK_LEVEL_LABELS[getStockLevel(scanResult.item)]}
                        </span>
                      </div>
                    </div>

                    {/* Quantity adjustment */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#E5E7EB]">
                      <span className="text-sm text-[#4A5568]">Adjust quantity:</span>
                      <button onClick={() => setAdjustQty(q => q - 1)} className="p-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#F9FAFB] text-[#4A5568]"><Minus size={16} /></button>
                      <span className="text-sm font-semibold text-[#1A1A1A] w-12 text-center">{adjustQty > 0 ? `+${adjustQty}` : adjustQty}</span>
                      <button onClick={() => setAdjustQty(q => q + 1)} className="p-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#F9FAFB] text-[#4A5568]"><Plus size={16} /></button>
                      <button
                        onClick={handleAdjustStock}
                        disabled={adjustQty === 0 || updateStockMutation.isPending}
                        className="ml-auto flex items-center gap-1.5 bg-[#0A2540] text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50"
                      >
                        <Check size={14} /> Apply
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                      <X size={20} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-amber-900">No match found</p>
                      <p className="text-xs text-amber-700">Barcode "{scanResult.barcode}" did not match any stock item</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recent scans sidebar */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E5E7EB]">
              <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-1.5"><History size={15} /> Recent Scans</h2>
            </div>
            {recentScans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Package size={28} className="text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No scans yet</p>
              </div>
            ) : (
              <div className="divide-y divide-[#F3F4F6] max-h-[500px] overflow-y-auto">
                {recentScans.map((log: {
                  id: string; barcode: string; matched: boolean; created_at: string;
                  stock_items: { id: string; name: string; sku: string | null } | null;
                }) => (
                  <div key={log.id} className="px-4 py-3 hover:bg-[#F9FAFB] transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1A1A1A] truncate">
                          {log.stock_items?.name ?? log.barcode}
                        </p>
                        <p className="text-xs text-[#6B7280]">{format(parseISO(log.created_at), 'dd MMM, HH:mm')}</p>
                      </div>
                      {log.matched ? (
                        <Check size={14} className="text-green-600 shrink-0" />
                      ) : (
                        <X size={14} className="text-amber-500 shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
