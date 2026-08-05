interface SkeletonCardProps {
  count?: number;
}

export function SkeletonCard({ count = 1 }: SkeletonCardProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="flex items-start gap-3">
            <div className="skeleton w-10 h-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-2/3 rounded" />
          </div>
          <div className="mt-3 pt-3 border-t border-[#F3F4F6] flex gap-4">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton h-3 w-16 rounded ml-auto" />
          </div>
        </div>
      ))}
    </>
  );
}

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <SkeletonCard count={count} />
    </div>
  );
}

export function SkeletonRow({ count = 5 }: { count?: number }) {
  return (
    <div className="table-container">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-head">
              {Array.from({ length: 5 }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <div className="skeleton h-4 w-20 rounded" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {Array.from({ length: count }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="skeleton h-4 rounded" style={{ width: `${60 + Math.random() * 30}%` }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SkeletonSummaryCards({ count = 3 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-1 ${count === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-7 w-32 rounded mt-2" />
          <div className="skeleton h-1 w-full rounded mt-2" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-3 flex items-center gap-3">
          <div className="skeleton w-8 h-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-4 w-1/3 rounded" />
            <div className="skeleton h-3 w-1/4 rounded" />
          </div>
          <div className="skeleton h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
