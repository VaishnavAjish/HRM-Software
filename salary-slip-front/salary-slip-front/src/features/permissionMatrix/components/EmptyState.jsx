import { Inbox } from "lucide-react";

export default function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 rounded-full bg-gray-100 p-3 text-gray-400 dark:bg-gray-700/60 dark:text-gray-500">
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      {description && (
        <div className="mt-1.5 max-w-md text-xs text-gray-500 dark:text-gray-400">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
