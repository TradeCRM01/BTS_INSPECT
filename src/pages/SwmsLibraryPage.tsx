import { Link } from 'react-router-dom';
import { ChevronLeft, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { JhaSwmsLibraryManager } from '../components/jha/JhaSwmsLibraryManager';

export function SwmsLibraryPage() {
  const { profile } = useAuth();

  return (
    <AppShell>
      <div className="max-w-[900px] mx-auto px-4 py-6">
        <Link
          to="/jha"
          className="inline-flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#2E75B6] mb-4"
        >
          <ChevronLeft size={14} /> JHA documents
        </Link>

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[#1A1A1A] flex items-center gap-2">
            <FileText size={20} className="text-[#0A2540]" />
            Company SWMS library
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Upload Safe Work Method Statement PDFs once for your company. Link them from JHA templates
            and individual JHAs without re-uploading.
          </p>
        </div>

        {profile?.company_id ? (
          <JhaSwmsLibraryManager companyId={profile.company_id} profileId={profile.id} />
        ) : (
          <p className="text-sm text-[#9CA3AF]">Company context required.</p>
        )}
      </div>
    </AppShell>
  );
}
