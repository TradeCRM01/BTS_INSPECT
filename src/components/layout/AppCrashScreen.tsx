export function AppCrashScreen({ message }: { message?: string }) {
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
      <div className="bg-white border border-red-200 rounded-lg p-6 max-w-md w-full shadow-sm">
        <h1 className="text-lg font-semibold text-red-700 mb-2">Something went wrong</h1>
        <p className="text-sm text-[#4A5568] mb-4">{message || 'An unexpected error occurred.'}</p>
        <button
          type="button"
          onClick={() => { window.location.href = '/login?clear=1'; }}
          className="bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e]"
        >
          Clear cache & open login
        </button>
      </div>
    </div>
  );
}
