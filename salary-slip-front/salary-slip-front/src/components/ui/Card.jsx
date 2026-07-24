export default function Card({ children, className = "", padding = true }) {
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm ${padding ? "p-6" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({ title, value, icon, color, change, subtitle }) {
  const colors = {
    blue: {
      bg: "bg-brand-50 dark:bg-brand-900/20",
      icon: "text-brand-600 dark:text-brand-400",
      border: "border-brand-100 dark:border-brand-800",
    },
    green: {
      bg: "bg-green-50 dark:bg-green-900/20",
      icon: "text-green-600 dark:text-green-400",
      border: "border-green-100 dark:border-green-800",
    },
    yellow: {
      bg: "bg-yellow-50 dark:bg-yellow-900/20",
      icon: "text-yellow-600 dark:text-yellow-400",
      border: "border-yellow-100 dark:border-yellow-800",
    },
    purple: {
      bg: "bg-purple-50 dark:bg-purple-900/20",
      icon: "text-purple-600 dark:text-purple-400",
      border: "border-purple-100 dark:border-purple-800",
    },
    red: {
      bg: "bg-red-50 dark:bg-red-900/20",
      icon: "text-red-600 dark:text-red-400",
      border: "border-red-100 dark:border-red-800",
    },
  };
  const c = colors[color] || colors.blue;

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl border ${c.border} shadow-sm p-6 flex items-start gap-4`}
    >
      <div className={`p-3 rounded-xl ${c.bg}`}>
        <span className={`text-2xl ${c.icon}`}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          {title}
        </p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5 truncate">
          {value}
        </p>
        {(change || subtitle) && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {change && (
              <span
                className={`font-medium mr-1 ${change > 0 ? "text-green-600" : "text-red-500"}`}
              >
                {change > 0 ? "+" : ""}
                {change}%
              </span>
            )}
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
