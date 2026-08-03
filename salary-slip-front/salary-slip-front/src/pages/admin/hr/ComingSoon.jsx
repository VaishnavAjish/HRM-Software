import { Construction } from "lucide-react";

export default function ComingSoon({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 py-24 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 mb-4">
        <Construction size={26} />
      </div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
        {description || "This section is planned for a future update and isn't available yet."}
      </p>
    </div>
  );
}
