import { Clock } from "lucide-react";

export default function TdsCalculation() {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900/50 p-8 shadow-sm text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
        <Clock size={40} />
      </div>
      <h2 className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
        TDS Calculation
      </h2>
      <p className="max-w-md text-gray-500 dark:text-gray-400">
        This feature is currently under development and will be available soon. Check back later for updates!
      </p>
    </div>
  );
}
