export function SkeletonLine({ className = "" }) {
  return <div className={`skeleton rounded ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start gap-4">
        <div className="skeleton w-14 h-14 rounded-xl" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-7 w-32 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 items-center px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700"
        >
          <div className="skeleton w-9 h-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-4 w-36 rounded" />
            <div className="skeleton h-3 w-24 rounded" />
          </div>
          <div className="skeleton h-6 w-16 rounded-full" />
          <div className="skeleton h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
