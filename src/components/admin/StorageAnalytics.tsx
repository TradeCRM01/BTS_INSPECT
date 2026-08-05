import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { HardDrive, TrendingDown, Database, Zap, AlertCircle } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface StorageData {
  company_name: string;
  total_photos: number;
  total_original_bytes: number;
  total_compressed_bytes: number;
  compression_percentage: number;
  archived_photos: number;
  most_recent_photo: string;
}

export function StorageAnalytics() {
  const { profile } = useAuth();
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningCleanup, setRunningCleanup] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ deleted: number; freed_mb: number } | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  async function fetchAnalytics() {
    try {
      setLoading(true);
      const { data: result, error: err } = await supabase
        .from('storage_analytics')
        .select('*')
        .single();

      if (err) throw err;
      setData(result);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch analytics';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCleanup(dryRun = false) {
    try {
      setRunningCleanup(true);
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cleanup-old-photos`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          days_old: 90,
          dry_run: dryRun,
        }),
      });

      if (!response.ok) throw new Error('Cleanup failed');
      const result = await response.json();
      setCleanupResult(result);
      await fetchAnalytics();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Cleanup failed';
      setError(message);
    } finally {
      setRunningCleanup(false);
    }
  }

  if (!profile?.role || profile.role !== 'admin') {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="text-yellow-600 flex-shrink-0" size={20} />
          <p className="text-sm text-yellow-800">Only admins can view storage analytics.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">No storage data available.</p>
      </div>
    );
  }

  const originalMb = data.total_original_bytes / 1024 / 1024;
  const compressedMb = data.total_compressed_bytes / 1024 / 1024;
  const savedMb = originalMb - compressedMb;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Photos */}
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#4A5568] uppercase">Total Photos</span>
            <Database size={16} className="text-[#2E75B6]" />
          </div>
          <p className="text-2xl font-bold text-[#1A1A1A]">{data.total_photos.toLocaleString()}</p>
        </div>

        {/* Storage Used */}
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#4A5568] uppercase">Storage Used</span>
            <HardDrive size={16} className="text-[#2E75B6]" />
          </div>
          <p className="text-2xl font-bold text-[#1A1A1A]">{compressedMb.toFixed(1)} MB</p>
          <p className="text-xs text-[#4A5568] mt-1">Original: {originalMb.toFixed(1)} MB</p>
        </div>

        {/* Compression Savings */}
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#4A5568] uppercase">Saved</span>
            <TrendingDown size={16} className="text-[#1B7F3A]" />
          </div>
          <p className="text-2xl font-bold text-[#1B7F3A]">{savedMb.toFixed(1)} MB</p>
          <p className="text-xs text-[#4A5568] mt-1">{data.compression_percentage?.toFixed(1)}% reduction</p>
        </div>

        {/* Compression Ratio */}
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#4A5568] uppercase">Cost Savings</span>
            <Zap size={16} className="text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-600">
            ${((data.compression_percentage || 0) / 100 * originalMb * 0.025).toFixed(2)}/mo
          </p>
          <p className="text-xs text-[#4A5568] mt-1">vs uncompressed</p>
        </div>
      </div>

      {/* Cleanup section */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">Automated Cleanup</h3>
        <p className="text-xs text-[#4A5568] mb-4">
          Photos older than 90 days will be permanently deleted to reduce storage costs.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => handleCleanup(true)}
            disabled={runningCleanup}
            className="px-3 py-2 text-xs font-medium border border-[#E5E7EB] rounded hover:bg-[#F9FAFB] disabled:opacity-50"
          >
            {runningCleanup ? 'Running...' : 'Preview Cleanup'}
          </button>
          <button
            onClick={() => handleCleanup(false)}
            disabled={runningCleanup}
            className="px-3 py-2 text-xs font-medium bg-[#0A2540] text-white rounded hover:bg-[#0d2f4e] disabled:opacity-50"
          >
            {runningCleanup ? 'Running...' : 'Run Cleanup'}
          </button>
        </div>
      </div>

      {/* Cleanup result */}
      {cleanupResult && (
        <div className="bg-[#1B7F3A]/10 border border-[#1B7F3A]/20 rounded-lg p-4">
          <p className="text-sm font-medium text-[#1B7F3A]">
            Deleted {cleanupResult.deleted} photos, freed {cleanupResult.freed_mb} MB
          </p>
        </div>
      )}

      {/* Last updated */}
      <div className="text-xs text-[#4A5568]">
        Last photo: {data.most_recent_photo ? new Date(data.most_recent_photo).toLocaleDateString() : 'Never'}
      </div>
    </div>
  );
}
